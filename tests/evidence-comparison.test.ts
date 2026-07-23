import { describe, expect, it } from "vitest";
import { compareEvidenceReports } from "../src/evidence-comparison";
import { inspectEvidenceBundle } from "../src/evidence-bundle";

async function report(name: string, options: { csp: boolean; includeHtml: boolean }) {
  return inspectEvidenceBundle({
    schemaVersion: 1,
    name,
    surfaces: [
      {
        id: "document",
        role: "document",
        requiredEvidence: ["response", "html"]
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
  });
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
});
