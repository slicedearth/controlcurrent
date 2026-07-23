import { describe, expect, it } from "vitest";
import { compareBrowserVersions, thresholdState } from "../src/versions";

describe("browser version comparisons", () => {
  it("compares numeric browser versions without floating point shortcuts", () => {
    expect(compareBrowserVersions("15.10", "15.4")).toBe("after");
    expect(compareBrowserVersions("120", "120.0")).toBe("equal");
    expect(compareBrowserVersions("119", "120")).toBe("before");
  });

  it("refuses preview and malformed values", () => {
    expect(compareBrowserVersions("preview", "120")).toBe("unknown");
    expect(compareBrowserVersions("current", "120")).toBe("unknown");
  });

  it("handles exact and imprecise support thresholds", () => {
    expect(thresholdState("120", "108")).toBe("met");
    expect(thresholdState("107", "108")).toBe("not_met");
    expect(thresholdState("120", "≤108")).toBe("met");
    expect(thresholdState("100", "≤108")).toBe("uncertain");
    expect(thresholdState("17", "16.4-16.5")).toBe("met");
    expect(thresholdState("preview", "108")).toBe("uncertain");
  });
});
