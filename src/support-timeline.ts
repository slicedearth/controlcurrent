import type { BrowserId, Outcome, SelectedSnapshot } from "./contracts";
import { getControl } from "./catalogue";
import { evaluateFeature, recordedReleasedVersions } from "./evaluate";

export type SupportInterval = {
  first: string;
  last: string;
  releases: number;
  outcome: Outcome;
  qualifications: string[];
};

/** Points describe retained releases; they do not fill gaps or predict later versions. */
export function supportTimeline(snapshot: SelectedSnapshot, controlId: string, browser: BrowserId) {
  const control = getControl(controlId);
  if (!control) throw new Error("Unknown timeline control.");
  const releases = recordedReleasedVersions(snapshot, browser);
  return control.bcdPaths.map((path) => {
    const feature = snapshot.features[path];
    const intervals: SupportInterval[] = [];
    for (const release of releases ?? []) {
      const result = feature
        ? evaluateFeature(feature, { browser, minimumVersion: release.version })
        : {
            outcome: "source_inconsistent" as const,
            qualifications: ["The mapped feature is missing."]
          };
      const previous = intervals.at(-1);
      if (
        previous?.outcome === result.outcome &&
        JSON.stringify(previous.qualifications) === JSON.stringify(result.qualifications)
      ) {
        previous.last = release.version;
        previous.releases += 1;
      } else {
        intervals.push({
          first: release.version,
          last: release.version,
          releases: 1,
          outcome: result.outcome,
          qualifications: [...result.qualifications]
        });
      }
    }
    return { path, intervals };
  });
}
