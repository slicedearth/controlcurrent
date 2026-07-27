import { describe, expect, it } from "vitest";
import { selectedSnapshot } from "../src/data";
import { evaluateProfile } from "../src/evaluate";
import {
  compareProfileEvaluations,
  exportEngineeringReport,
  importDeploymentProfile,
  MAX_PROFILE_IMPORT_BYTES
} from "../src/profile-workflows";

describe("planner workflows", () => {
  const before = evaluateProfile(selectedSnapshot, {
    schemaVersion: 1,
    name: "Before",
    baselines: [
      { browser: "chrome", minimumVersion: "90" },
      { browser: "safari", minimumVersion: "16" }
    ]
  });
  const after = evaluateProfile(selectedSnapshot, {
    schemaVersion: 1,
    name: "After",
    baselines: [
      { browser: "chrome", minimumVersion: "120" },
      { browser: "firefox", minimumVersion: "120" }
    ]
  });

  it("imports a profile directly or from an exported evaluation", () => {
    expect(importDeploymentProfile(JSON.stringify(before.profile))).toEqual(before.profile);
    expect(importDeploymentProfile(JSON.stringify(before))).toEqual(before.profile);
    expect(() => importDeploymentProfile("x".repeat(MAX_PROFILE_IMPORT_BYTES + 1))).toThrow(
      /byte limit/u
    );
    expect(() => importDeploymentProfile('{"schemaVersion":2}')).toThrow();
  });

  it("compares profile outcomes and scope deterministically", () => {
    const comparison = compareProfileEvaluations(before, after);
    expect(comparison.beforeProfile.name).toBe("Before");
    expect(comparison.afterProfile.name).toBe("After");
    expect(comparison.summary.scopeAdded).toBeGreaterThan(0);
    expect(comparison.summary.scopeRemoved).toBeGreaterThan(0);
    expect(comparison.events[0]).toMatchObject({
      controlId: "content-security-policy",
      browser: "chrome"
    });
    expect(compareProfileEvaluations(before, after)).toEqual(comparison);
  });

  it("refuses comparison across source versions", () => {
    expect(() => compareProfileEvaluations(before, { ...after, bcdVersion: "future" })).toThrow(
      /same BCD and catalogue/u
    );
  });

  it("exports a deterministic bounded engineering report", () => {
    const comparison = compareProfileEvaluations(before, after);
    const report = exportEngineeringReport(after, comparison);
    expect(report).toContain("# ControlCurrent engineering report");
    expect(report).toContain("Compared **Before** with **After**.");
    expect(report).toContain("Compatibility evidence does not establish");
    expect(exportEngineeringReport(after, comparison)).toBe(report);
  });

  it("escapes every Markdown metacharacter and control character in profile names", () => {
    const markdownCharacters = [
      "\\",
      "\\",
      "|",
      "`",
      "*",
      "_",
      "{",
      "}",
      "[",
      "]",
      "(",
      ")",
      "#",
      "+",
      ".",
      "!",
      "<",
      ">",
      "-"
    ];
    const hostile = {
      ...after,
      profile: {
        ...after.profile,
        name: `${markdownCharacters.join("")}\nnext`
      }
    };

    const report = exportEngineeringReport(hostile);
    expect(report).toContain(
      `**${markdownCharacters.map((character) => `\\${character}`).join("")} next**`
    );
    expect(report).not.toContain("\nnext");
  });
});
