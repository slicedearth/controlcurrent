import { describe, expect, it } from "vitest";
import { compareEvidenceReports } from "../src/evidence-comparison";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { fingerprintEvidenceReportBody } from "../src/evidence-report";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

async function report(name: string, options: { csp: boolean; includeHtml: boolean }) {
  return inspectEvidenceBundle(
    {
      schemaVersion: 3,
      name,
      identity: evidenceIdentity,
      surfaces: [
        {
          id: "document",
          role: "document",
          requiredEvidence: ["response", "html"],
          requiredControls: ["content-security-policy", "csp-nonces", "csp-base-uri"],
          requiredComposites: ["strict-csp-candidate"]
        }
      ],
      responses: [
        {
          schemaVersion: 1,
          name: "Document response",
          surfaceId: "document",
          headers: options.csp
            ? {
                "Content-Security-Policy":
                  "default-src 'self'; script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAA=='; base-uri 'none'"
              }
            : { "X-Content-Type-Options": "nosniff" }
        }
      ],
      htmlDocuments: options.includeHtml
        ? [
            {
              schemaVersion: 1,
              name: "Document HTML",
              surfaceId: "document",
              html: '<script nonce="AAAAAAAAAAAAAAAAAAAAAA==">safe()</script>'
            }
          ]
        : []
    },
    evidenceSourceContext
  );
}

async function hstsReport(name: string, maxAge: number) {
  return inspectEvidenceBundle(
    {
      schemaVersion: 3,
      name,
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
          headers: { "Strict-Transport-Security": `max-age=${String(maxAge)}` }
        }
      ]
    },
    evidenceSourceContext
  );
}

describe("reduced evidence report comparison", () => {
  it("records deterministic finding and expected-surface regressions", async () => {
    const before = await report("Before", { csp: true, includeHtml: true });
    const after = await report("After", { csp: false, includeHtml: false });
    const first = await compareEvidenceReports(before, after);
    const second = await compareEvidenceReports(before, after);

    expect(first).toEqual(second);
    expect(first.summary.regressions).toBeGreaterThanOrEqual(2);
    expect(first.events.some((event) => event.type === "finding_regressed")).toBe(true);
    expect(first.events.some((event) => event.type === "surface_gap_added")).toBe(true);
    expect(first.events.every((event) => /^[a-f0-9]{24}$/u.test(event.id))).toBe(true);
    expect(JSON.stringify(first)).not.toContain("AAAAAAAAAAAAAAAAAAAAAA==");
    expect(JSON.stringify(first)).not.toContain("safe()");
  });

  it("records resolutions and incomparable evidence separately", async () => {
    const incomplete = await report("Incomplete", { csp: false, includeHtml: false });
    const complete = await report("Complete", { csp: true, includeHtml: true });
    const comparison = await compareEvidenceReports(incomplete, complete);

    expect(comparison.summary.resolutions).toBeGreaterThanOrEqual(2);
    expect(comparison.events.some((event) => event.type === "surface_gap_resolved")).toBe(true);
    expect(comparison.events.some((event) => event.type === "finding_resolved")).toBe(true);
  });

  it("records reduced evidence detail changes when the state remains observed", async () => {
    const before = await hstsReport("Before", 3600);
    const after = await hstsReport("After", 31_536_000);
    const comparison = await compareEvidenceReports(before, after);

    expect(comparison.compatible).toBe(true);
    expect(
      comparison.events.some(
        (event) =>
          event.type === "finding_changed" &&
          event.key === "finding:strict-transport-security" &&
          event.beforeState === "observed" &&
          event.afterState === "observed"
      )
    ).toBe(true);
  });

  it("refuses semantic comparison across analyser versions", async () => {
    const before = await hstsReport("Before", 3600);
    const originalAfter = await hstsReport("After", 3600);
    const { reportFingerprint, ...originalBody } = originalAfter;
    expect(reportFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const modifiedBody = {
      ...originalBody,
      provenance: {
        ...originalAfter.provenance,
        analyserVersion: "4.0.0"
      }
    };
    const after = {
      ...modifiedBody,
      reportFingerprint: await fingerprintEvidenceReportBody(modifiedBody)
    };
    const comparison = await compareEvidenceReports(before, after);

    expect(comparison.compatible).toBe(false);
    expect(comparison.summary.incomparable).toBe(1);
    expect(comparison.events).toEqual([expect.objectContaining({ key: "model:analyser-version" })]);
  });

  it("refuses semantic comparison across application or environment identities", async () => {
    const before = await hstsReport("Before", 3600);
    const originalAfter = await hstsReport("After", 3600);
    const { reportFingerprint, ...originalBody } = originalAfter;
    expect(reportFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const modifiedBody = {
      ...originalBody,
      identity: {
        ...originalAfter.identity,
        subject: {
          ...originalAfter.identity.subject,
          applicationId: "other-app",
          environment: "production"
        }
      }
    };
    const after = {
      ...modifiedBody,
      reportFingerprint: await fingerprintEvidenceReportBody(modifiedBody)
    };
    const comparison = await compareEvidenceReports(before, after);

    expect(comparison.compatible).toBe(false);
    expect(comparison.summary.incomparable).toBe(2);
    expect(comparison.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "identity:application-id" }),
        expect.objectContaining({ key: "identity:environment" })
      ])
    );
  });
});
