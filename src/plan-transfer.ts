import { z } from "zod";
import { SECURITY_CONTROLS } from "./catalogue";
import {
  deploymentProfileSchema,
  type DeploymentProfile,
  type MinimumBaselineResult,
  type SelectedSnapshot
} from "./contracts";
import { recordedReleasedVersions } from "./evaluate";

export const MAX_PLAN_FRAGMENT = 8_192;
const transferSchema = z
  .object({
    schemaVersion: z.literal(1),
    bcdVersion: z.string().min(1).max(64),
    catalogueVersion: z.string().min(1).max(64),
    profile: deploymentProfileSchema,
    controlIds: z.array(z.string().min(1).max(80)).max(64)
  })
  .strict();

export function validatePlan(snapshot: SelectedSnapshot, input: unknown): DeploymentProfile {
  const parsed = deploymentProfileSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "Enter a plan name of 1–80 characters and include at least one browser, with one minimum per browser."
    );
  const profile = parsed.data;
  for (const baseline of profile.baselines) {
    if (
      !recordedReleasedVersions(snapshot, baseline.browser)?.some(
        (release) => release.version === baseline.minimumVersion
      )
    ) {
      throw new Error(
        `The reviewed data has no selectable ${baseline.browser} ${baseline.minimumVersion} release.`
      );
    }
  }
  return profile;
}

export function planFragment(
  snapshot: SelectedSnapshot,
  profile: DeploymentProfile,
  controlIds: string[] = []
): string {
  const transfer = transferSchema.parse({
    schemaVersion: 1,
    bcdVersion: snapshot.bcdVersion,
    catalogueVersion: snapshot.catalogueVersion,
    profile: validatePlan(snapshot, profile),
    controlIds
  });
  validateControls(transfer.controlIds);
  const fragment = `#plan=${encodeURIComponent(JSON.stringify(transfer))}`;
  if (fragment.length > MAX_PLAN_FRAGMENT)
    throw new Error("The browser plan is too large to transfer.");
  return fragment;
}

function validateControls(ids: string[]): void {
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !SECURITY_CONTROLS.some((control) => control.id === id))
  )
    throw new Error("The transferred control selection is not recognised.");
}

export function readPlanFragment(snapshot: SelectedSnapshot, fragment: string) {
  if (!fragment.startsWith("#plan=")) return undefined;
  if (fragment.length > MAX_PLAN_FRAGMENT)
    throw new Error("The transferred browser plan exceeds its limit.");
  const transfer = transferSchema.parse(
    JSON.parse(decodeURIComponent(fragment.slice(6))) as unknown
  );
  if (
    transfer.bcdVersion !== snapshot.bcdVersion ||
    transfer.catalogueVersion !== snapshot.catalogueVersion
  )
    throw new Error(
      "This plan link uses different source versions. Import a plan file to review it against this snapshot."
    );
  validatePlan(snapshot, transfer.profile);
  validateControls(transfer.controlIds);
  return transfer;
}

export function planFromMinimums(
  snapshot: SelectedSnapshot,
  results: MinimumBaselineResult[]
): DeploymentProfile {
  if (
    results.length === 0 ||
    results.some((result) => result.status !== "found" || !result.minimumVersion)
  )
    throw new Error(
      "Every selected browser needs a matching version before these minimums can become a plan."
    );
  return validatePlan(snapshot, {
    schemaVersion: 1,
    name: "Calculated browser minimums",
    baselines: results.map((result) => ({
      browser: result.browser,
      minimumVersion: result.minimumVersion
    }))
  });
}
