import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  renderDecisionPacketComparisonJunit,
  renderDecisionPacketComparisonMarkdown,
  renderEvidenceEvaluationJunit,
  renderEvidenceEvaluationMarkdown
} from "../src/ci-output";
import {
  buildDecisionPacket,
  compareDecisionPackets,
  exportDecisionPacket,
  validateDecisionPacketEvidence
} from "../src/decision-packet";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { evaluateEvidencePolicy } from "../src/evidence-policy";
import { selectedSnapshot } from "../src/data";
import { evaluatePolicyProfile } from "../src/policy";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

const browserPolicy = evaluatePolicyProfile(
  selectedSnapshot,
  {
    schemaVersion: 1,
    name: "Release browser policy",
    baselines: [{ browser: "chrome", minimumVersion: "120" }],
    requiredControls: ["content-security-policy"],
    rules: {
      qualifications: "review",
      unknown: "fail",
      unsupported: "fail"
    },
    exceptions: []
  },
  "2026-07-24"
);

async function evidenceReport(policy = "default-src 'none'") {
  return inspectEvidenceBundle(
    {
      schemaVersion: 4,
      identity: evidenceIdentity,
      name: "Release evidence",
      surfaces: [
        {
          id: "document",
          role: "document",
          requiredEvidence: ["response"],
          requiredControls: ["content-security-policy"],
          requiredComposites: []
        }
      ],
      responses: [
        {
          schemaVersion: 1,
          name: "Document response",
          surfaceId: "document",
          headers: { "Content-Security-Policy": policy }
        }
      ]
    },
    evidenceSourceContext
  );
}

async function evidencePolicyEvaluation() {
  const profile = JSON.parse(
    readFileSync(new URL("../examples/evidence-policy.json", import.meta.url), "utf8")
  ) as unknown;
  return evaluateEvidencePolicy(await evidenceReport(), profile, "2026-07-24");
}

describe("two-part decision packets", () => {
  it("keeps browser policy and reduced evidence separate with deterministic fingerprints", async () => {
    const evidence = await evidenceReport();
    const packet = await buildDecisionPacket(browserPolicy, evidence, "2026-07-24");
    const exported = await exportDecisionPacket(packet);

    expect(packet.browserPolicy.evaluation).toEqual(browserPolicy);
    expect(packet.evidence).toMatchObject({
      kind: "reduced_evidence_report",
      fingerprint: evidence.reportFingerprint
    });
    expect(packet.limitations).toEqual({
      combinedScore: false,
      browserAvailabilityIsRuntimeAssurance: false,
      suppliedEvidenceIsIndependentCollectionProof: false
    });
    expect(packet.packetFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(await exportDecisionPacket(packet)).toBe(exported);
    expect(await validateDecisionPacketEvidence(evidence)).toMatchObject({
      kind: "reduced_evidence_report"
    });
  });

  it("refuses changed packet content", async () => {
    const packet = await buildDecisionPacket(browserPolicy, await evidenceReport(), "2026-07-24");
    await expect(
      exportDecisionPacket({
        ...packet,
        browserPolicy: {
          ...packet.browserPolicy,
          evaluation: {
            ...packet.browserPolicy.evaluation,
            evaluatedAsOf: "2026-07-25"
          }
        }
      })
    ).rejects.toThrow(/browser-policy fingerprint/u);
    await expect(
      exportDecisionPacket({
        ...packet,
        packetFingerprint: "0".repeat(64)
      })
    ).rejects.toThrow(/packet fingerprint/u);
    await expect(
      buildDecisionPacket(browserPolicy, await evidenceReport(), "not-a-date")
    ).rejects.toThrow(/Invalid decision packet date/u);
  });

  it("compares browser-policy and evidence regressions without combining their meaning", async () => {
    const strongerPolicy = evaluatePolicyProfile(
      selectedSnapshot,
      {
        ...browserPolicy.profile,
        name: "Stronger release browser policy",
        requiredControls: ["content-security-policy", "csp-nonces"]
      },
      "2026-07-24"
    );
    const before = await buildDecisionPacket(strongerPolicy, await evidenceReport(), "2026-07-24");
    const after = await buildDecisionPacket(browserPolicy, await evidenceReport(""), "2026-07-24");
    const comparison = await compareDecisionPackets(before, after, "2026-07-24");

    expect(comparison.browserPolicy.events).toContainEqual(
      expect.objectContaining({ type: "requirement_removed", severity: "regression" })
    );
    expect(comparison.evidence.summary.regressions).toBeGreaterThan(0);
    expect(comparison.summary.regressions).toBeGreaterThan(1);
    expect(await compareDecisionPackets(before, after, "2026-07-24")).toEqual(comparison);
    expect(renderDecisionPacketComparisonMarkdown(comparison)).toContain(
      "two decision lanes remain separate"
    );
    expect(renderDecisionPacketComparisonJunit(comparison)).toContain("<failure ");
  });

  it("validates and compares evidence-policy evaluation lanes", async () => {
    const evaluation = await evidencePolicyEvaluation();
    const first = evaluation.findings[0];
    if (!first) throw new Error("Expected evidence policy findings.");
    const changedEvaluation = {
      ...evaluation,
      findings: [
        {
          ...first,
          decision: first.decision === "fail" ? ("review" as const) : ("fail" as const)
        },
        ...evaluation.findings.slice(1)
      ]
    };
    const before = await buildDecisionPacket(browserPolicy, evaluation, "2026-07-24");
    const after = await buildDecisionPacket(browserPolicy, changedEvaluation, "2026-07-24");
    const comparison = await compareDecisionPackets(before, after, "2026-07-24");

    expect(before.evidence.kind).toBe("evidence_policy_evaluation");
    expect(comparison.evidence.compatible).toBe(true);
    expect(
      comparison.evidence.summary.regressions + comparison.evidence.summary.resolutions
    ).toBeGreaterThan(0);
    expect(renderEvidenceEvaluationMarkdown(evaluation)).toContain("Evidence for example-app");
    expect(renderEvidenceEvaluationJunit(evaluation)).toContain("<testsuite ");
  });

  it("marks different evidence lanes and contexts as incomparable", async () => {
    const evaluation = await evidencePolicyEvaluation();
    const reduced = await buildDecisionPacket(browserPolicy, await evidenceReport(), "2026-07-24");
    const evaluated = await buildDecisionPacket(browserPolicy, evaluation, "2026-07-24");
    const differentLane = await compareDecisionPackets(reduced, evaluated, "2026-07-24");
    expect(differentLane.evidence.summary.incomparable).toBe(1);

    const changedContextEvaluation = {
      ...evaluation,
      reportIdentity: {
        ...evaluation.reportIdentity,
        subject: {
          ...evaluation.reportIdentity.subject,
          applicationId: "different-app"
        }
      }
    };
    const changedContext = await buildDecisionPacket(
      browserPolicy,
      changedContextEvaluation,
      "2026-07-24"
    );
    const contextComparison = await compareDecisionPackets(evaluated, changedContext, "2026-07-24");
    expect(contextComparison.evidence.events).toContainEqual(
      expect.objectContaining({ type: "incomparable", key: "evidence-policy-context" })
    );
  });
});
