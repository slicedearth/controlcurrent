import { describe, expect, it } from "vitest";
import { sourceAge } from "../src/source-age";

describe("package source age", () => {
  const timestamp = "2026-10-01T12:00:00.000Z";
  it.each([
    ["2026-10-01T23:00:00.000Z", "0 days"],
    ["2026-10-02T12:00:00.000Z", "1 day"],
    ["2026-10-10T12:00:00.000Z", "9 days"]
  ])("uses elapsed whole days at %s", (now, label) => {
    expect(sourceAge(timestamp, Date.parse(now))).toBe(`Package age on this device: ${label}.`);
  });
  it("does not turn a future timestamp or invalid clock into a freshness claim", () => {
    expect(sourceAge(timestamp, 0)).toContain("ahead of this device's clock");
    expect(sourceAge("invalid", 0)).toBe("Package age unavailable.");
    expect(sourceAge(timestamp, NaN)).toBe("Package age unavailable.");
  });
});
