import { z } from "zod";
import { canonicalJson } from "./canonical";
import {
  type EvidenceAttestationPolicy,
  type EvidenceAttestationState,
  type EvidenceAttestationStatement,
  type EvidenceAttestationVerification,
  evidenceAttestationPolicySchema,
  evidenceAttestationStatementSchema,
  evidenceAttestationVerificationSchema
} from "./contracts";
import {
  EVIDENCE_ATTESTATION_PAYLOAD_TYPE,
  EVIDENCE_ATTESTATION_PREDICATE_TYPE,
  EVIDENCE_ATTESTATION_STATEMENT_TYPE,
  EVIDENCE_ATTESTATION_SUBJECT_NAME,
  EVIDENCE_ATTESTATION_VERIFIER_VERSION
} from "./evidence-model";
import { validateEvidenceReport } from "./evidence-report";
import { loadPackagedSigstoreTrustedRoot } from "./sigstore-trust";

const MAX_STATEMENT_BASE64_CHARACTERS = 64 * 1_024;

const dsseBundleSchema = z
  .object({
    dsseEnvelope: z
      .object({
        payloadType: z.string().max(256),
        payload: z.string().max(MAX_STATEMENT_BASE64_CHARACTERS)
      })
      .loose()
  })
  .loose();

type VerifiedSigner = {
  issuer: string;
  identity: string;
};

export type EvidenceBundleVerifier = (
  bundle: unknown,
  policy: EvidenceAttestationPolicy
) => Promise<VerifiedSigner>;

class EvidenceBundleVerificationError extends Error {
  readonly state: EvidenceAttestationState;

  constructor(state: EvidenceAttestationState, message: string) {
    super(message);
    this.name = "EvidenceBundleVerificationError";
    this.state = state;
  }
}

function exactPattern(value: string): string {
  return `^${value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`;
}

function decodeStatement(payload: string): unknown {
  if (
    payload.length === 0 ||
    payload.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(payload)
  ) {
    throw new EvidenceBundleVerificationError(
      "statement_invalid",
      "The verified DSSE payload is not canonical base64."
    );
  }
  const bytes = Buffer.from(payload, "base64");
  if (bytes.byteLength > 48 * 1_024) {
    throw new EvidenceBundleVerificationError(
      "statement_invalid",
      "The verified attestation statement exceeds 49152 bytes."
    );
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new EvidenceBundleVerificationError(
      "statement_invalid",
      "The verified DSSE payload is not a JSON statement."
    );
  }
}

export async function createEvidenceAttestationStatement(
  reportInput: unknown
): Promise<EvidenceAttestationStatement> {
  const report = await validateEvidenceReport(reportInput);
  return evidenceAttestationStatementSchema.parse({
    _type: EVIDENCE_ATTESTATION_STATEMENT_TYPE,
    subject: [
      {
        name: EVIDENCE_ATTESTATION_SUBJECT_NAME,
        digest: {
          sha256: report.reportFingerprint
        }
      }
    ],
    predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
    predicate: {
      schemaVersion: 3,
      reportSchemaVersion: report.schemaVersion,
      reportName: report.name,
      identity: report.identity,
      scopeInventory: report.scopeInventory
    }
  });
}

export function absentEvidenceAttestation(
  reportFingerprint: string
): EvidenceAttestationVerification {
  return evidenceAttestationVerificationSchema.parse({
    schemaVersion: 1,
    state: "absent",
    reportFingerprint,
    predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
    verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
    explanation: "No Sigstore evidence attestation was supplied for verification."
  });
}

export const verifySigstoreBundle: EvidenceBundleVerifier = async (bundle, policy) => {
  const [{ ValidationError, bundleFromJSON }, verification] = await Promise.all([
    import("@sigstore/bundle"),
    import("@sigstore/verify")
  ]);
  const { PolicyError, VerificationError, Verifier, toSignedEntity, toTrustMaterial } =
    verification;

  let trustedRoot: Awaited<ReturnType<typeof loadPackagedSigstoreTrustedRoot>>;
  try {
    trustedRoot = await loadPackagedSigstoreTrustedRoot();
  } catch {
    throw new EvidenceBundleVerificationError(
      "trust_unavailable",
      "The pinned Sigstore trust material was unavailable."
    );
  }

  try {
    const verifier = new Verifier(toTrustMaterial(trustedRoot), {
      ctlogThreshold: 1,
      tlogThreshold: 1
    });
    const signer = verifier.verify(toSignedEntity(bundleFromJSON(bundle)), {
      subjectAlternativeName: exactPattern(policy.certificateIdentity),
      extensions: {
        issuer: policy.certificateIssuer
      }
    });
    const issuer = signer.identity?.extensions?.issuer;
    const identity = signer.identity?.subjectAlternativeName;
    if (!issuer || !identity) {
      throw new EvidenceBundleVerificationError(
        "signer_mismatch",
        "The verified certificate did not expose the required issuer and URI identity."
      );
    }
    return { issuer, identity };
  } catch (error) {
    if (error instanceof EvidenceBundleVerificationError) throw error;
    if (error instanceof PolicyError) {
      throw new EvidenceBundleVerificationError(
        "signer_mismatch",
        "The bundle signature was valid but its certificate identity did not match policy."
      );
    }
    if (error instanceof ValidationError) {
      throw new EvidenceBundleVerificationError(
        "invalid_bundle",
        "The supplied Sigstore bundle did not satisfy the supported bundle contract."
      );
    }
    if (error instanceof VerificationError) {
      throw new EvidenceBundleVerificationError(
        "verification_failed",
        "The Sigstore signature, certificate, timestamp, or transparency evidence did not verify."
      );
    }
    throw error;
  }
};

export async function verifyEvidenceAttestation(
  reportInput: unknown,
  bundleInput: unknown,
  policyInput: unknown,
  verifier: EvidenceBundleVerifier = verifySigstoreBundle
): Promise<EvidenceAttestationVerification> {
  const report = await validateEvidenceReport(reportInput);
  const policy = evidenceAttestationPolicySchema.parse(policyInput);
  const bundle = dsseBundleSchema.safeParse(bundleInput);
  if (!bundle.success) {
    return evidenceAttestationVerificationSchema.parse({
      schemaVersion: 1,
      state: "unsupported",
      reportFingerprint: report.reportFingerprint,
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
      explanation:
        "The supplied bundle does not contain one bounded DSSE envelope with an embedded statement."
    });
  }
  if (bundle.data.dsseEnvelope.payloadType !== EVIDENCE_ATTESTATION_PAYLOAD_TYPE) {
    return evidenceAttestationVerificationSchema.parse({
      schemaVersion: 1,
      state: "unsupported",
      reportFingerprint: report.reportFingerprint,
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
      explanation: `Unsupported DSSE payload type: ${bundle.data.dsseEnvelope.payloadType}`
    });
  }

  let signer: VerifiedSigner;
  try {
    signer = await verifier(bundleInput, policy);
  } catch (error) {
    const state =
      error instanceof EvidenceBundleVerificationError ? error.state : "verification_failed";
    const explanation =
      error instanceof EvidenceBundleVerificationError
        ? error.message
        : "The Sigstore bundle could not be verified.";
    return evidenceAttestationVerificationSchema.parse({
      schemaVersion: 1,
      state,
      reportFingerprint: report.reportFingerprint,
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
      explanation
    });
  }

  let statement: EvidenceAttestationStatement;
  try {
    statement = evidenceAttestationStatementSchema.parse(
      decodeStatement(bundle.data.dsseEnvelope.payload)
    );
  } catch (error) {
    return evidenceAttestationVerificationSchema.parse({
      schemaVersion: 1,
      state: "statement_invalid",
      reportFingerprint: report.reportFingerprint,
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
      signer,
      explanation:
        error instanceof Error
          ? error.message
          : "The verified DSSE payload was not a supported evidence statement."
    });
  }

  const statementSubject = statement.subject[0];
  if (!statementSubject) {
    return evidenceAttestationVerificationSchema.parse({
      schemaVersion: 1,
      state: "statement_invalid",
      reportFingerprint: report.reportFingerprint,
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
      signer,
      explanation: "The verified statement does not contain an evidence-report subject."
    });
  }
  if (statementSubject.digest.sha256 !== report.reportFingerprint) {
    return evidenceAttestationVerificationSchema.parse({
      schemaVersion: 1,
      state: "digest_mismatch",
      reportFingerprint: report.reportFingerprint,
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
      signer,
      explanation:
        "The verified statement subject digest does not match the reduced evidence report fingerprint."
    });
  }

  const expectedStatement = await createEvidenceAttestationStatement(report);
  if (canonicalJson(statement.predicate, 0) !== canonicalJson(expectedStatement.predicate, 0)) {
    return evidenceAttestationVerificationSchema.parse({
      schemaVersion: 1,
      state: "identity_mismatch",
      reportFingerprint: report.reportFingerprint,
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
      signer,
      explanation:
        "The verified statement identity or report description does not match the reduced evidence report."
    });
  }

  return evidenceAttestationVerificationSchema.parse({
    schemaVersion: 1,
    state: "verified",
    reportFingerprint: report.reportFingerprint,
    predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
    verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
    signer,
    explanation:
      "The Sigstore signature, trusted certificate, transparency evidence, statement digest, and deployment identity verified."
  });
}
