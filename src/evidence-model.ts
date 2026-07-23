export const EVIDENCE_ANALYSER_VERSION = "2.0.0";

export const EVIDENCE_COMPOSITE_IDS = [
  "strict-csp-candidate",
  "cross-origin-isolation-candidate",
  "cookie-attribute-coverage"
] as const;

export type EvidenceCompositeId = (typeof EVIDENCE_COMPOSITE_IDS)[number];
