import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceAttestationPolicy, EvidenceBundleReport } from "../src/contracts";
import {
  createEvidenceAttestationStatement,
  verifyEvidenceAttestation
} from "../src/evidence-attestation";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { EVIDENCE_ATTESTATION_PAYLOAD_TYPE } from "../src/evidence-model";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

const sigstoreBundle = vi.hoisted(() => {
  class ValidationError extends Error {}
  return {
    ValidationError,
    bundleFromJSON: vi.fn((bundle: unknown) => bundle)
  };
});

const sigstoreTuf = vi.hoisted(() => {
  class TUFError extends Error {}
  return {
    TUFError,
    getTrustedRoot: vi.fn(() => Promise.resolve({ mediaType: "synthetic-trusted-root" }))
  };
});

const sigstoreVerify = vi.hoisted(() => {
  class PolicyError extends Error {}
  class VerificationError extends Error {}
  const verify = vi.fn((entity: unknown, policy: unknown): unknown => {
    void entity;
    void policy;
    return undefined;
  });
  class Verifier {
    verify(entity: unknown, policy: unknown): unknown {
      return verify(entity, policy);
    }
  }
  return {
    PolicyError,
    VerificationError,
    Verifier,
    toSignedEntity: vi.fn((bundle: unknown) => bundle),
    toTrustMaterial: vi.fn((root: unknown) => root),
    verify
  };
});

vi.mock("@sigstore/bundle", () => sigstoreBundle);
vi.mock("@sigstore/tuf", () => sigstoreTuf);
vi.mock("@sigstore/verify", () => sigstoreVerify);

const policy: EvidenceAttestationPolicy = {
  required: true,
  certificateIssuer: "https://token.actions.githubusercontent.com/",
  certificateIdentity:
    "https://github.com/example/example/.github/workflows/evidence.yml@refs/heads/main"
};

async function report(): Promise<EvidenceBundleReport> {
  return inspectEvidenceBundle(
    {
      schemaVersion: 3,
      name: "Release candidate",
      identity: evidenceIdentity,
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

async function attestationBundle(evidenceReport: EvidenceBundleReport): Promise<unknown> {
  const statement = await createEvidenceAttestationStatement(evidenceReport);
  return {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    dsseEnvelope: {
      payloadType: EVIDENCE_ATTESTATION_PAYLOAD_TYPE,
      payload: Buffer.from(JSON.stringify(statement), "utf8").toString("base64"),
      signatures: [{ sig: "synthetic-test-signature" }]
    },
    verificationMaterial: {}
  };
}

describe("Sigstore evidence adapter", () => {
  beforeEach(() => {
    sigstoreBundle.bundleFromJSON.mockClear();
    sigstoreTuf.getTrustedRoot.mockClear();
    sigstoreTuf.getTrustedRoot.mockResolvedValue({ mediaType: "synthetic-trusted-root" });
    sigstoreVerify.verify.mockReset();
    sigstoreVerify.toSignedEntity.mockClear();
    sigstoreVerify.toTrustMaterial.mockClear();
  });

  it("pins the signer and verifies from bundled trust material without a live refresh", async () => {
    const evidenceReport = await report();
    sigstoreVerify.verify.mockReturnValue({
      identity: {
        extensions: { issuer: policy.certificateIssuer },
        subjectAlternativeName: policy.certificateIdentity
      }
    });

    const result = await verifyEvidenceAttestation(
      evidenceReport,
      await attestationBundle(evidenceReport),
      policy
    );

    expect(result.state).toBe("verified");
    expect(sigstoreTuf.getTrustedRoot).toHaveBeenCalledWith(
      expect.objectContaining({
        forceCache: true,
        retry: 0,
        timeout: 5_000
      })
    );
    expect(sigstoreVerify.verify).toHaveBeenCalledWith(expect.anything(), {
      subjectAlternativeName:
        "^https://github\\.com/example/example/\\.github/workflows/evidence\\.yml@refs/heads/main$",
      extensions: {
        issuer: policy.certificateIssuer
      }
    });
  });

  it.each([
    [new sigstoreVerify.PolicyError("private-policy-detail"), "signer_mismatch"],
    [new sigstoreBundle.ValidationError("private-bundle-detail"), "invalid_bundle"],
    [new sigstoreVerify.VerificationError("private-signature-detail"), "verification_failed"],
    [new Error("Unexpected verifier error."), "verification_failed"]
  ] as const)("reduces verifier failures without exposing diagnostics", async (error, state) => {
    const evidenceReport = await report();
    sigstoreVerify.verify.mockImplementation(() => {
      throw error;
    });

    const result = await verifyEvidenceAttestation(
      evidenceReport,
      await attestationBundle(evidenceReport),
      policy
    );

    expect(result.state).toBe(state);
    expect(result.explanation).not.toContain(error.message);
  });

  it("distinguishes unavailable trust material before bundle verification", async () => {
    const evidenceReport = await report();
    sigstoreTuf.getTrustedRoot.mockRejectedValue(new sigstoreTuf.TUFError("private-trust-detail"));

    const result = await verifyEvidenceAttestation(
      evidenceReport,
      await attestationBundle(evidenceReport),
      policy
    );

    expect(result.state).toBe("trust_unavailable");
    expect(result.explanation).not.toContain("private-trust-detail");
    expect(sigstoreVerify.verify).not.toHaveBeenCalled();
  });

  it("rejects a verified certificate without the required bounded identity", async () => {
    const evidenceReport = await report();
    sigstoreVerify.verify.mockReturnValue({ identity: {} });

    const result = await verifyEvidenceAttestation(
      evidenceReport,
      await attestationBundle(evidenceReport),
      policy
    );

    expect(result.state).toBe("signer_mismatch");
  });
});
