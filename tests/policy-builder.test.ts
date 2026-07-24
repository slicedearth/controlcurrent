import { describe, expect, it } from "vitest";
import { buildPolicyProfile, exportPolicyProfile } from "../src/policy-builder";

const profile = {
  schemaVersion: 1 as const,
  name: "Production browser minimums",
  baselines: [
    { browser: "chrome" as const, minimumVersion: "120" },
    { browser: "firefox" as const, minimumVersion: "115" }
  ]
};

const rules = {
  qualifications: "review" as const,
  unknown: "fail" as const,
  unsupported: "fail" as const
};

describe("browser policy builder", () => {
  it("builds and exports a deterministic policy", () => {
    const policy = buildPolicyProfile({
      profile,
      requiredControls: ["content-security-policy", "strict-transport-security"],
      rules,
      exceptions: [
        {
          controlId: "content-security-policy",
          browsers: ["firefox"],
          outcomes: ["available_with_qualification"],
          reason: "A reviewed fallback remains deployed during this migration.",
          expiresOn: "2026-08-31"
        }
      ]
    });
    const exported = exportPolicyProfile(policy);
    expect(JSON.parse(exported)).toEqual(policy);
    expect(exportPolicyProfile(policy)).toBe(exported);
  });

  it("refuses unknown features and exceptions outside the selected policy", () => {
    expect(() =>
      buildPolicyProfile({
        profile,
        requiredControls: ["not-a-feature"],
        rules,
        exceptions: []
      })
    ).toThrow(/Unknown required feature/u);
    expect(() =>
      buildPolicyProfile({
        profile,
        requiredControls: ["content-security-policy"],
        rules,
        exceptions: [
          {
            controlId: "strict-transport-security",
            outcomes: ["unavailable"],
            reason: "This exception does not belong to a required feature.",
            expiresOn: "2026-08-31"
          }
        ]
      })
    ).toThrow(/required security feature/u);
  });

  it("refuses exception browsers outside the browser plan", () => {
    expect(() =>
      buildPolicyProfile({
        profile,
        requiredControls: ["content-security-policy"],
        rules,
        exceptions: [
          {
            controlId: "content-security-policy",
            browsers: ["safari"],
            outcomes: ["unavailable"],
            reason: "This browser is not part of the selected browser plan.",
            expiresOn: "2026-08-31"
          }
        ]
      })
    ).toThrow(/included in the browser plan/u);
  });
});
