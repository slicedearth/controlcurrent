import { describe, expect, it } from "vitest";
import {
  clearProfile,
  loadProfile,
  MAX_PROFILE_BYTES,
  PROFILE_STORAGE_KEY,
  saveProfile,
  type BoundedStorage
} from "../src/profile-storage";

class MemoryStorage implements BoundedStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const profile = {
  schemaVersion: 1 as const,
  name: "Supported browsers",
  baselines: [
    { browser: "chrome" as const, minimumVersion: "120" },
    { browser: "firefox" as const, minimumVersion: "115" }
  ]
};

describe("bounded local profile storage", () => {
  it("remains absent until the visitor deliberately saves", () => {
    const storage = new MemoryStorage();
    expect(loadProfile(storage)).toEqual({ state: "absent" });
    saveProfile(storage, profile);
    expect(loadProfile(storage)).toEqual({ state: "loaded", profile });
    clearProfile(storage);
    expect(loadProfile(storage)).toEqual({ state: "absent" });
  });

  it("refuses future, invalid, and oversized values", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ schemaVersion: 2 }));
    expect(loadProfile(storage)).toEqual({ state: "future_version", version: 2 });
    storage.setItem(PROFILE_STORAGE_KEY, "{");
    expect(loadProfile(storage).state).toBe("invalid");
    storage.setItem(PROFILE_STORAGE_KEY, "x".repeat(MAX_PROFILE_BYTES + 1));
    expect(loadProfile(storage).state).toBe("invalid");
  });

  it("rejects duplicate browser baselines", () => {
    const storage = new MemoryStorage();
    expect(() =>
      saveProfile(storage, {
        ...profile,
        baselines: [profile.baselines[0], profile.baselines[0]]
      })
    ).toThrow(/Duplicate browser baseline/u);
  });
});
