import { describe, expect, it } from "vitest";
import { selectedSnapshot } from "../src/data";
import { evaluatePolicyProfile } from "../src/policy";

const profile = {
  schemaVersion: 1 as const,
  name: "Test policy",
  baselines: [
    { browser: "chrome" as const, minimumVersion: "120" },
    { browser: "safari" as const, minimumVersion: "17" }
  ],
  requiredControls: ["content-security-policy", "samesite-cookies", "csp-nonces"],
  rules: {
    qualifications: "review" as const,
    unknown: "fail" as const,
    unsupported: "fail" as const
  },
  exceptions: []
};

describe("policy profiles", () => {
  it("classifies unqualified, qualified, and unsupported outcomes", () => {
    const result = evaluatePolicyProfile(selectedSnapshot, profile, "2026-07-23");

    expect(result.summary).toEqual({ pass: 3, review: 1, fail: 2 });
    expect(
      result.findings.find(
        (finding) => finding.controlId === "samesite-cookies" && finding.browser === "safari"
      )
    ).toMatchObject({
      outcome: "available_with_qualification",
      decision: "review"
    });
  });

  it("converts an active exception to a review without hiding it", () => {
    const result = evaluatePolicyProfile(
      selectedSnapshot,
      {
        ...profile,
        exceptions: [
          {
            controlId: "csp-nonces",
            browsers: ["safari"],
            outcomes: ["unsupported_mapping"],
            reason: "A tested CSP fallback remains deployed during migration.",
            expiresOn: "2026-08-31"
          }
        ]
      },
      "2026-07-23"
    );

    const finding = result.findings.find(
      (candidate) => candidate.controlId === "csp-nonces" && candidate.browser === "safari"
    );
    expect(finding).toMatchObject({
      decision: "review",
      exceptionState: "active",
      exceptionExpiresOn: "2026-08-31"
    });
  });

  it("does not apply an expired exception", () => {
    const result = evaluatePolicyProfile(
      selectedSnapshot,
      {
        ...profile,
        exceptions: [
          {
            controlId: "csp-nonces",
            outcomes: ["unsupported_mapping"],
            reason: "This temporary exception has reached its review date.",
            expiresOn: "2026-07-01"
          }
        ]
      },
      "2026-07-23"
    );

    expect(result.findings.find((candidate) => candidate.controlId === "csp-nonces")).toMatchObject(
      {
        decision: "fail",
        exceptionState: "expired"
      }
    );
  });

  it("rejects unknown controls", () => {
    expect(() =>
      evaluatePolicyProfile(
        selectedSnapshot,
        { ...profile, requiredControls: ["not-a-control"] },
        "2026-07-23"
      )
    ).toThrow("Unknown required control");
  });

  it("rejects overlapping exception matches before evaluation", () => {
    expect(() =>
      evaluatePolicyProfile(
        selectedSnapshot,
        {
          ...profile,
          exceptions: [
            {
              controlId: "csp-nonces",
              outcomes: ["unsupported_mapping"],
              reason: "A broad temporary exception is under active review.",
              expiresOn: "2026-08-31"
            },
            {
              controlId: "csp-nonces",
              browsers: ["safari"],
              outcomes: ["unsupported_mapping"],
              reason: "A narrower exception must not depend on array order.",
              expiresOn: "2026-09-30"
            }
          ]
        },
        "2026-07-23"
      )
    ).toThrow(/must not overlap/u);
  });
});
