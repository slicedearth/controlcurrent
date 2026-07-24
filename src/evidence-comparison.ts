import { canonicalJson } from "./canonical";
import {
  type AssuranceFinding,
  type CompositeAssessment,
  type EvidenceComparisonEvent,
  type EvidenceReportComparison,
  type ResponseContextReport,
  evidenceComparisonEventSchema,
  evidenceReportComparisonSchema
} from "./contracts";
import { validateEvidenceReport } from "./evidence-report";

const MAX_EMITTED_EVENTS = 512;
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
  if (
    ["not_evaluated", "not_applicable"].includes(beforeState) ||
    ["not_evaluated", "not_applicable"].includes(afterState)
  ) {
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
  if (
    ["not_evaluated", "not_applicable"].includes(beforeState) ||
    ["not_evaluated", "not_applicable"].includes(afterState)
  ) {
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

function findingEvents(
  beforeItems: readonly AssuranceFinding[],
  afterItems: readonly AssuranceFinding[],
  prefix: string
): EventPayload[] {
  const payloads: EventPayload[] = [];
  const before = new Map(beforeItems.map((finding) => [finding.controlId, finding]));
  const after = new Map(afterItems.map((finding) => [finding.controlId, finding]));
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const previous = before.get(key);
    const current = after.get(key);
    const eventKey = `${prefix}finding:${key}`;
    if (!previous || !current) {
      payloads.push({
        type: "evidence_became_incomparable",
        key: eventKey,
        beforeState: previous?.state ?? "absent",
        afterState: current?.state ?? "absent",
        summary: `The ${key} finding is not present in both reports.`
      });
      continue;
    }
    if (previous.state !== current.state) {
      payloads.push({
        type: findingTransition(previous.state, current.state),
        key: eventKey,
        beforeState: previous.state,
        afterState: current.state,
        summary: `${key} changed from ${previous.state} to ${current.state}.`
      });
      continue;
    }
    if (canonicalJson(previous, 0) !== canonicalJson(current, 0)) {
      payloads.push({
        type: "finding_changed",
        key: eventKey,
        beforeState: previous.state,
        afterState: current.state,
        summary: `${key} retained its ${current.state} state but its reduced evidence detail changed.`
      });
    }
  }
  return payloads;
}

function compositeEvents(
  beforeItems: readonly CompositeAssessment[],
  afterItems: readonly CompositeAssessment[],
  prefix: string
): EventPayload[] {
  const payloads: EventPayload[] = [];
  const before = new Map(beforeItems.map((item) => [item.id, item]));
  const after = new Map(afterItems.map((item) => [item.id, item]));
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const previous = before.get(key);
    const current = after.get(key);
    const eventKey = `${prefix}composite:${key}`;
    if (!previous || !current) {
      payloads.push({
        type: "evidence_became_incomparable",
        key: eventKey,
        beforeState: previous?.state ?? "absent",
        afterState: current?.state ?? "absent",
        summary: `The ${key} composite is not present in both reports.`
      });
      continue;
    }
    if (previous.state !== current.state) {
      payloads.push({
        type: compositeTransition(previous.state, current.state),
        key: eventKey,
        beforeState: previous.state,
        afterState: current.state,
        summary: `${key} changed from ${previous.state} to ${current.state}.`
      });
      continue;
    }
    if (canonicalJson(previous, 0) !== canonicalJson(current, 0)) {
      payloads.push({
        type: "composite_changed",
        key: eventKey,
        beforeState: previous.state,
        afterState: current.state,
        summary: `${key} retained its ${current.state} state but its reduced requirements or explanation changed.`
      });
    }
  }
  return payloads;
}

function responseContextKey(context: ResponseContextReport): string {
  return `${context.surfaceId}:${context.variantId}:${String(context.sequence)}`;
}

function responseContextEvents(
  beforeItems: readonly ResponseContextReport[],
  afterItems: readonly ResponseContextReport[]
): EventPayload[] {
  const payloads: EventPayload[] = [];
  const before = new Map(beforeItems.map((context) => [responseContextKey(context), context]));
  const after = new Map(afterItems.map((context) => [responseContextKey(context), context]));
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const previous = before.get(key);
    const current = after.get(key);
    if (!previous || !current) {
      payloads.push({
        type: current ? "response_context_added" : "response_context_removed",
        key: `response:${key}`,
        beforeState: previous?.outcome ?? "absent",
        afterState: current?.outcome ?? "absent",
        summary: `Response context ${key} is not present in both reports.`
      });
      continue;
    }
    if (canonicalJson(previous, 0) !== canonicalJson(current, 0)) {
      payloads.push({
        type: "response_context_changed",
        key: `response:${key}`,
        beforeState: previous.outcome,
        afterState: current.outcome,
        summary: `Response context ${key} changed its bounded status, content, cache, authentication, redirect, or error evidence.`
      });
    }
  }
  return payloads;
}

export async function compareEvidenceReports(
  beforeInput: unknown,
  afterInput: unknown
): Promise<EvidenceReportComparison> {
  const before = await validateEvidenceReport(beforeInput);
  const after = await validateEvidenceReport(afterInput);
  const payloads: EventPayload[] = [];
  const compatibilityReasons: string[] = [];

  if (before.provenance.analyserVersion !== after.provenance.analyserVersion) {
    compatibilityReasons.push("Evidence analyser versions differ.");
    payloads.push({
      type: "evidence_became_incomparable",
      key: "model:analyser-version",
      beforeState: before.provenance.analyserVersion,
      afterState: after.provenance.analyserVersion,
      summary: "The reports were produced by different evidence analyser versions."
    });
  }
  if (before.provenance.catalogueVersion !== after.provenance.catalogueVersion) {
    compatibilityReasons.push("Control catalogue versions differ.");
    payloads.push({
      type: "evidence_became_incomparable",
      key: "model:catalogue-version",
      beforeState: before.provenance.catalogueVersion,
      afterState: after.provenance.catalogueVersion,
      summary: "The reports were produced against different control catalogue versions."
    });
  }
  if (before.identity.subject.applicationId !== after.identity.subject.applicationId) {
    compatibilityReasons.push("Evidence application identities differ.");
    payloads.push({
      type: "evidence_became_incomparable",
      key: "identity:application-id",
      beforeState: before.identity.subject.applicationId,
      afterState: after.identity.subject.applicationId,
      summary: "The reports describe different application identities."
    });
  }
  if (before.identity.subject.environment !== after.identity.subject.environment) {
    compatibilityReasons.push("Evidence environments differ.");
    payloads.push({
      type: "evidence_became_incomparable",
      key: "identity:environment",
      beforeState: before.identity.subject.environment,
      afterState: after.identity.subject.environment,
      summary: "The reports describe different deployment environments."
    });
  }
  if (before.scopeInventory.state !== after.scopeInventory.state) {
    compatibilityReasons.push("Scope inventory presence differs.");
    payloads.push({
      type: "evidence_became_incomparable",
      key: "scope:inventory-presence",
      beforeState: before.scopeInventory.state,
      afterState: after.scopeInventory.state,
      summary: "Only one report is bound to a reduced scope inventory."
    });
  } else if (
    before.scopeInventory.state === "present" &&
    after.scopeInventory.state === "present" &&
    before.scopeInventory.fingerprint !== after.scopeInventory.fingerprint
  ) {
    compatibilityReasons.push("Scope inventory fingerprints differ.");
    payloads.push({
      type: "evidence_became_incomparable",
      key: "scope:inventory-fingerprint",
      beforeState: before.scopeInventory.fingerprint,
      afterState: after.scopeInventory.fingerprint,
      summary: "The reports were produced against different scope inventories."
    });
  }

  const compatible = compatibilityReasons.length === 0;
  if (compatible) {
    payloads.push(...responseContextEvents(before.responseContexts, after.responseContexts));
    payloads.push(...findingEvents(before.findings, after.findings, ""));
    payloads.push(...compositeEvents(before.composites, after.composites, ""));

    const beforeCoverage = new Map(
      before.surfaceCoverage.map((surface) => [surface.surfaceId, surface])
    );
    const afterCoverage = new Map(
      after.surfaceCoverage.map((surface) => [surface.surfaceId, surface])
    );
    for (const key of [...new Set([...beforeCoverage.keys(), ...afterCoverage.keys()])].sort()) {
      const previous = beforeCoverage.get(key);
      const current = afterCoverage.get(key);
      if (!previous || !current) {
        payloads.push({
          type:
            current?.state === "gap"
              ? "surface_gap_added"
              : previous?.state === "gap"
                ? "surface_gap_resolved"
                : "surface_changed",
          key: `surface:${key}:coverage`,
          beforeState: previous?.state ?? "absent",
          afterState: current?.state ?? "absent",
          summary: `Expected surface ${key} is not present in both reports.`
        });
        continue;
      }
      if (previous.state !== current.state) {
        payloads.push({
          type:
            previous.state === "complete" && current.state === "gap"
              ? "surface_gap_added"
              : previous.state === "gap" && current.state === "complete"
                ? "surface_gap_resolved"
                : "surface_changed",
          key: `surface:${key}:coverage`,
          beforeState: previous.state,
          afterState: current.state,
          summary: `Expected surface ${key} changed from ${previous.state} to ${current.state}.`
        });
      } else if (canonicalJson(previous, 0) !== canonicalJson(current, 0)) {
        payloads.push({
          type: "surface_changed",
          key: `surface:${key}:coverage`,
          beforeState: previous.state,
          afterState: current.state,
          summary: `Expected surface ${key} retained its state but its evidence coverage changed.`
        });
      }
    }

    const beforeAssessments = new Map(
      before.surfaceAssessments.map((surface) => [surface.surfaceId, surface])
    );
    const afterAssessments = new Map(
      after.surfaceAssessments.map((surface) => [surface.surfaceId, surface])
    );
    for (const key of [
      ...new Set([...beforeAssessments.keys(), ...afterAssessments.keys()])
    ].sort()) {
      const previous = beforeAssessments.get(key);
      const current = afterAssessments.get(key);
      if (!previous || !current) {
        payloads.push({
          type: "evidence_became_incomparable",
          key: `surface:${key}:policy`,
          beforeState: previous ? "present" : "absent",
          afterState: current ? "present" : "absent",
          summary: `Surface policy ${key} is not present in both reports.`
        });
        continue;
      }
      if (
        previous.role !== current.role ||
        canonicalJson(previous.requiredControls, 0) !==
          canonicalJson(current.requiredControls, 0) ||
        canonicalJson(previous.requiredComposites, 0) !==
          canonicalJson(current.requiredComposites, 0)
      ) {
        payloads.push({
          type: "surface_changed",
          key: `surface:${key}:policy`,
          beforeState: previous.role,
          afterState: current.role,
          summary: `Surface ${key} changed role or required policy targets.`
        });
      }
      payloads.push(
        ...findingEvents(previous.findings, current.findings, `surface:${key}:`),
        ...compositeEvents(previous.composites, current.composites, `surface:${key}:`)
      );
    }

    for (const key of Object.keys(before.coverage).sort() as (keyof typeof before.coverage)[]) {
      if (before.coverage[key] === after.coverage[key]) continue;
      payloads.push({
        type: "coverage_changed",
        key: `coverage:${key}`,
        beforeState: String(before.coverage[key]),
        afterState: String(after.coverage[key]),
        summary: `Reduced evidence coverage for ${key} changed.`
      });
    }
  }

  payloads.sort(
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
  const emittedPayloads = payloads.slice(0, MAX_EMITTED_EVENTS);
  const events = await Promise.all(emittedPayloads.map((payload) => event(payload)));

  return evidenceReportComparisonSchema.parse({
    schemaVersion: 4,
    beforeName: before.name,
    afterName: after.name,
    compatible,
    compatibilityReasons,
    beforeIdentity: before.identity,
    afterIdentity: after.identity,
    beforeScopeInventory: before.scopeInventory,
    afterScopeInventory: after.scopeInventory,
    beforeProvenance: before.provenance,
    afterProvenance: after.provenance,
    summary: {
      regressions: payloads.filter((item) => regressionTypes.has(item.type)).length,
      resolutions: payloads.filter((item) => resolutionTypes.has(item.type)).length,
      changed: payloads.filter(
        (item) =>
          !regressionTypes.has(item.type) &&
          !resolutionTypes.has(item.type) &&
          !incomparableTypes.has(item.type)
      ).length,
      incomparable: payloads.filter((item) => incomparableTypes.has(item.type)).length,
      totalEvents: payloads.length,
      emittedEvents: events.length,
      truncated: payloads.length > events.length
    },
    events
  });
}
