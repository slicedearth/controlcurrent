import { canonicalJson } from "./canonical";
import type { EvidencePolicyProfile } from "./contracts";

export type EvidencePolicyDrift = {
  type: "regression" | "resolution" | "changed";
  key: string;
  summary: string;
};

/** Policy changes are distinct from changes to the supplied factual evidence. */
export function compareEvidencePolicyProfiles(
  before: EvidencePolicyProfile,
  after: EvidencePolicyProfile
): EvidencePolicyDrift[] {
  const events: EvidencePolicyDrift[] = [];
  const emit = (key: string, type: EvidencePolicyDrift["type"]) =>
    events.push({
      key: `policy:${key}`,
      type,
      summary: `Evidence policy ${key} ${type === "regression" ? "was relaxed or replaced and requires review" : type === "resolution" ? "was strengthened" : "changed"}.`
    });
  const sets = (
    key: string,
    left: readonly string[],
    right: readonly string[],
    removalWeakens: boolean
  ) => {
    if (left.some((item) => !right.includes(item)))
      emit(`${key}:removed`, removalWeakens ? "regression" : "resolution");
    if (right.some((item) => !left.includes(item)))
      emit(`${key}:added`, removalWeakens ? "changed" : "regression");
  };
  sets(
    "surfaces",
    before.surfaces.map((s) => s.id),
    after.surfaces.map((s) => s.id),
    true
  );
  for (const left of before.surfaces) {
    const right = after.surfaces.find((s) => s.id === left.id);
    if (!right) continue;
    for (const field of ["requiredEvidence", "requiredControls", "requiredComposites"] as const)
      sets(`surface:${left.id}:${field}`, left[field], right[field], true);
    if (left.role !== right.role) emit(`surface:${left.id}:role`, "changed");
  }
  for (const rule of Object.keys(before.rules) as (keyof EvidencePolicyProfile["rules"])[]) {
    if (before.rules[rule] !== after.rules[rule])
      emit(`rules:${rule}`, after.rules[rule] === "fail" ? "resolution" : "regression");
  }
  // Unknown replacements in trust, identity or scope require review rather than being treated as factual remediation.
  for (const field of ["attestation", "scopeInventory", "identity"] as const) {
    if (canonicalJson(before[field]) !== canonicalJson(after[field])) emit(field, "regression");
  }
  for (const field of [
    "expectedAnalyserVersion",
    "expectedCatalogueVersion",
    "expectedBcdVersion"
  ] as const) {
    if (before[field] !== after[field]) emit(field, "regression");
  }
  const exceptionKey = (item: EvidencePolicyProfile["exceptions"][number]) =>
    `${item.surfaceId}:${item.targetKind}:${item.targetId}:${[...item.outcomes].sort().join(",")}`;
  for (const exception of after.exceptions) {
    const previous = before.exceptions.find(
      (item) => exceptionKey(item) === exceptionKey(exception)
    );
    if (!previous || exception.expiresOn > previous.expiresOn)
      emit(
        `exception:${exception.surfaceId}:${exception.targetKind}:${exception.targetId}`,
        "regression"
      );
    else if (canonicalJson(previous) !== canonicalJson(exception))
      emit(
        `exception:${exception.surfaceId}:${exception.targetKind}:${exception.targetId}`,
        "changed"
      );
  }
  for (const exception of before.exceptions) {
    if (!after.exceptions.some((item) => exceptionKey(item) === exceptionKey(exception)))
      emit(
        `exception:${exception.surfaceId}:${exception.targetKind}:${exception.targetId}:removed`,
        "resolution"
      );
  }
  return events;
}
