import { canonicalJson } from "./canonical";
import { fingerprintCanonical } from "./canonical-fingerprint";
import {
  type DecisionPacket,
  type DecisionPacketComparison,
  type DecisionPacketEvidence,
  type EvidencePolicyFinding,
  decisionPacketComparisonSchema,
  decisionPacketSchema,
  evidenceBundleReportSchema,
  evidencePolicyEvaluationSchema,
  policyEvaluationSchema
} from "./contracts";
import { compareEvidenceReports } from "./evidence-comparison";
import { validateEvidenceReport } from "./evidence-report";
import { comparePolicyEvaluations } from "./policy-comparison";

export const MAX_DECISION_PACKET_BYTES = 4 * 1_024 * 1_024;

function validDate(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(input) && !Number.isNaN(Date.parse(input));
}

export async function buildDecisionPacket(
  browserPolicyInput: unknown,
  evidenceInput: unknown,
  generatedOn: string
): Promise<DecisionPacket> {
  if (!validDate(generatedOn)) {
    throw new Error(`Invalid decision packet date: ${generatedOn}`);
  }
  const browserPolicy = policyEvaluationSchema.parse(browserPolicyInput);
  const evidence = await validateDecisionPacketEvidence(evidenceInput);
  const body = {
    schemaVersion: 1 as const,
    generatedOn,
    browserPolicy: {
      fingerprint: await fingerprintCanonical(browserPolicy),
      evaluation: browserPolicy
    },
    evidence,
    limitations: {
      combinedScore: false as const,
      browserAvailabilityIsRuntimeAssurance: false as const,
      suppliedEvidenceIsIndependentCollectionProof: false as const
    }
  };
  return decisionPacketSchema.parse({
    ...body,
    packetFingerprint: await fingerprintCanonical(body)
  });
}

export async function validateDecisionPacketEvidence(
  evidenceInput: unknown
): Promise<DecisionPacketEvidence> {
  const reducedReport = evidenceBundleReportSchema.safeParse(evidenceInput);
  if (reducedReport.success) {
    return {
      kind: "reduced_evidence_report",
      fingerprint: (await validateEvidenceReport(reducedReport.data)).reportFingerprint,
      report: reducedReport.data
    };
  }
  const evaluation = evidencePolicyEvaluationSchema.parse(evidenceInput);
  return {
    kind: "evidence_policy_evaluation",
    fingerprint: await fingerprintCanonical(evaluation),
    evaluation
  };
}

export async function exportDecisionPacket(input: unknown): Promise<string> {
  const packet = decisionPacketSchema.parse(input);
  const browserFingerprint = await fingerprintCanonical(packet.browserPolicy.evaluation);
  if (browserFingerprint !== packet.browserPolicy.fingerprint) {
    throw new Error("Decision packet browser-policy fingerprint does not match its content.");
  }
  const evidenceFingerprint =
    packet.evidence.kind === "reduced_evidence_report"
      ? (await validateEvidenceReport(packet.evidence.report)).reportFingerprint
      : await fingerprintCanonical(packet.evidence.evaluation);
  if (evidenceFingerprint !== packet.evidence.fingerprint) {
    throw new Error("Decision packet evidence fingerprint does not match its content.");
  }
  const { packetFingerprint, ...body } = packet;
  if ((await fingerprintCanonical(body)) !== packetFingerprint) {
    throw new Error("Decision packet fingerprint does not match its canonical content.");
  }
  const serialised = canonicalJson(packet);
  if (new TextEncoder().encode(serialised).byteLength > MAX_DECISION_PACKET_BYTES) {
    throw new Error(`Decision packet exceeds the ${String(MAX_DECISION_PACKET_BYTES)}-byte limit.`);
  }
  return serialised;
}

function evidencePolicyFindingKey(finding: EvidencePolicyFinding): string {
  return `${finding.surfaceId ?? "report"}\0${finding.targetKind}\0${finding.targetId}`;
}

export async function compareDecisionPackets(
  beforeInput: unknown,
  afterInput: unknown,
  comparedAsOf: string,
  expiryWarningDays = 30
): Promise<DecisionPacketComparison> {
  const before = decisionPacketSchema.parse(beforeInput);
  const after = decisionPacketSchema.parse(afterInput);
  await exportDecisionPacket(before);
  await exportDecisionPacket(after);
  const browserPolicy = comparePolicyEvaluations(
    before.browserPolicy.evaluation,
    after.browserPolicy.evaluation,
    comparedAsOf,
    expiryWarningDays
  );

  const evidenceEvents: {
    type: "regression" | "resolution" | "changed" | "incomparable";
    key: string;
    summary: string;
  }[] = [];
  let compatible = before.evidence.kind === after.evidence.kind;

  if (!compatible) {
    evidenceEvents.push({
      type: "incomparable",
      key: "evidence-kind",
      summary: `Evidence changed from ${before.evidence.kind} to ${after.evidence.kind}.`
    });
  } else if (
    before.evidence.kind === "reduced_evidence_report" &&
    after.evidence.kind === "reduced_evidence_report"
  ) {
    const comparison = await compareEvidenceReports(before.evidence.report, after.evidence.report);
    compatible = comparison.compatible;
    for (const item of comparison.events) {
      const type =
        item.type.includes("regressed") || item.type === "surface_gap_added"
          ? "regression"
          : item.type.includes("resolved") || item.type === "surface_gap_resolved"
            ? "resolution"
            : item.type === "evidence_became_incomparable"
              ? "incomparable"
              : "changed";
      evidenceEvents.push({ type, key: item.key, summary: item.summary });
    }
  } else if (
    before.evidence.kind === "evidence_policy_evaluation" &&
    after.evidence.kind === "evidence_policy_evaluation"
  ) {
    const left = before.evidence.evaluation;
    const right = after.evidence.evaluation;
    compatible =
      left.reportIdentity.subject.applicationId === right.reportIdentity.subject.applicationId &&
      left.reportIdentity.subject.environment === right.reportIdentity.subject.environment &&
      left.reportProvenance.analyserVersion === right.reportProvenance.analyserVersion &&
      left.reportProvenance.catalogueVersion === right.reportProvenance.catalogueVersion;
    if (!compatible) {
      evidenceEvents.push({
        type: "incomparable",
        key: "evidence-policy-context",
        summary:
          "Evidence policy evaluations use different application, environment, analyser, or catalogue contexts."
      });
    } else {
      const leftFindings = new Map(
        left.findings.map((finding) => [evidencePolicyFindingKey(finding), finding])
      );
      const rightFindings = new Map(
        right.findings.map((finding) => [evidencePolicyFindingKey(finding), finding])
      );
      const rank = { pass: 0, review: 1, fail: 2 } as const;
      for (const key of [...new Set([...leftFindings.keys(), ...rightFindings.keys()])].sort()) {
        const previous = leftFindings.get(key);
        const current = rightFindings.get(key);
        if (!previous || !current) {
          evidenceEvents.push({
            type: "changed",
            key,
            summary: `${key.replaceAll("\0", " / ")} ${previous ? "left" : "entered"} the evidence policy result.`
          });
        } else if (previous.decision !== current.decision) {
          const type =
            rank[current.decision] > rank[previous.decision] ? "regression" : "resolution";
          evidenceEvents.push({
            type,
            key,
            summary: `${key.replaceAll("\0", " / ")} changed from ${previous.decision} to ${current.decision}.`
          });
        } else if (previous.outcome !== current.outcome) {
          evidenceEvents.push({
            type: "changed",
            key,
            summary: `${key.replaceAll("\0", " / ")} retained ${current.decision} while changing from ${previous.outcome} to ${current.outcome}.`
          });
        }
      }
    }
  }

  const boundedEvents = evidenceEvents
    .sort((left, right) => left.key.localeCompare(right.key) || left.type.localeCompare(right.type))
    .slice(0, 512);
  const evidenceSummary = {
    regressions: boundedEvents.filter((item) => item.type === "regression").length,
    resolutions: boundedEvents.filter((item) => item.type === "resolution").length,
    changed: boundedEvents.filter((item) => item.type === "changed").length,
    incomparable: boundedEvents.filter((item) => item.type === "incomparable").length
  };

  return decisionPacketComparisonSchema.parse({
    schemaVersion: 1,
    comparedAsOf,
    beforeFingerprint: before.packetFingerprint,
    afterFingerprint: after.packetFingerprint,
    browserPolicy,
    evidence: {
      compatible,
      beforeKind: before.evidence.kind,
      afterKind: after.evidence.kind,
      summary: evidenceSummary,
      events: boundedEvents
    },
    summary: {
      regressions: browserPolicy.summary.regressions + evidenceSummary.regressions,
      resolutions: browserPolicy.summary.resolutions + evidenceSummary.resolutions,
      review: browserPolicy.summary.review,
      changed: browserPolicy.summary.information + evidenceSummary.changed,
      incomparable: evidenceSummary.incomparable
    }
  });
}
