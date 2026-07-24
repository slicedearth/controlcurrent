import { describe, expect, it } from "vitest";
import {
  buildDecisionPacket,
  exportDecisionPacket,
  validateDecisionPacketEvidence
} from "../src/decision-packet";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
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

async function evidenceReport() {
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
          headers: { "Content-Security-Policy": "default-src 'none'" }
        }
      ]
    },
    evidenceSourceContext
  );
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
});
