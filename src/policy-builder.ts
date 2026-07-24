import { canonicalJson } from "./canonical";
import { SECURITY_CONTROLS } from "./catalogue";
import {
  type DeploymentProfile,
  type PolicyException,
  type PolicyProfile,
  policyProfileSchema
} from "./contracts";

export const MAX_POLICY_EXPORT_BYTES = 128 * 1_024;

export function buildPolicyProfile(input: {
  profile: DeploymentProfile;
  requiredControls: readonly string[];
  rules: PolicyProfile["rules"];
  exceptions: readonly PolicyException[];
}): PolicyProfile {
  const knownControls = new Set<string>(SECURITY_CONTROLS.map((control) => control.id));
  for (const controlId of input.requiredControls) {
    if (!knownControls.has(controlId)) throw new Error(`Unknown required feature: ${controlId}.`);
  }
  const requiredControls = new Set(input.requiredControls);
  const selectedBrowsers = new Set(input.profile.baselines.map((baseline) => baseline.browser));
  for (const exception of input.exceptions) {
    if (!requiredControls.has(exception.controlId)) {
      throw new Error("Every exception must refer to a required security feature.");
    }
    if (exception.browsers?.some((browser) => !selectedBrowsers.has(browser))) {
      throw new Error("Every exception browser must be included in the browser plan.");
    }
  }
  return policyProfileSchema.parse({
    schemaVersion: 1,
    name: input.profile.name,
    baselines: input.profile.baselines,
    requiredControls: input.requiredControls,
    rules: input.rules,
    exceptions: input.exceptions
  });
}

export function exportPolicyProfile(input: unknown): string {
  const serialised = canonicalJson(policyProfileSchema.parse(input));
  if (new TextEncoder().encode(serialised).byteLength > MAX_POLICY_EXPORT_BYTES) {
    throw new Error(`Policy export exceeds the ${String(MAX_POLICY_EXPORT_BYTES)}-byte limit.`);
  }
  return serialised;
}
