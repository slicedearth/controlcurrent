import { describe, expect, it } from "vitest";
import { csvSafeCell, exportProfileEvaluation } from "../src/export";
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
});
