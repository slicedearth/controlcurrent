import { describe, expect, it } from "vitest";
import type { EvidencePolicyProfile } from "../src/contracts";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { evaluateEvidencePolicy } from "../src/evidence-policy";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

async function report(headers: Record<string, string>, identity: unknown = evidenceIdentity) {
  return inspectEvidenceBundle(
    {
      schemaVersion: 3,
      name: "Release candidate",
      identity,
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
    schemaVersion: 2,
    name: "Release evidence baseline",
    expectedAnalyserVersion: "3.0.0",
    expectedCatalogueVersion: "2.2.0",
    expectedBcdVersion: "1.0.0",
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

    expect(evaluation.summary).toEqual({ pass: 13, review: 0, fail: 0 });
    expect(evaluation.reportIdentity).toEqual(evidenceIdentity);
    expect(evaluation.reportFingerprint).toMatch(/^[a-f0-9]{64}$/u);
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
      profile({ expectedAnalyserVersion: "4.0.0" }),
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
