import { describe, expect, it } from "vitest";
import { importBrowserConfiguration, MAX_BROWSER_CONFIG_BYTES } from "../src/browser-config";

describe("browser configuration import", () => {
  it("imports explicit package.json browser minimums", () => {
    expect(
      importBrowserConfiguration(
        JSON.stringify({
          browserslist: ["chrome >= 120", "firefox 115", "ios_saf >= 17"]
        })
      )
    ).toEqual({
      schemaVersion: 1,
      name: "Imported browser configuration",
      baselines: [
        { browser: "chrome", minimumVersion: "120" },
        { browser: "firefox", minimumVersion: "115" },
        { browser: "safari_ios", minimumVersion: "17" }
      ]
    });
  });

  it("imports comments and blank lines from a browserslistrc file", () => {
    const result = importBrowserConfiguration(
      "# Explicit production minimums\nchrome >= 120\n\n# ESR\nfirefox = 115\n"
    );
    expect(result.baselines).toEqual([
      { browser: "chrome", minimumVersion: "120" },
      { browser: "firefox", minimumVersion: "115" }
    ]);
  });

  it("refuses dynamic queries and named environments", () => {
    expect(() => importBrowserConfiguration("last 2 versions")).toThrow(/explicit minimums/u);
    expect(() =>
      importBrowserConfiguration(
        JSON.stringify({ browserslist: { production: ["chrome >= 120"] } })
      )
    ).toThrow(/named Browserslist environments/u);
  });

  it("enforces byte and duplicate-browser bounds", () => {
    expect(() => importBrowserConfiguration("x".repeat(MAX_BROWSER_CONFIG_BYTES + 1))).toThrow(
      /byte limit/u
    );
    expect(() => importBrowserConfiguration("chrome >= 120\nchrome >= 121")).toThrow(
      /Duplicate browser baseline/u
    );
  });
});
