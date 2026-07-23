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
import { feature, snapshot } from "./helpers";

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
    const report = await inspectEvidenceBundle({
      schemaVersion: 1,
      name: "Export",
      htmlDocuments: [
        {
          schemaVersion: 1,
          name: "Document",
          html: '<script src="/private.js" integrity="sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"></script>'
        }
      ]
    });
    const exported = exportEvidenceBundleReport(report);

    expect(exported).toContain('"eligibleResourceCount": 1');
    expect(exported).not.toContain("/private.js");
    expect(exportEvidenceBundleReport(report)).toBe(exported);
  });

  it("exports deterministic reduced evidence comparisons", async () => {
    const before = await inspectEvidenceBundle({
      schemaVersion: 1,
      name: "Before",
      responses: [
        {
          schemaVersion: 1,
          name: "Response",
          headers: { "X-Content-Type-Options": "nosniff" }
        }
      ]
    });
    const after = await inspectEvidenceBundle({
      schemaVersion: 1,
      name: "After",
      responses: [
        {
          schemaVersion: 1,
          name: "Response",
          headers: { "Content-Security-Policy": "default-src 'none'" }
        }
      ]
    });
    const comparison = await compareEvidenceReports(before, after);
    const exported = exportEvidenceReportComparison(comparison);

    expect(exported).toContain('"schemaVersion": 1');
    expect(exportEvidenceReportComparison(comparison)).toBe(exported);
  });
});
