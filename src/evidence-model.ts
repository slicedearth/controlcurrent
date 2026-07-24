export const EVIDENCE_ANALYSER_VERSION = "5.0.0";

export const EVIDENCE_ATTESTATION_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
export const EVIDENCE_ATTESTATION_PAYLOAD_TYPE = "application/vnd.in-toto+json";
export const EVIDENCE_ATTESTATION_PREDICATE_TYPE =
  "https://github.com/slicedearth/controlcurrent/attestations/evidence-report/v3";
export const EVIDENCE_ATTESTATION_SUBJECT_NAME = "controlcurrent-evidence-report";
export const EVIDENCE_ATTESTATION_VERIFIER_VERSION = "1.0.0";

export const EVIDENCE_COMPOSITE_IDS = [
  "strict-csp-candidate",
  "cross-origin-isolation-candidate",
  "cookie-attribute-coverage"
] as const;

export type EvidenceCompositeId = (typeof EVIDENCE_COMPOSITE_IDS)[number];
