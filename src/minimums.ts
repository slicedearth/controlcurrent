import { SECURITY_CONTROLS } from "./catalogue";
import {
  type MinimumBaselineResult,
  minimumBaselineRequestSchema,
  selectedSnapshotSchema
} from "./contracts";
import { evaluateControl, recordedReleasedVersions } from "./evaluate";

export function findMinimumBaselines(
  snapshotInput: unknown,
  requestInput: unknown
): MinimumBaselineResult[] {
  const snapshot = selectedSnapshotSchema.parse(snapshotInput);
  const request = minimumBaselineRequestSchema.parse(requestInput);
  const controls = request.controlIds.map((controlId) => {
    const control = SECURITY_CONTROLS.find((candidate) => candidate.id === controlId);
    if (!control) throw new Error(`Unknown control: ${controlId}`);
    return control;
  });

  return request.browsers.map((browser) => {
    const unsupported = controls
      .filter((control) => control.mappingState === "unsupported")
      .map((control) => control.id);
    if (unsupported.length > 0) {
      return {
        browser,
        status: "unsupported_mapping" as const,
        blockers: unsupported
      };
    }

    const releases = recordedReleasedVersions(snapshot, browser);
    if (!releases)
      return {
        browser,
        status: "source_inconsistent" as const,
        blockers: controls.map((control) => control.id)
      };
    const blockersAt = (minimumVersion: string) =>
      controls.filter((control) => {
        const outcome = evaluateControl(control, snapshot, {
          browser,
          minimumVersion
        }).outcome;
        return request.allowQualified
          ? outcome !== "available_unqualified" && outcome !== "available_with_qualification"
          : outcome !== "available_unqualified";
      });
    // Each candidate covers a released suffix. Once that suffix is acceptable,
    // removing older releases cannot introduce a new support gap. Find its first
    // acceptable member without rescanning every overlapping suffix quadratically.
    let start = 0;
    let end = releases.length;
    while (start < end) {
      const middle = Math.floor((start + end) / 2);
      const release = releases[middle];
      if (!release) throw new Error("Missing bounded release candidate");
      if (blockersAt(release.version).length === 0) end = middle;
      else start = middle + 1;
    }
    const minimum = releases[start];
    if (minimum) {
      return {
        browser,
        status: "found" as const,
        minimumVersion: minimum.version,
        releaseDate: minimum.releaseDate,
        blockers: []
      };
    }

    const current = releases.at(-1);
    const blockers = current
      ? controls
          .filter((control) => {
            const outcome = evaluateControl(control, snapshot, {
              browser,
              minimumVersion: current.version
            }).outcome;
            return request.allowQualified
              ? outcome !== "available_unqualified" && outcome !== "available_with_qualification"
              : outcome !== "available_unqualified";
          })
          .map((control) => control.id)
      : controls.map((control) => control.id);
    const sourceIssue = blockers.some((controlId) => {
      const control = controls.find((candidate) => candidate.id === controlId);
      return (
        control &&
        current &&
        evaluateControl(control, snapshot, {
          browser,
          minimumVersion: current.version
        }).outcome === "source_inconsistent"
      );
    });

    return {
      browser,
      status: sourceIssue ? ("source_inconsistent" as const) : ("unavailable" as const),
      blockers
    };
  });
}
