import type { DeploymentProfile, SelectedSnapshot } from "./contracts";
import { evaluateProfile } from "./evaluate";
import { compareProfileEvaluations } from "./profile-workflows";
import { findMinimumBaselines } from "./minimums";
import { validatePlan } from "./plan-transfer";
import { compareBrowserVersions } from "./versions";

export function comparePlans(snapshot: SelectedSnapshot, before: unknown, after: unknown) {
  return compareProfileEvaluations(
    evaluateProfile(snapshot, validatePlan(snapshot, before)),
    evaluateProfile(snapshot, validatePlan(snapshot, after))
  );
}

export function suggestPlanUpgrade(
  snapshot: SelectedSnapshot,
  input: unknown,
  controlIds: string[],
  allowQualified: boolean
) {
  const profile = validatePlan(snapshot, input);
  if (controlIds.length === 0) throw new Error("Choose at least one required feature.");
  const minimums = findMinimumBaselines(snapshot, {
    controlIds,
    browsers: profile.baselines.map((baseline) => baseline.browser),
    allowQualified
  });
  if (minimums.some((result) => result.status !== "found" || !result.minimumVersion))
    return { minimums };
  const baselines = profile.baselines.map((baseline) => {
    const minimum = minimums.find((result) => result.browser === baseline.browser)?.minimumVersion;
    if (!minimum) throw new Error("A selected browser is missing from the minimum calculation.");
    const relation = compareBrowserVersions(baseline.minimumVersion, minimum);
    if (relation === "unknown") throw new Error("The proposed minimum cannot be compared.");
    return {
      ...baseline,
      minimumVersion: relation === "before" ? minimum : baseline.minimumVersion
    };
  });
  const proposed: DeploymentProfile = { ...profile, baselines };
  return { minimums, profile: validatePlan(snapshot, proposed) };
}
