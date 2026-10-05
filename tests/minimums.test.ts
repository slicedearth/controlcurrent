import { describe, expect, it } from "vitest";
import { selectedSnapshot } from "../src/data";
import { findMinimumBaselines } from "../src/minimums";

describe("minimum browser baselines", () => {
  it("finds the earliest recorded release satisfying all controls", () => {
    const result = findMinimumBaselines(selectedSnapshot, {
      controlIds: ["content-security-policy", "referrer-policy"],
      browsers: ["chrome", "firefox"],
      allowQualified: false
    });

    expect(result).toEqual([
      {
        browser: "chrome",
        status: "found",
        minimumVersion: "56",
        releaseDate: "2017-01-25",
        blockers: []
      },
      {
        browser: "firefox",
        status: "found",
        minimumVersion: "50",
        releaseDate: "2016-11-15",
        blockers: []
      }
    ]);
  });

  it("reports unsupported mappings without guessing", () => {
    expect(
      findMinimumBaselines(selectedSnapshot, {
        controlIds: ["csp-nonces"],
        browsers: ["safari"],
        allowQualified: true
      })
    ).toEqual([
      {
        browser: "safari",
        status: "unsupported_mapping",
        blockers: ["csp-nonces"]
      }
    ]);
  });

  it("orders accepted source releases numerically and refuses incomparable labels", () => {
    const source = structuredClone(selectedSnapshot);
    source.browsers.chrome.releases = ["56", "50", "152"].map((version) => ({
      version,
      status: "retired",
      releaseDate: "2026-01-01"
    }));
    const request = {
      controlIds: ["content-security-policy", "referrer-policy"],
      browsers: ["chrome"],
      allowQualified: false
    };
    expect(findMinimumBaselines(source, request)[0]).toMatchObject({
      status: "found",
      minimumVersion: "56"
    });
    const first = source.browsers.chrome.releases[0];
    if (!first) throw new Error("Missing synthetic release");
    first.version = "unknown-label";
    expect(findMinimumBaselines(source, request)[0]).toMatchObject({
      status: "source_inconsistent"
    });
  });

  it("does not select the earlier Safari support interval before a recorded removal", () => {
    for (const browser of ["safari", "safari_ios"] as const) {
      expect(
        findMinimumBaselines(selectedSnapshot, {
          controlIds: ["partitioned-cookies"],
          browsers: [browser],
          allowQualified: true
        })[0]
      ).toMatchObject({ status: "found", minimumVersion: "26.2" });
    }
  });

  it("can accept qualified support explicitly", () => {
    const strict = findMinimumBaselines(selectedSnapshot, {
      controlIds: ["cross-origin-resource-policy"],
      browsers: ["chrome"],
      allowQualified: false
    });
    const qualified = findMinimumBaselines(selectedSnapshot, {
      controlIds: ["cross-origin-resource-policy"],
      browsers: ["chrome"],
      allowQualified: true
    });

    expect(strict[0]).toMatchObject({ status: "unavailable" });
    expect(qualified[0]).toMatchObject({ status: "found", minimumVersion: "73" });
  });
});
