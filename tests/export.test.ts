import { describe, expect, it } from "vitest";
import {
  csvSafeCell,
  exportEvidenceBundleReport,
  exportEvidenceReportComparison,
  exportProfileEvaluation
} from "../src/export";
import { compareEvidenceReports } from "../src/evidence-comparison";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { evaluateProfile } from "../src/evaluate";
import { evidenceIdentity, evidenceSourceContext, feature, snapshot } from "./helpers";

describe("profile exports", () => {
  it("serialises deterministically", () => {
    const path = "http.headers.Content-Security-Policy";
    const selected = snapshot({
      [path]: feature(path, { chrome: [{ version_added: "100" }] })
    });
    const evaluation = evaluateProfile(selected, {
      schemaVersion: 1,
      name: "Example",
      baselines: [{ browser: "chrome", minimumVersion: "120" }]
    });
    expect(exportProfileEvaluation(evaluation)).toBe(exportProfileEvaluation(evaluation));
    expect(exportProfileEvaluation(evaluation)).toContain('"bcdVersion": "1.0.0"');
  });

  it("neutralizes spreadsheet formulas and quotes hostile text", () => {
    expect(csvSafeCell('=HYPERLINK("https://example.invalid")')).toBe(
      '"\'=HYPERLINK(""https://example.invalid"")"'
    );
    expect(csvSafeCell("line\r\nnext")).toBe('"line\nnext"');
    expect(csvSafeCell("\u0000plain")).toBe('"plain"');
  });

  it("exports only the reduced evidence report", async () => {
    const report = await inspectEvidenceBundle(
      {
        schemaVersion: 4,
        identity: evidenceIdentity,
        name: "Export",
        surfaces: [
          {
            id: "document",
            role: "document",
            requiredEvidence: ["html"],
            requiredControls: ["subresource-integrity"],
            requiredComposites: []
          }
        ],
        htmlDocuments: [
          {
            schemaVersion: 1,
            name: "Document",
            surfaceId: "document",
            html: '<script src="/private.js" integrity="sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"></script>'
          }
        ]
      },
      evidenceSourceContext
    );
    const exported = exportEvidenceBundleReport(report);

    expect(exported).toContain('"eligibleResourceCount": 1');
    expect(exported).not.toContain("/private.js");
    expect(exportEvidenceBundleReport(report)).toBe(exported);
  });

  it("exports deterministic reduced evidence comparisons", async () => {
    const before = await inspectEvidenceBundle(
      {
        schemaVersion: 4,
        identity: evidenceIdentity,
        name: "Before",
        surfaces: [
          {
            id: "document",
            role: "document",
            requiredEvidence: ["response"],
            requiredControls: ["content-security-policy", "x-content-type-options"],
            requiredComposites: []
          }
        ],
        responses: [
          {
            schemaVersion: 1,
            name: "Response",
            surfaceId: "document",
            headers: { "X-Content-Type-Options": "nosniff" }
          }
        ]
      },
      evidenceSourceContext
    );
    const after = await inspectEvidenceBundle(
      {
        schemaVersion: 4,
        identity: evidenceIdentity,
        name: "After",
        surfaces: [
          {
            id: "document",
            role: "document",
            requiredEvidence: ["response"],
            requiredControls: ["content-security-policy", "x-content-type-options"],
            requiredComposites: []
          }
        ],
        responses: [
          {
            schemaVersion: 1,
            name: "Response",
            surfaceId: "document",
            headers: { "Content-Security-Policy": "default-src 'none'" }
          }
        ]
      },
      evidenceSourceContext
    );
    const comparison = await compareEvidenceReports(before, after);
    const exported = exportEvidenceReportComparison(comparison);

    expect(JSON.parse(exported)).toMatchObject({
      schemaVersion: 3,
      beforeIdentity: evidenceIdentity,
      afterIdentity: evidenceIdentity
    });
    expect(exportEvidenceReportComparison(comparison)).toBe(exported);
  });
});
