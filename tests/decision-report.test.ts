import { describe, expect, it } from "vitest";
import { selectedSnapshot } from "../src/data";
import { exportDecisionReport } from "../src/decision-report";
import { evaluateProfile } from "../src/evaluate";
import { evaluatePolicyProfile } from "../src/policy";
import { buildPolicyProfile } from "../src/policy-builder";

const name = '<img src="https://example.invalid/a" onerror="alert(1)"> Review';
const profile = {
  schemaVersion: 1 as const,
  name,
  baselines: [
    { browser: "chrome" as const, minimumVersion: "120" },
    { browser: "safari" as const, minimumVersion: "17" }
  ]
};
const policy = buildPolicyProfile({
  profile,
  requiredControls: ["content-security-policy", "csp-nonces"],
  rules: {
    qualifications: "review",
    unknown: "fail",
    unsupported: "fail"
  },
  exceptions: []
});
const evaluation = evaluateProfile(selectedSnapshot, profile);
const decision = evaluatePolicyProfile(selectedSnapshot, policy, "2026-07-24");

describe("printable decision report", () => {
  it("escapes hostile labels and includes no active or remote content", async () => {
    const report = await exportDecisionReport(evaluation, decision);
    expect(report).toContain("&lt;img src=&quot;https://example.invalid/a&quot;");
    expect(report).not.toContain('<img src="https://example.invalid/a"');
    expect(report).not.toContain("<script");
    expect(report).toContain("connect-src 'none'");
    expect(report).toContain("What this report cannot prove");
    expect(report).toContain("Record fingerprints");
    expect(report).toMatch(/[a-f0-9]{64}/u);
    expect(await exportDecisionReport(evaluation, decision)).toBe(report);
  });

  it("refuses source and browser-plan mismatches", async () => {
    await expect(
      exportDecisionReport({ ...evaluation, bcdVersion: "future" }, decision)
    ).rejects.toThrow(/different source versions/u);
    await expect(
      exportDecisionReport(
        {
          ...evaluation,
          profile: { ...evaluation.profile, name: "A different browser plan" }
        },
        decision
      )
    ).rejects.toThrow(/different browser plans/u);
  });
});
