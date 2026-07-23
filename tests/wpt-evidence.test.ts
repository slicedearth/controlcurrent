import { describe, expect, it } from "vitest";
import { SECURITY_CONTROLS } from "../src/catalogue";
import {
  WPT_EVIDENCE,
  WPT_EVIDENCE_REVIEW,
  getWptEvidence,
  wptResultsUrl,
  wptSourceUrl
} from "../src/wpt-evidence";

describe("WPT evidence registry", () => {
  it("covers every control exactly once", () => {
    expect(WPT_EVIDENCE).toHaveLength(SECURITY_CONTROLS.length);
    expect(new Set(WPT_EVIDENCE.map((mapping) => mapping.controlId)).size).toBe(
      SECURITY_CONTROLS.length
    );
    expect(WPT_EVIDENCE.map((mapping) => mapping.controlId)).toEqual(
      SECURITY_CONTROLS.map((control) => control.id)
    );
  });

  it("keeps mapped and unmapped evidence explicit", () => {
    expect(WPT_EVIDENCE.filter((mapping) => mapping.state === "mapped")).toHaveLength(27);
    expect(
      WPT_EVIDENCE.filter((mapping) => mapping.state === "not_mapped").map(
        (mapping) => mapping.controlId
      )
    ).toEqual(["strict-transport-security", "httponly-cookies"]);

    for (const mapping of WPT_EVIDENCE) {
      expect(mapping.scope.length).toBeGreaterThan(20);
      expect(mapping.limitation.length).toBeGreaterThan(40);
      expect(mapping.suites.length).toBeLessThanOrEqual(4);
      if (mapping.state === "mapped") {
        expect(mapping.suites.length).toBeGreaterThan(0);
      } else {
        expect(mapping.suites).toHaveLength(0);
      }
      for (const suite of mapping.suites) {
        expect(suite.path).toMatch(/^[a-z0-9][a-z0-9/-]*$/u);
      }
    }
  });

  it("pins source links while leaving results links explicitly current", () => {
    const mapping = getWptEvidence("trusted-types");
    const suite = mapping.suites[0];
    expect(suite).toBeDefined();
    if (!suite) throw new Error("Missing trusted-types WPT suite");
    expect(wptSourceUrl(suite.path)).toContain(WPT_EVIDENCE_REVIEW.revision);
    expect(wptSourceUrl(suite.path)).toBe(
      `https://github.com/web-platform-tests/wpt/tree/${WPT_EVIDENCE_REVIEW.revision}/trusted-types`
    );
    expect(wptResultsUrl(suite.path)).toBe(
      "https://wpt.fyi/results/trusted-types?label=master&label=experimental&aligned"
    );
  });

  it("refuses unknown controls", () => {
    expect(() => getWptEvidence("unknown-control")).toThrow(/Unknown WPT evidence control/u);
  });
});
