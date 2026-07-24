import { describe, expect, it } from "vitest";
import { createSourceUpdatePreview, renderSourceUpdatePreview } from "../src/source-update-preview";
import { feature, snapshot } from "./helpers";

describe("semantic source update previews", () => {
  it("summarises selected semantic changes without changing either snapshot", () => {
    const before = snapshot({
      "api.example": feature("api.example", {
        chrome: [{ version_added: "100" }]
      })
    });
    const after = snapshot(
      {
        "api.example": feature("api.example", {
          chrome: [{ version_added: "101" }]
        })
      },
      {
        bcdVersion: "1.1.0",
        bcdTimestamp: "2026-02-01T00:00:00.000Z",
        webFeaturesVersion: "1.1.0",
        schemaFingerprint: "b".repeat(64)
      }
    );
    const preview = createSourceUpdatePreview(before, after);
    const report = renderSourceUpdatePreview(preview);

    expect(preview.summary.totalEvents).toBeGreaterThan(0);
    expect(preview.summary.byType).toMatchObject({ support_version_corrected: 1 });
    expect(report).toContain("Semantic browser-source preview");
    expect(report).toContain("does not edit the lockfile");
    expect(createSourceUpdatePreview(before, after)).toEqual(preview);
  });
});
