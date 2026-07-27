import { createRequire } from "node:module";
import type { CompatData } from "@mdn/browser-compat-data";
import { describe, expect, it } from "vitest";
import selected from "../data/selected-bcd.json";
import {
  featureEvaluationSchema,
  selectedFeatureSchema,
  supportStatementSchema
} from "../src/contracts";
import { buildSelectedSnapshot, resolveIdentifier } from "../src/source";

const require = createRequire(import.meta.url);
const bcd = require("@mdn/browser-compat-data") as CompatData;

describe("locked BCD source selection", () => {
  it("reproduces the committed selected subset exactly", () => {
    expect(buildSelectedSnapshot(bcd, { webFeaturesVersion: selected.webFeaturesVersion })).toEqual(
      selected
    );
    expect(Object.keys(selected.features)).toHaveLength(36);
    expect(selected.bcdVersion).toBe(bcd.__meta.version);
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

  it("refuses source links that could execute or disclose credentials", () => {
    const feature = selectedFeatureSchema.parse(selected.features["http.headers.Clear-Site-Data"]);

    expect(() =>
      selectedFeatureSchema.parse({
        ...feature,
        mdnUrl: "javascript:alert(1)"
      })
    ).toThrow(/Source URLs must use HTTPS/u);
    expect(() =>
      selectedFeatureSchema.parse({
        ...feature,
        mdnUrl: "https://example.com/not-mdn"
      })
    ).toThrow(/developer\.mozilla\.org/u);
    expect(() =>
      selectedFeatureSchema.parse({
        ...feature,
        specUrls: ["https://user:password@example.com/specification"]
      })
    ).toThrow(/without embedded credentials/u);
    expect(() =>
      supportStatementSchema.parse({
        version_added: "1",
        impl_url: "data:text/html,<script>alert(1)</script>"
      })
    ).toThrow(/Source URLs must use HTTPS/u);
    expect(() =>
      featureEvaluationSchema.parse({
        path: "http.headers.Clear-Site-Data",
        browser: "chrome",
        minimumVersion: "120",
        outcome: "available_unqualified",
        qualifications: [],
        sourceUrl: "file:///private/source"
      })
    ).toThrow(/Source URLs must use HTTPS/u);
  });
});
