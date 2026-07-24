import { canonicalJson } from "./canonical";
import { fingerprintCanonical } from "./canonical-fingerprint";
import {
  type DecisionPacket,
  type DecisionPacketEvidence,
  decisionPacketSchema,
  evidenceBundleReportSchema,
  evidencePolicyEvaluationSchema,
  policyEvaluationSchema
} from "./contracts";
import { validateEvidenceReport } from "./evidence-report";

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
