import { createRequire } from "node:module";
import type { CompatData } from "@mdn/browser-compat-data";
import { describe, expect, it } from "vitest";
import selected from "../data/selected-bcd.json";
import { buildSelectedSnapshot, resolveIdentifier } from "../src/source";

const require = createRequire(import.meta.url);
const bcd = require("@mdn/browser-compat-data") as CompatData;

describe("locked BCD source selection", () => {
  it("reproduces the committed selected subset exactly", () => {
    expect(buildSelectedSnapshot(bcd, { webFeaturesVersion: "3.34.1" })).toEqual(selected);
    expect(Object.keys(selected.features)).toHaveLength(36);
    expect(selected.bcdVersion).toBe("8.0.7");
  });

  it("fails when a configured feature path disappears or is hostile", () => {
    expect(() => resolveIdentifier(bcd, "http.headers.Not-A-Real-Header")).toThrow(
      /path is missing/u
    );
    expect(() => resolveIdentifier(bcd, "__proto__.polluted")).toThrow(/Invalid BCD feature path/u);
    expect(() => resolveIdentifier(bcd, "browsers.chrome.name")).toThrow(
      /does not resolve to an identifier/u
    );
    expect(() => resolveIdentifier(bcd, "http.headers")).toThrow(/has no __compat statement/u);
  });
});
