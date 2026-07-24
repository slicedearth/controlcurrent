import { describe, expect, it } from "vitest";
import { selectedSnapshot } from "../src/data";
import { evaluatePolicyProfile } from "../src/policy";
import { comparePolicyEvaluations } from "../src/policy-comparison";

const base = {
  schemaVersion: 1 as const,
  name: "Before policy",
  baselines: [{ browser: "chrome" as const, minimumVersion: "120" }],
  requiredControls: ["content-security-policy", "csp-nonces"],
  rules: {
    qualifications: "review" as const,
    unknown: "review" as const,
    unsupported: "fail" as const
  },
  exceptions: [
    {
      controlId: "csp-nonces",
      browsers: ["chrome" as const],
      outcomes: ["unsupported_mapping" as const],
      reason: "A reviewed fallback remains active during migration.",
      expiresOn: "2026-08-10"
    }
  ]
};

describe("browser policy drift", () => {
  it("separates scope, requirement, rule, exception and decision changes", () => {
    const before = evaluatePolicyProfile(selectedSnapshot, base, "2026-07-24");
    const after = evaluatePolicyProfile(
      selectedSnapshot,
      {
        ...base,
        name: "After policy",
        baselines: [{ browser: "chrome", minimumVersion: "100" }],
        requiredControls: ["content-security-policy"],
        rules: { ...base.rules, unknown: "fail" },
        exceptions: []
      },
      "2026-07-24"
    );
    const comparison = comparePolicyEvaluations(before, after, "2026-07-24", 30);
    const types = comparison.events.map((item) => item.type);

    expect(types).toContain("browser_scope_broadened");
    expect(types).toContain("requirement_removed");
    expect(types).toContain("rule_strengthened");
    expect(types).toContain("exception_removed");
    expect(comparison.summary.regressions).toBeGreaterThan(0);
    expect(comparison.summary.resolutions).toBeGreaterThan(0);
    expect(comparePolicyEvaluations(before, after, "2026-07-24", 30)).toEqual(comparison);
  });

  it("warns about expiring exceptions without treating them as failures", () => {
    const evaluation = evaluatePolicyProfile(selectedSnapshot, base, "2026-07-24");
    const comparison = comparePolicyEvaluations(evaluation, evaluation, "2026-07-24", 30);

    expect(comparison.summary.expiringExceptions).toBe(1);
    expect(comparison.events).toContainEqual(
      expect.objectContaining({
        type: "exception_expiring",
        severity: "review"
      })
    );
  });

  it("reports added and removed browsers, weaker rules and changed expired exceptions", () => {
    const before = evaluatePolicyProfile(selectedSnapshot, base, "2026-07-24");
    const after = evaluatePolicyProfile(
      selectedSnapshot,
      {
        ...base,
        name: "Changed policy",
        baselines: [{ browser: "safari", minimumVersion: "17" }],
        requiredControls: ["content-security-policy", "csp-nonces", "samesite-cookies"],
        rules: { ...base.rules, unsupported: "review" },
        exceptions: [
          {
            ...base.exceptions[0],
            browsers: ["safari"],
            reason: "A changed fallback record is now past its review date.",
            expiresOn: "2026-07-01"
          }
        ]
      },
      "2026-07-24"
    );
    const comparison = comparePolicyEvaluations(before, after, "2026-07-24");
    const types = comparison.events.map((item) => item.type);

    expect(types).toEqual(
      expect.arrayContaining([
        "browser_added",
        "browser_removed",
        "requirement_added",
        "rule_weakened",
        "exception_added",
        "exception_removed",
        "exception_expired"
      ])
    );
  });

  it("distinguishes narrowed, unorderable and context-only result changes", () => {
    const before = evaluatePolicyProfile(selectedSnapshot, base, "2026-07-24");
    const narrowed = evaluatePolicyProfile(
      selectedSnapshot,
      {
        ...base,
        name: "Narrower policy",
        baselines: [{ browser: "chrome", minimumVersion: "121" }]
      },
      "2026-07-24"
    );
    expect(
      comparePolicyEvaluations(before, narrowed, "2026-07-24").events.map((item) => item.type)
    ).toContain("browser_scope_narrowed");

    const unorderable = {
      ...before,
      profile: {
        ...before.profile,
        baselines: [{ browser: "chrome" as const, minimumVersion: "120.0" }]
      },
      findings: before.findings.map((finding) => ({
        ...finding,
        minimumVersion: "120.0"
      }))
    };
    expect(
      comparePolicyEvaluations(before, unorderable, "2026-07-24").events.map((item) => item.type)
    ).toContain("browser_minimum_changed");

    const first = before.findings[0];
    if (!first) throw new Error("Expected a policy finding.");
    const contextChanged = {
      ...before,
      findings: [
        {
          ...first,
          outcome:
            first.outcome === "available_unqualified"
              ? ("available_with_qualification" as const)
              : ("available_unqualified" as const)
        },
        ...before.findings.slice(1)
      ]
    };
    expect(
      comparePolicyEvaluations(before, contextChanged, "2026-07-24").events.map((item) => item.type)
    ).toContain("decision_context_changed");
  });

  it("records a changed exception independently of its resulting decision", () => {
    const before = evaluatePolicyProfile(selectedSnapshot, base, "2026-07-24");
    const after = evaluatePolicyProfile(
      selectedSnapshot,
      {
        ...base,
        exceptions: [
          {
            ...base.exceptions[0],
            reason: "The fallback record has a revised, independently reviewed rationale.",
            expiresOn: "2026-08-15"
          }
        ]
      },
      "2026-07-24"
    );
    expect(comparePolicyEvaluations(before, after, "2026-07-24").events).toContainEqual(
      expect.objectContaining({ type: "exception_changed", severity: "review" })
    );
  });

  it("rejects invalid comparison dates and warning windows", () => {
    const evaluation = evaluatePolicyProfile(selectedSnapshot, base, "2026-07-24");
    expect(() => comparePolicyEvaluations(evaluation, evaluation, "not-a-date")).toThrow(
      /Invalid policy comparison date/u
    );
    expect(() => comparePolicyEvaluations(evaluation, evaluation, "2026-07-24", 366)).toThrow(
      /between 0 and 365/u
    );
  });
});
