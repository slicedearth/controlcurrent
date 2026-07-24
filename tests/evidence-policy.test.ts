import { describe, expect, it } from "vitest";
import type { EvidencePolicyProfile } from "../src/contracts";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { evaluateEvidencePolicy } from "../src/evidence-policy";
import {
  EVIDENCE_ATTESTATION_PREDICATE_TYPE,
  EVIDENCE_ATTESTATION_VERIFIER_VERSION
} from "../src/evidence-model";
import { reduceScopeInventory } from "../src/scope-inventory";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

const completeInventory = {
  schemaVersion: 1,
  name: "Reviewed route manifest",
  kind: "framework_manifest",
  generatedAt: "2026-07-20T08:55:00.000Z",
  completeness: "complete",
  entries: [{ id: "document", disposition: "included" }]
} as const;

async function report(
  headers: Record<string, string>,
  identity: unknown = evidenceIdentity,
  scopeInventory?: unknown
) {
  return inspectEvidenceBundle(
    {
      schemaVersion: 4,
      name: "Release candidate",
      identity,
      ...(scopeInventory ? { scopeInventory } : {}),
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
          headers
        }
      ]
    },
    evidenceSourceContext
  );
}

function profile(overrides: Partial<EvidencePolicyProfile> = {}): EvidencePolicyProfile {
  return {
    schemaVersion: 4,
    name: "Release evidence baseline",
    expectedAnalyserVersion: "5.0.0",
    expectedCatalogueVersion: "2.2.0",
    expectedBcdVersion: "1.0.0",
    attestation: {
      required: false,
      certificateIssuer: "https://token.actions.githubusercontent.com/",
      certificateIdentity:
        "https://github.com/example/example/.github/workflows/evidence.yml@refs/heads/main"
    },
    scopeInventory: {
      required: false,
      allowedKinds: ["declared", "framework_manifest", "authorised_crawl", "test_suite"],
      requireComplete: false,
      maxAgeDays: 30,
      maxExcludedEntries: 32
    },
    identity: {
      applicationId: "example-app",
      allowedEnvironments: ["staging"],
      expectedRevision: "0123456789abcdef0123456789abcdef01234567",
      allowedProducerKinds: ["application_ci"],
      requireBuildId: true,
      maxAgeDays: 7,
      maxCaptureDurationMinutes: 30
    },
    surfaces: [
      {
        id: "document",
        role: "document",
        requiredEvidence: ["response"],
        requiredControls: ["strict-transport-security"],
        requiredComposites: []
      }
    ],
    rules: {
      missing: "fail",
      reportOnly: "fail",
      inconclusive: "review",
      notEvaluated: "fail",
      compositeReview: "review"
    },
    exceptions: [],
    ...overrides
  };
}

describe("evidence policy evaluation", () => {
  it("passes an exact surface, model, and observed-control policy", async () => {
    const evaluation = await evaluateEvidencePolicy(
      await report({ "Strict-Transport-Security": "max-age=31536000" }),
      profile(),
      "2026-07-23"
    );

    expect(evaluation.summary).toEqual({ pass: 15, review: 0, fail: 0 });
    expect(evaluation.attestation.state).toBe("absent");
    expect(evaluation.reportIdentity).toEqual(evidenceIdentity);
    expect(evaluation.reportFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("fails a required absent attestation and passes an exact verified signer", async () => {
    const evidenceReport = await report({
      "Strict-Transport-Security": "max-age=31536000"
    });
    const requiredProfile = profile({
      attestation: {
        ...profile().attestation,
        required: true
      }
    });
    const absent = await evaluateEvidencePolicy(evidenceReport, requiredProfile, "2026-07-23");
    const verified = await evaluateEvidencePolicy(evidenceReport, requiredProfile, "2026-07-23", {
      schemaVersion: 1,
      state: "verified",
      reportFingerprint: evidenceReport.reportFingerprint,
      predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
      verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
      signer: {
        issuer: requiredProfile.attestation.certificateIssuer,
        identity: requiredProfile.attestation.certificateIdentity
      },
      explanation: "The bounded test attestation verified."
    });

    expect(absent.findings).toContainEqual(
      expect.objectContaining({
        targetKind: "attestation",
        outcome: "absent",
        decision: "fail"
      })
    );
    expect(verified.findings).toContainEqual(
      expect.objectContaining({
        targetKind: "attestation",
        outcome: "verified",
        decision: "pass"
      })
    );
  });

  it("requires one exact, complete, fresh scope inventory when configured", async () => {
    const reducedInventory = await reduceScopeInventory(completeInventory);
    if (reducedInventory.state !== "present") throw new Error("Expected a present inventory.");
    const evidenceReport = await report(
      { "Strict-Transport-Security": "max-age=31536000" },
      evidenceIdentity,
      completeInventory
    );
    const evaluation = await evaluateEvidencePolicy(
      evidenceReport,
      profile({
        scopeInventory: {
          required: true,
          allowedKinds: ["framework_manifest"],
          requireComplete: true,
          expectedFingerprint: reducedInventory.fingerprint,
          maxAgeDays: 7,
          maxExcludedEntries: 0
        }
      }),
      "2026-07-23"
    );

    expect(evaluation.reportScopeInventory).toEqual(reducedInventory);
    expect(evaluation.findings.filter((finding) => finding.targetKind === "inventory")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: "scope-inventory", decision: "pass" }),
        expect.objectContaining({ targetId: "scope-kind", decision: "pass" }),
        expect.objectContaining({ targetId: "scope-completeness", decision: "pass" }),
        expect.objectContaining({ targetId: "scope-exclusions", decision: "pass" }),
        expect.objectContaining({ targetId: "scope-fingerprint", decision: "pass" }),
        expect.objectContaining({ targetId: "scope-age", decision: "pass" })
      ])
    );
  });

  it("fails partial, stale, excluded, or mismatched inventory claims without exceptions", async () => {
    const partialInventory = {
      ...completeInventory,
      completeness: "partial",
      generatedAt: "2026-07-01T08:55:00.000Z",
      entries: [
        ...completeInventory.entries,
        {
          id: "administration",
          disposition: "excluded",
          exclusionReason: "requires_separate_capture"
        }
      ]
    } as const;
    const evidenceReport = await report(
      { "Strict-Transport-Security": "max-age=31536000" },
      evidenceIdentity,
      partialInventory
    );
    const evaluation = await evaluateEvidencePolicy(
      evidenceReport,
      profile({
        scopeInventory: {
          required: true,
          allowedKinds: ["framework_manifest"],
          requireComplete: true,
          expectedFingerprint: "f".repeat(64),
          maxAgeDays: 7,
          maxExcludedEntries: 0
        }
      }),
      "2026-07-23"
    );

    expect(evaluation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetKind: "inventory",
          targetId: "scope-completeness",
          outcome: "partial",
          decision: "fail"
        }),
        expect.objectContaining({
          targetKind: "inventory",
          targetId: "scope-exclusions",
          outcome: "too_many_exclusions",
          decision: "fail"
        }),
        expect.objectContaining({
          targetKind: "inventory",
          targetId: "scope-fingerprint",
          outcome: "scope_mismatch",
          decision: "fail"
        }),
        expect.objectContaining({
          targetKind: "inventory",
          targetId: "scope-age",
          outcome: "stale",
          decision: "fail"
        })
      ])
    );
  });

  it("fails when policy requires an absent scope inventory", async () => {
    const evaluation = await evaluateEvidencePolicy(
      await report({ "Strict-Transport-Security": "max-age=31536000" }),
      profile({
        scopeInventory: {
          ...profile().scopeInventory,
          required: true
        }
      }),
      "2026-07-23"
    );

    expect(evaluation.findings).toContainEqual(
      expect.objectContaining({
        targetKind: "inventory",
        targetId: "scope-inventory",
        outcome: "absent",
        decision: "fail"
      })
    );
  });

  it("fails a verified result for another report or signer without allowing an exception", async () => {
    const evidenceReport = await report({
      "Strict-Transport-Security": "max-age=31536000"
    });
    const requiredProfile = profile({
      attestation: {
        ...profile().attestation,
        required: true
      },
      exceptions: [
        {
          surfaceId: "document",
          targetKind: "control",
          targetId: "strict-transport-security",
          outcomes: ["missing"],
          reason: "This exception cannot apply to report trust.",
          expiresOn: "2026-07-31"
        }
      ]
    });
    const wrongReport = await evaluateEvidencePolicy(
      evidenceReport,
      requiredProfile,
      "2026-07-23",
      {
        schemaVersion: 1,
        state: "verified",
        reportFingerprint: "f".repeat(64),
        predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
        verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
        signer: {
          issuer: requiredProfile.attestation.certificateIssuer,
          identity: requiredProfile.attestation.certificateIdentity
        },
        explanation: "The bounded test attestation verified."
      }
    );
    const wrongSigner = await evaluateEvidencePolicy(
      evidenceReport,
      requiredProfile,
      "2026-07-23",
      {
        schemaVersion: 1,
        state: "verified",
        reportFingerprint: evidenceReport.reportFingerprint,
        predicateType: EVIDENCE_ATTESTATION_PREDICATE_TYPE,
        verifierVersion: EVIDENCE_ATTESTATION_VERIFIER_VERSION,
        signer: {
          issuer: requiredProfile.attestation.certificateIssuer,
          identity:
            "https://github.com/example/other/.github/workflows/evidence.yml@refs/heads/main"
        },
        explanation: "The bounded test attestation verified."
      }
    );

    expect(wrongReport.findings[0]).toEqual(
      expect.objectContaining({
        targetKind: "attestation",
        outcome: "digest_mismatch",
        decision: "fail"
      })
    );
    expect(wrongSigner.findings[0]).toEqual(
      expect.objectContaining({
        targetKind: "attestation",
        outcome: "signer_mismatch",
        decision: "fail"
      })
    );
  });

  it("fails evidence for the wrong application, environment, revision, or producer", async () => {
    const evaluation = await evaluateEvidencePolicy(
      await report(
        { "Strict-Transport-Security": "max-age=31536000" },
        {
          ...evidenceIdentity,
          subject: {
            applicationId: "other-app",
            environment: "production",
            revision: "fedcba9876543210",
            buildId: "build-99"
          },
          capture: {
            ...evidenceIdentity.capture,
            producer: {
              kind: "manual",
              id: "local-review"
            }
          }
        }
      ),
      profile(),
      "2026-07-23"
    );

    expect(evaluation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: "application-id", decision: "fail" }),
        expect.objectContaining({ targetId: "environment", decision: "fail" }),
        expect.objectContaining({ targetId: "revision", decision: "fail" }),
        expect.objectContaining({ targetId: "producer-kind", decision: "fail" })
      ])
    );
  });

  it("fails stale and future evidence without trusting producer timestamps blindly", async () => {
    const stale = await evaluateEvidencePolicy(
      await report(
        { "Strict-Transport-Security": "max-age=31536000" },
        {
          ...evidenceIdentity,
          capture: {
            ...evidenceIdentity.capture,
            startedAt: "2026-07-01T09:00:00.000Z",
            completedAt: "2026-07-01T09:05:00.000Z"
          }
        }
      ),
      profile(),
      "2026-07-23"
    );
    const future = await evaluateEvidencePolicy(
      await report(
        { "Strict-Transport-Security": "max-age=31536000" },
        {
          ...evidenceIdentity,
          capture: {
            ...evidenceIdentity.capture,
            startedAt: "2026-07-24T09:00:00.000Z",
            completedAt: "2026-07-24T09:05:00.000Z"
          }
        }
      ),
      profile(),
      "2026-07-23"
    );

    expect(stale.findings).toContainEqual(
      expect.objectContaining({
        targetId: "capture-age",
        outcome: "stale",
        decision: "fail"
      })
    );
    expect(future.findings).toContainEqual(
      expect.objectContaining({
        targetId: "capture-age",
        outcome: "future",
        decision: "fail"
      })
    );
  });

  it("fails an overlong capture window and a missing required build identifier", async () => {
    const subject = {
      applicationId: evidenceIdentity.subject.applicationId,
      environment: evidenceIdentity.subject.environment,
      revision: evidenceIdentity.subject.revision
    };
    const evaluation = await evaluateEvidencePolicy(
      await report(
        { "Strict-Transport-Security": "max-age=31536000" },
        {
          ...evidenceIdentity,
          subject,
          capture: {
            ...evidenceIdentity.capture,
            startedAt: "2026-07-20T09:00:00.000Z",
            completedAt: "2026-07-20T10:00:00.000Z"
          }
        }
      ),
      profile(),
      "2026-07-23"
    );

    expect(evaluation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: "build-id", outcome: "missing", decision: "fail" }),
        expect.objectContaining({
          targetId: "capture-window",
          outcome: "window_too_long",
          decision: "fail"
        })
      ])
    );
  });

  it("fails missing required evidence independently of the report manifest", async () => {
    const evaluation = await evaluateEvidencePolicy(
      await report({ "Strict-Transport-Security": "max-age=31536000" }),
      profile({
        surfaces: [
          {
            id: "document",
            role: "document",
            requiredEvidence: ["response", "html"],
            requiredControls: ["strict-transport-security"],
            requiredComposites: []
          }
        ]
      }),
      "2026-07-23"
    );

    expect(evaluation.summary.fail).toBe(1);
    expect(evaluation.findings).toContainEqual(
      expect.objectContaining({
        targetKind: "evidence",
        targetId: "html",
        outcome: "missing",
        decision: "fail"
      })
    );
  });

  it("makes active and expired exceptions visible without turning them into passes", async () => {
    const evidenceReport = await report({ "X-Content-Type-Options": "nosniff" });
    const exception = {
      surfaceId: "document",
      targetKind: "control" as const,
      targetId: "strict-transport-security",
      outcomes: ["missing" as const],
      reason: "Migration requires a bounded temporary exception.",
      expiresOn: "2026-07-31"
    };
    const active = await evaluateEvidencePolicy(
      evidenceReport,
      profile({ exceptions: [exception] }),
      "2026-07-23"
    );
    const expired = await evaluateEvidencePolicy(
      evidenceReport,
      profile({ exceptions: [exception] }),
      "2026-08-01"
    );

    expect(active.findings).toContainEqual(
      expect.objectContaining({
        targetId: "strict-transport-security",
        decision: "review",
        exceptionState: "active"
      })
    );
    expect(expired.findings).toContainEqual(
      expect.objectContaining({
        targetId: "strict-transport-security",
        decision: "fail",
        exceptionState: "expired"
      })
    );
  });

  it("fails closed when the expected analysis model differs", async () => {
    const evaluation = await evaluateEvidencePolicy(
      await report({ "Strict-Transport-Security": "max-age=31536000" }),
      profile({ expectedAnalyserVersion: "99.0.0" }),
      "2026-07-23"
    );

    expect(evaluation.findings).toContainEqual(
      expect.objectContaining({
        targetKind: "model",
        targetId: "analysis-version",
        outcome: "model_mismatch",
        decision: "fail"
      })
    );
  });

  it("rejects a reduced report whose content no longer matches its fingerprint", async () => {
    const original = await report({ "Strict-Transport-Security": "max-age=31536000" });

    await expect(
      evaluateEvidencePolicy(
        { ...original, name: "Tampered release candidate" },
        profile(),
        "2026-07-23"
      )
    ).rejects.toThrow(/fingerprint does not match/u);
  });
});
