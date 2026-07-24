import { canonicalJson } from "./canonical";
import { type ProfileEvaluation, profileEvaluationSchema } from "./contracts";

export const EVALUATION_STORAGE_KEY = "controlcurrent.evaluation.v1";
export const MAX_EVALUATION_BYTES = 256 * 1_024;

export type EvaluationStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type StoredEvaluationResult =
  | { state: "absent" }
  | { state: "loaded"; evaluation: ProfileEvaluation }
  | { state: "invalid"; reason: string }
  | { state: "future_version"; version: number };

export type EvaluationUpdateSummary =
  | {
      state: "different_profile";
      previousBcdVersion: string;
      currentBcdVersion: string;
    }
  | {
      state: "same_source";
      bcdVersion: string;
      catalogueVersion: string;
    }
  | {
      state: "source_updated";
      previousBcdVersion: string;
      currentBcdVersion: string;
      previousCatalogueVersion: string;
      currentCatalogueVersion: string;
      changed: number;
      added: number;
      removed: number;
      unchanged: number;
    };

export function saveEvaluation(storage: EvaluationStorage, input: unknown): void {
  const evaluation = profileEvaluationSchema.parse(input);
  const serialised = canonicalJson(evaluation, 0).trimEnd();
  if (new TextEncoder().encode(serialised).byteLength > MAX_EVALUATION_BYTES) {
    throw new Error(`Result exceeds the ${String(MAX_EVALUATION_BYTES)}-byte storage limit.`);
  }
  storage.setItem(EVALUATION_STORAGE_KEY, serialised);
}

export function loadEvaluation(storage: EvaluationStorage): StoredEvaluationResult {
  const serialised = storage.getItem(EVALUATION_STORAGE_KEY);
  if (serialised === null) return { state: "absent" };
  if (new TextEncoder().encode(serialised).byteLength > MAX_EVALUATION_BYTES) {
    return { state: "invalid", reason: "Stored result exceeds the byte limit." };
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
    const result = profileEvaluationSchema.safeParse(parsed);
    return result.success
      ? { state: "loaded", evaluation: result.data }
      : { state: "invalid", reason: "Stored result does not match the current schema." };
  } catch {
    return { state: "invalid", reason: "Stored result is not valid JSON." };
  }
}

export function clearEvaluation(storage: EvaluationStorage): void {
  storage.removeItem(EVALUATION_STORAGE_KEY);
}

function resultMap(evaluation: ProfileEvaluation): Map<string, string> {
  const results = new Map<string, string>();
  for (const entries of Object.values(evaluation.results)) {
    for (const entry of entries) {
      results.set(`${entry.controlId}\0${entry.browser}\0${entry.minimumVersion}`, entry.outcome);
    }
  }
  return results;
}

export function summariseEvaluationUpdate(
  previousInput: unknown,
  currentInput: unknown
): EvaluationUpdateSummary {
  const previous = profileEvaluationSchema.parse(previousInput);
  const current = profileEvaluationSchema.parse(currentInput);
  if (canonicalJson(previous.profile) !== canonicalJson(current.profile)) {
    return {
      state: "different_profile",
      previousBcdVersion: previous.bcdVersion,
      currentBcdVersion: current.bcdVersion
    };
  }
  if (
    previous.bcdVersion === current.bcdVersion &&
    previous.catalogueVersion === current.catalogueVersion
  ) {
    return {
      state: "same_source",
      bcdVersion: current.bcdVersion,
      catalogueVersion: current.catalogueVersion
    };
  }
  const before = resultMap(previous);
  const after = resultMap(current);
  let changed = 0;
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const beforeOutcome = before.get(key);
    const afterOutcome = after.get(key);
    if (beforeOutcome === undefined) added += 1;
    else if (afterOutcome === undefined) removed += 1;
    else if (beforeOutcome !== afterOutcome) changed += 1;
    else unchanged += 1;
  }
  return {
    state: "source_updated",
    previousBcdVersion: previous.bcdVersion,
    currentBcdVersion: current.bcdVersion,
    previousCatalogueVersion: previous.catalogueVersion,
    currentCatalogueVersion: current.catalogueVersion,
    changed,
    added,
    removed,
    unchanged
  };
}
