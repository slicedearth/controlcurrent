import { type DeploymentProfile, deploymentProfileSchema } from "./contracts";
import { canonicalJson } from "./canonical";

export const PROFILE_STORAGE_KEY = "controlcurrent.profile.v1";
export const MAX_PROFILE_BYTES = 4_096;

export type BoundedStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type StoredProfileResult =
  | { state: "absent" }
  | { state: "loaded"; profile: DeploymentProfile }
  | { state: "invalid"; reason: string }
  | { state: "future_version"; version: number };

export function saveProfile(storage: BoundedStorage, profileInput: unknown): void {
  const profile = deploymentProfileSchema.parse(profileInput);
  const serialised = canonicalJson(profile, 0).trimEnd();
  if (new TextEncoder().encode(serialised).byteLength > MAX_PROFILE_BYTES) {
    throw new Error(`Profile exceeds the ${String(MAX_PROFILE_BYTES)}-byte storage limit.`);
  }
  storage.setItem(PROFILE_STORAGE_KEY, serialised);
}

export function loadProfile(storage: BoundedStorage): StoredProfileResult {
  const serialised = storage.getItem(PROFILE_STORAGE_KEY);
  if (serialised === null) return { state: "absent" };
  if (new TextEncoder().encode(serialised).byteLength > MAX_PROFILE_BYTES) {
    return { state: "invalid", reason: "Stored profile exceeds the byte limit." };
  }

  try {
    const parsed: unknown = JSON.parse(serialised);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "schemaVersion" in parsed &&
      typeof parsed.schemaVersion === "number" &&
      parsed.schemaVersion > 1
    ) {
      return { state: "future_version", version: parsed.schemaVersion };
    }
    const result = deploymentProfileSchema.safeParse(parsed);
    return result.success
      ? { state: "loaded", profile: result.data }
      : { state: "invalid", reason: "Stored profile does not match the current schema." };
  } catch {
    return { state: "invalid", reason: "Stored profile is not valid JSON." };
  }
}

export function clearProfile(storage: BoundedStorage): void {
  storage.removeItem(PROFILE_STORAGE_KEY);
}
