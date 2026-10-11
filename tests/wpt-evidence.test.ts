import { describe, expect, it } from "vitest";
import { DIRECTIVE_CONTROLS, SECURITY_CONTROLS } from "../src/catalogue";
import { inspectHeaders, parseHeaderBlock } from "../src/assurance";
import {
  WPT_EVIDENCE,
  WPT_EVIDENCE_REVIEW,
  WPT_DIRECTIVE_REVIEW,
  getWptEvidence,
  getWptSourceReview,
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
    expect(WPT_EVIDENCE.filter((mapping) => mapping.state === "mapped")).toHaveLength(34);
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
        if (suite.tests) {
          expect(suite.tests.length).toBeGreaterThan(0);
          expect(suite.tests.length).toBeLessThanOrEqual(4);
          expect(new Set(suite.tests).size).toBe(suite.tests.length);
          for (const path of suite.tests) {
            expect(path.startsWith(`${suite.path}/`)).toBe(true);
            expect(path).not.toContain("..");
            expect(path).toMatch(/^[a-z0-9][a-z0-9/.-]+\.html$/u);
          }
        }
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

  it("pins the six directive file selections independently of the original suite registry", () => {
    expect(getWptSourceReview(getWptEvidence("permissions-policy"))).toEqual(WPT_EVIDENCE_REVIEW);
    for (const control of DIRECTIVE_CONTROLS) {
      const mapping = getWptEvidence(control.id);
      expect(mapping.state).toBe("mapped");
      expect(getWptSourceReview(mapping)).toEqual(WPT_DIRECTIVE_REVIEW);
      for (const suite of mapping.suites) {
        expect(suite.tests?.length).toBeGreaterThan(0);
        for (const path of suite.tests ?? []) {
          expect(wptSourceUrl(path, getWptSourceReview(mapping).revision, "blob")).toBe(
            `https://github.com/web-platform-tests/wpt/blob/${WPT_DIRECTIVE_REVIEW.revision}/${path}`
          );
          expect(new URL(wptResultsUrl(path)).pathname).toBe(`/results/${path}`);
        }
      }
    }
  });

  it("does not promote conformance mappings to application directive evidence", () => {
    const report = inspectHeaders(
      parseHeaderBlock(
        'Permissions-Policy: camera=(), microphone=(), geolocation=()\nClear-Site-Data: "cache", "cookies", "storage"'
      )
    );
    for (const control of DIRECTIVE_CONTROLS) {
      expect(getWptEvidence(control.id).state).toBe("mapped");
      expect(report.findings.find((finding) => finding.controlId === control.id)?.state).toBe(
        "not_evaluated"
      );
    }
  });
});
