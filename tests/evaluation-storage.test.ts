import { describe, expect, it } from "vitest";
import { selectedSnapshot } from "../src/data";
import { evaluateProfile } from "../src/evaluate";
import {
  clearEvaluation,
  EVALUATION_STORAGE_KEY,
  loadEvaluation,
  MAX_EVALUATION_BYTES,
  saveEvaluation,
  summariseEvaluationUpdate,
  type EvaluationStorage
} from "../src/evaluation-storage";

class MemoryStorage implements EvaluationStorage {
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

const evaluation = evaluateProfile(selectedSnapshot, {
  schemaVersion: 1,
  name: "Production browser minimums",
  baselines: [
    { browser: "chrome", minimumVersion: "120" },
    { browser: "firefox", minimumVersion: "115" }
  ]
});

describe("opt-in evaluation storage", () => {
  it("stores and clears one bounded validated result", () => {
    const storage = new MemoryStorage();
    expect(loadEvaluation(storage)).toEqual({ state: "absent" });
    saveEvaluation(storage, evaluation);
    expect(loadEvaluation(storage)).toEqual({ state: "loaded", evaluation });
    clearEvaluation(storage);
    expect(loadEvaluation(storage)).toEqual({ state: "absent" });
  });

  it("preserves future-version, invalid, and oversized distinctions", () => {
    const storage = new MemoryStorage();
    storage.setItem(EVALUATION_STORAGE_KEY, JSON.stringify({ schemaVersion: 2 }));
    expect(loadEvaluation(storage)).toEqual({ state: "future_version", version: 2 });
    storage.setItem(EVALUATION_STORAGE_KEY, "{");
    expect(loadEvaluation(storage).state).toBe("invalid");
    storage.setItem(EVALUATION_STORAGE_KEY, "x".repeat(MAX_EVALUATION_BYTES + 1));
    expect(loadEvaluation(storage).state).toBe("invalid");
  });

  it("separates unchanged sources, different plans, and source updates", () => {
    expect(summariseEvaluationUpdate(evaluation, evaluation)).toMatchObject({
      state: "same_source",
      bcdVersion: selectedSnapshot.bcdVersion
    });
    expect(
      summariseEvaluationUpdate(evaluation, {
        ...evaluation,
        profile: { ...evaluation.profile, name: "A different plan" }
      })
    ).toMatchObject({ state: "different_profile" });

    const firstControl = Object.keys(evaluation.results)[0];
    if (!firstControl) throw new Error("Expected an evaluated security feature.");
    const firstResult = evaluation.results[firstControl]?.[0];
    if (!firstResult) throw new Error("Expected an evaluated browser result.");
    const updated = {
      ...evaluation,
      bcdVersion: "8.0.8",
      results: {
        ...evaluation.results,
        [firstControl]: [
          {
            ...firstResult,
            outcome:
              firstResult.outcome === "available_unqualified"
                ? ("available_with_qualification" as const)
                : ("available_unqualified" as const)
          },
          ...(evaluation.results[firstControl]?.slice(1) ?? [])
        ]
      }
    };
    expect(summariseEvaluationUpdate(evaluation, updated)).toMatchObject({
      state: "source_updated",
      previousBcdVersion: "8.0.7",
      currentBcdVersion: "8.0.8",
      changed: 1
    });
  });
});
