import { canonicalJson } from "./canonical";
import {
  type EvidenceComparisonEvent,
  type EvidenceReportComparison,
  evidenceBundleReportSchema,
  evidenceComparisonEventSchema,
  evidenceReportComparisonSchema
} from "./contracts";

type EventPayload = Omit<EvidenceComparisonEvent, "id">;

async function eventId(payload: EventPayload): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload, 0));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

async function event(payload: EventPayload): Promise<EvidenceComparisonEvent> {
  return evidenceComparisonEventSchema.parse({ ...payload, id: await eventId(payload) });
}

function findingTransition(
  beforeState: string,
  afterState: string
): EvidenceComparisonEvent["type"] {
  if (beforeState === "not_evaluated" || afterState === "not_evaluated") {
    return "evidence_became_incomparable";
  }
  if (beforeState === "observed" && afterState !== "observed") return "finding_regressed";
  if (beforeState !== "observed" && afterState === "observed") return "finding_resolved";
  return "finding_changed";
}

function compositeTransition(
  beforeState: string,
  afterState: string
): EvidenceComparisonEvent["type"] {
  if (beforeState === "not_evaluated" || afterState === "not_evaluated") {
    return "evidence_became_incomparable";
  }
  if (beforeState === "satisfied" && afterState !== "satisfied") {
    return "composite_regressed";
  }
  if (beforeState !== "satisfied" && afterState === "satisfied") {
    return "composite_resolved";
  }
  return "composite_changed";
}

export async function compareEvidenceReports(
  beforeInput: unknown,
  afterInput: unknown
): Promise<EvidenceReportComparison> {
  const before = evidenceBundleReportSchema.parse(beforeInput);
  const after = evidenceBundleReportSchema.parse(afterInput);
  const payloads: EventPayload[] = [];
  const beforeFindings = new Map(before.findings.map((finding) => [finding.controlId, finding]));
  const afterFindings = new Map(after.findings.map((finding) => [finding.controlId, finding]));

  for (const key of [...new Set([...beforeFindings.keys(), ...afterFindings.keys()])].sort()) {
    const previous = beforeFindings.get(key);
    const current = afterFindings.get(key);
    if (!previous || !current) {
      payloads.push({
        type: "evidence_became_incomparable",
        key: `finding:${key}`,
        beforeState: previous?.state ?? "absent",
        afterState: current?.state ?? "absent",
        summary: `The ${key} finding is not present in both reports.`
      });
      continue;
    }
    if (previous.state === current.state) continue;
    payloads.push({
      type: findingTransition(previous.state, current.state),
      key: `finding:${key}`,
      beforeState: previous.state,
      afterState: current.state,
      summary: `${key} changed from ${previous.state} to ${current.state}.`
    });
  }

  const beforeComposites = new Map(before.composites.map((item) => [item.id, item]));
  const afterComposites = new Map(after.composites.map((item) => [item.id, item]));
  for (const key of [...new Set([...beforeComposites.keys(), ...afterComposites.keys()])].sort()) {
    const previous = beforeComposites.get(key);
    const current = afterComposites.get(key);
    if (!previous || !current) {
      payloads.push({
        type: "evidence_became_incomparable",
        key: `composite:${key}`,
        beforeState: previous?.state ?? "absent",
        afterState: current?.state ?? "absent",
        summary: `The ${key} composite is not present in both reports.`
      });
      continue;
    }
    if (previous.state === current.state) continue;
    payloads.push({
      type: compositeTransition(previous.state, current.state),
      key: `composite:${key}`,
      beforeState: previous.state,
      afterState: current.state,
      summary: `${key} changed from ${previous.state} to ${current.state}.`
    });
  }

  const beforeSurfaces = new Map(
    before.surfaceCoverage.map((surface) => [surface.surfaceId, surface])
  );
  const afterSurfaces = new Map(
    after.surfaceCoverage.map((surface) => [surface.surfaceId, surface])
  );
  for (const key of [...new Set([...beforeSurfaces.keys(), ...afterSurfaces.keys()])].sort()) {
    const previous = beforeSurfaces.get(key);
    const current = afterSurfaces.get(key);
    if (!previous || !current) {
      payloads.push({
        type:
          current?.state === "gap"
            ? "surface_gap_added"
            : previous?.state === "gap"
              ? "surface_gap_resolved"
              : "surface_changed",
        key: `surface:${key}`,
        beforeState: previous?.state ?? "absent",
        afterState: current?.state ?? "absent",
        summary: `The expected surface ${key} is not present in both reports.`
      });
      continue;
    }
    const previousMissing = previous.missingEvidence.join(",");
    const currentMissing = current.missingEvidence.join(",");
    if (previous.state === current.state && previousMissing === currentMissing) continue;
    payloads.push({
      type:
        previous.state === "complete" && current.state === "gap"
          ? "surface_gap_added"
          : previous.state === "gap" && current.state === "complete"
            ? "surface_gap_resolved"
            : "surface_changed",
      key: `surface:${key}`,
      beforeState: previous.state,
      afterState: current.state,
      summary:
        previousMissing === currentMissing
          ? `Expected surface ${key} changed from ${previous.state} to ${current.state}.`
          : `Expected surface ${key} changed its missing evidence set.`
    });
  }

  const events = await Promise.all(payloads.map((payload) => event(payload)));
  events.sort(
    (left, right) => left.type.localeCompare(right.type) || left.key.localeCompare(right.key)
  );
  const regressionTypes = new Set([
    "finding_regressed",
    "composite_regressed",
    "surface_gap_added"
  ]);
  const resolutionTypes = new Set([
    "finding_resolved",
    "composite_resolved",
    "surface_gap_resolved"
  ]);
  const incomparableTypes = new Set(["evidence_became_incomparable"]);

  return evidenceReportComparisonSchema.parse({
    schemaVersion: 1,
    beforeName: before.name,
    afterName: after.name,
    summary: {
      regressions: events.filter((item) => regressionTypes.has(item.type)).length,
      resolutions: events.filter((item) => resolutionTypes.has(item.type)).length,
      changed: events.filter(
        (item) =>
          !regressionTypes.has(item.type) &&
          !resolutionTypes.has(item.type) &&
          !incomparableTypes.has(item.type)
      ).length,
      incomparable: events.filter((item) => incomparableTypes.has(item.type)).length
    },
    events
  });
}
