import { SECURITY_CONTROLS } from "./catalogue";
import {
  type MinimumBaselineResult,
  minimumBaselineRequestSchema,
  selectedSnapshotSchema
} from "./contracts";
import { evaluateControl } from "./evaluate";

const DEPLOYABLE_RELEASE_STATES = new Set(["retired", "current", "esr"]);

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

    const releases = snapshot.browsers[browser].releases.filter(
      (release) => DEPLOYABLE_RELEASE_STATES.has(release.status) && release.releaseDate
    );
    for (const release of releases) {
      const blockers = controls.filter((control) => {
        const outcome = evaluateControl(control, snapshot, {
          browser,
          minimumVersion: release.version
        }).outcome;
        return request.allowQualified
          ? outcome !== "available_unqualified" && outcome !== "available_with_qualification"
          : outcome !== "available_unqualified";
      });
      if (blockers.length === 0) {
        return {
          browser,
          status: "found" as const,
          minimumVersion: release.version,
          releaseDate: release.releaseDate,
          blockers: []
        };
      }
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
