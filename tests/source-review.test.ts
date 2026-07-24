import { describe, expect, it } from "vitest";
import { summariseSourceReview } from "../src/source-review";

describe("source review summaries", () => {
  it("summarises only the reviewed browser-data packages", () => {
    const summary = summariseSourceReview({
      "@mdn/browser-compat-data": {
        current: "8.0.7",
        wanted: "8.0.7",
        latest: "8.1.0",
        location: "node_modules/@mdn/browser-compat-data"
      },
      "web-features": {
        current: "3.34.1",
        wanted: "3.35.0",
        latest: "3.35.0"
      },
      unrelated: {
        current: "1.0.0",
        wanted: "2.0.0",
        latest: "2.0.0"
      }
    });

    expect(summary).toContain("Review newer release");
    expect(summary).toContain("Review compatible update");
    expect(summary).not.toContain("unrelated");
    expect(summary).toContain("does not edit the lockfile");
  });

  it("reports a clean check without inventing registry versions", () => {
    const summary = summariseSourceReview(
      {},
      {
        "@mdn/browser-compat-data": "8.0.7",
        "web-features": "3.34.1"
      }
    );
    expect(summary).toContain("No update reported");
    expect(summary).toContain("8.0.7");
    expect(summary).toContain("3.34.1");
  });

  it("rejects hostile version fields", () => {
    expect(() =>
      summariseSourceReview({
        "web-features": {
          current: "3.34.1",
          wanted: "3.35.0",
          latest: "3.35.0 | injected"
        }
      })
    ).toThrow();
  });
});
