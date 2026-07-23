import { describe, expect, it } from "vitest";
import type { SecurityControl } from "../src/catalogue";
import { evaluateControl, evaluateFeature, evaluateProfile } from "../src/evaluate";
import { feature, snapshot } from "./helpers";

const baseline = { browser: "chrome" as const, minimumVersion: "120" };

describe("feature evaluation", () => {
  it("reports unqualified, unavailable, and removed support", () => {
    expect(
      evaluateFeature(feature("example", { chrome: [{ version_added: "100" }] }), baseline).outcome
    ).toBe("available_unqualified");
    expect(
      evaluateFeature(feature("example", { chrome: [{ version_added: "121" }] }), baseline).outcome
    ).toBe("unavailable");
    expect(
      evaluateFeature(
        feature("example", {
          chrome: [{ version_added: "100", version_removed: "110" }]
        }),
        baseline
      ).outcome
    ).toBe("removed");
    expect(
      evaluateFeature(
        feature("example", { chrome: [{ version_added: "100", version_last: "110" }] }),
        baseline
      ).outcome
    ).toBe("removed");
  });

  it("preserves every recorded qualification", () => {
    const result = evaluateFeature(
      feature("example", {
        chrome: [
          {
            version_added: "100",
            partial_implementation: true,
            prefix: "-webkit-",
            alternative_name: "LegacyName",
            flags: [{ type: "preference", name: "feature.enabled" }],
            notes: ["First note", "Second note"]
          }
        ]
      }),
      baseline
    );
    expect(result.outcome).toBe("available_with_qualification");
    expect(result.qualifications).toEqual([
      "Partial implementation",
      "Requires preference: feature.enabled",
      "Uses prefix -webkit-",
      "Uses alternative name LegacyName",
      "First note",
      "Second note"
    ]);
  });

  it("handles unknown and imprecise support statements", () => {
    expect(
      evaluateFeature(feature("example", { chrome: [{ version_added: null }] }), baseline).outcome
    ).toBe("unknown");
    expect(
      evaluateFeature(feature("example", { chrome: [{ version_added: true }] }), baseline).outcome
    ).toBe("available_with_qualification");
    expect(
      evaluateFeature(feature("example", { chrome: [{ version_added: "≤125" }] }), baseline).outcome
    ).toBe("unknown");
    expect(
      evaluateFeature(feature("example", { chrome: [{ version_added: "≤100" }] }), baseline).outcome
    ).toBe("available_with_qualification");
    expect(
      evaluateFeature(
        feature("example", {
          chrome: [{ version_added: "100", version_removed: "preview" }]
        }),
        baseline
      ).outcome
    ).toBe("unknown");
    expect(
      evaluateFeature(
        feature("example", { chrome: [{ version_added: "100", version_last: "preview" }] }),
        baseline
      ).outcome
    ).toBe("unknown");
  });

  it("selects an unqualified statement from multiple alternatives", () => {
    const result = evaluateFeature(
      feature("example", {
        chrome: [{ version_added: "100", alternative_name: "LegacyName" }, { version_added: "110" }]
      }),
      baseline
    );
    expect(result.outcome).toBe("available_unqualified");
    expect(result.statements).toHaveLength(2);
  });

  it("keeps a missing browser statement unknown", () => {
    const selected = feature("example", {});
    delete selected.support.chrome;
    const result = evaluateFeature(selected, baseline);
    expect(result.outcome).toBe("unknown");
    expect(result.qualifications).toContain("BCD has no support statement for this browser");
  });
});

describe("control and profile evaluation", () => {
  const allControl: SecurityControl = {
    id: "test-control",
    name: "Test",
    shortName: "Test",
    category: "Content execution",
    summary: "Test",
    threatClasses: [],
    doesNotAddress: [],
    prerequisites: [],
    fallback: "Fallback",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["one", "two"],
    specificationUrls: []
  };

  it("requires every path for an all mapping", () => {
    const selected = snapshot({
      one: feature("one", { chrome: [{ version_added: "100" }] }),
      two: feature("two", { chrome: [{ version_added: false }] })
    });
    const result = evaluateControl(allControl, selected, baseline);
    expect(result.outcome).toBe("unavailable");
    expect(result.featureEvaluations).toHaveLength(2);
  });

  it("fails closed when a mapped path is missing", () => {
    const selected = snapshot({
      one: feature("one", { chrome: [{ version_added: "100" }] })
    });
    expect(evaluateControl(allControl, selected, baseline).outcome).toBe("source_inconsistent");
  });

  it("marks deliberately unsupported mappings without guessing", () => {
    const control = {
      ...allControl,
      mappingState: "unsupported" as const,
      bcdPaths: [],
      mappingNote: "No standalone BCD statement."
    };
    const result = evaluateControl(control, snapshot({}), baseline);
    expect(result.outcome).toBe("unsupported_mapping");
    expect(result.explanation).toBe("No standalone BCD statement.");
  });

  it("accepts any one available feature for an any mapping", () => {
    const selected = snapshot({
      one: feature("one", { chrome: [{ version_added: false }] }),
      two: feature("two", { chrome: [{ version_added: "100", notes: "Qualified" }] })
    });
    const result = evaluateControl({ ...allControl, combination: "any" }, selected, baseline);
    expect(result.outcome).toBe("available_with_qualification");
  });

  it("evaluates the complete catalogue deterministically", () => {
    const paths = [
      "http.headers.Content-Security-Policy",
      "http.headers.Content-Security-Policy.strict-dynamic",
      "api.trustedTypes",
      "http.headers.Content-Security-Policy.require-trusted-types-for",
      "html.elements.script.integrity",
      "html.elements.link.integrity",
      "http.headers.Cross-Origin-Opener-Policy",
      "http.headers.Cross-Origin-Embedder-Policy",
      "http.headers.Cross-Origin-Resource-Policy",
      "http.headers.Sec-Fetch-Dest",
      "http.headers.Sec-Fetch-Mode",
      "http.headers.Sec-Fetch-Site",
      "http.headers.Sec-Fetch-User",
      "http.headers.Permissions-Policy",
      "http.headers.Referrer-Policy",
      "http.headers.Set-Cookie.SameSite",
      "http.headers.Set-Cookie.Partitioned",
      "api.PublicKeyCredential.isConditionalMediationAvailable_static"
    ];
    const features = Object.fromEntries(
      paths.map((path) => [path, feature(path, { chrome: [{ version_added: "100" }] })])
    );
    const selected = snapshot(features);
    const profile = {
      schemaVersion: 1 as const,
      name: "Test profile",
      baselines: [baseline]
    };
    expect(evaluateProfile(selected, profile)).toEqual(evaluateProfile(selected, profile));
    expect(Object.keys(evaluateProfile(selected, profile).results)).toHaveLength(15);
  });
});
