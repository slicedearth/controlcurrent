import { describe, expect, it, vi } from "vitest";
import type {
  EvidenceAttestationPolicy,
  EvidenceAttestationStatement,
  EvidenceBundleReport
} from "../src/contracts";
import {
  createEvidenceAttestationStatement,
  verifyEvidenceAttestation
} from "../src/evidence-attestation";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import {
  EVIDENCE_ATTESTATION_PAYLOAD_TYPE,
  EVIDENCE_ATTESTATION_PREDICATE_TYPE,
  EVIDENCE_ATTESTATION_STATEMENT_TYPE,
  EVIDENCE_ATTESTATION_SUBJECT_NAME
} from "../src/evidence-model";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

const policy: EvidenceAttestationPolicy = {
  required: true,
  certificateIssuer: "https://token.actions.githubusercontent.com/",
  certificateIdentity:
    "https://github.com/example/example/.github/workflows/evidence.yml@refs/heads/main"
};

async function report(withScopeInventory = false): Promise<EvidenceBundleReport> {
  return inspectEvidenceBundle(
    {
      schemaVersion: 4,
      name: "Release candidate",
      identity: evidenceIdentity,
      ...(withScopeInventory
        ? {
            scopeInventory: {
              schemaVersion: 1,
              name: "Reviewed route manifest",
              kind: "framework_manifest",
              generatedAt: "2026-07-20T08:55:00.000Z",
              completeness: "complete",
              entries: [{ id: "document", disposition: "included" }]
            }
          }
        : {}),
      surfaces: [
        {
          id: "document",
          role: "document",
          requiredEvidence: ["response"],
          requiredControls: ["strict-transport-security"],
          requiredComposites: []
        }
      ],
      responses: [
        {
          schemaVersion: 1,
          name: "Document response",
          surfaceId: "document",
          headers: {
            "Strict-Transport-Security": "max-age=31536000"
          }
        }
      ]
    },
    evidenceSourceContext
  );
}

function bundle(statement: unknown, payloadType = EVIDENCE_ATTESTATION_PAYLOAD_TYPE): unknown {
  return {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    dsseEnvelope: {
      payloadType,
      payload: Buffer.from(JSON.stringify(statement), "utf8").toString("base64"),
      signatures: [{ sig: "synthetic-test-signature" }]
    },
    verificationMaterial: {}
  };
}

const verifiedSigner = vi.fn(() =>
  Promise.resolve({
    issuer: policy.certificateIssuer,
    identity: policy.certificateIdentity
  })
);

describe("evidence attestation", () => {
  it("creates one deterministic in-toto subject over the report fingerprint", async () => {
    const evidenceReport = await report();
    const statement = await createEvidenceAttestationStatement(evidenceReport);

    expect(statement).toEqual({
      _type: EVIDENCE_ATTESTATION_STATEMENT_TYPE,
      subject: [
        {
          name: EVIDENCE_ATTESTATION_SUBJECT_NAME,
          digest: { sha256: evidenceReport.reportFingerprint }
        }
      ],
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      predicate: {
        schemaVersion: 3,
        reportSchemaVersion: 7,
        reportName: evidenceReport.name,
        identity: evidenceReport.identity,
        scopeInventory: {
          schemaVersion: 1,
          state: "absent"
        }
      }
    });
  });

  it("accepts a cryptographically verified statement only when its digest and identity match", async () => {
    const evidenceReport = await report(true);
    const statement = await createEvidenceAttestationStatement(evidenceReport);
    const verification = await verifyEvidenceAttestation(
      evidenceReport,
      bundle(statement),
      policy,
      verifiedSigner
    );

    expect(verification).toEqual(
      expect.objectContaining({
        state: "verified",
        reportFingerprint: evidenceReport.reportFingerprint,
        signer: {
          issuer: policy.certificateIssuer,
          identity: policy.certificateIdentity
        }
      })
    );
    expect(statement.predicate.scopeInventory).toEqual(evidenceReport.scopeInventory);
  });

  it("rejects a verified statement for another digest", async () => {
    const evidenceReport = await report();
    const statement = await createEvidenceAttestationStatement(evidenceReport);
    const changed: EvidenceAttestationStatement = {
      ...statement,
      subject: [
        {
          name: EVIDENCE_ATTESTATION_SUBJECT_NAME,
          digest: { sha256: "f".repeat(64) }
        }
      ]
    };
    const verification = await verifyEvidenceAttestation(
      evidenceReport,
      bundle(changed),
      policy,
      verifiedSigner
    );

    expect(verification.state).toBe("digest_mismatch");
  });

  it("rejects a verified statement whose deployment identity differs", async () => {
    const evidenceReport = await report();
    const statement = await createEvidenceAttestationStatement(evidenceReport);
    const changed: EvidenceAttestationStatement = {
      ...statement,
      predicate: {
        ...statement.predicate,
        identity: {
          ...statement.predicate.identity,
          subject: {
            ...statement.predicate.identity.subject,
            environment: "production"
          }
        }
      }
    };
    const verification = await verifyEvidenceAttestation(
      evidenceReport,
      bundle(changed),
      policy,
      verifiedSigner
    );

    expect(verification.state).toBe("identity_mismatch");
  });

  it("distinguishes unsupported envelopes, invalid statements, and failed verification", async () => {
    const evidenceReport = await report();
    const unsupported = await verifyEvidenceAttestation(
      evidenceReport,
      bundle({}, "application/json"),
      policy,
      verifiedSigner
    );
    const invalidStatement = await verifyEvidenceAttestation(
      evidenceReport,
      bundle({ _type: "unexpected" }),
      policy,
      verifiedSigner
    );
    const failed = await verifyEvidenceAttestation(
      evidenceReport,
      bundle(await createEvidenceAttestationStatement(evidenceReport)),
      policy,
      () => Promise.reject(new Error("Synthetic verifier failure."))
    );

    expect(unsupported.state).toBe("unsupported");
    expect(invalidStatement.state).toBe("statement_invalid");
    expect(failed.state).toBe("verification_failed");
  });
});
