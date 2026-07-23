import { describe, expect, it } from "vitest";
import { baselineEvent, compareSnapshots } from "../src/changes";
import type { SupportStatement } from "../src/contracts";
import { feature, snapshot } from "./helpers";

describe("selected BCD change events", () => {
  it("creates a deterministic baseline event", () => {
    const selected = snapshot({});
    expect(baselineEvent(selected)).toEqual(baselineEvent(selected));
    expect(baselineEvent(selected).type).toBe("baseline_established");
  });

  it("distinguishes support, qualification, path, mapping, and release changes", () => {
    const before = snapshot(
      {
        changed: feature("changed", { chrome: [{ version_added: false }] }),
        removed: feature("removed", { chrome: [{ version_added: "100" }] })
      },
      {
        controlMappings: [
          {
            controlId: "one",
            mappingState: "active",
            combination: "all",
            paths: ["changed"]
          }
        ]
      }
    );
    const after = snapshot(
      {
        changed: feature("changed", {
          chrome: [{ version_added: "100", partial_implementation: true }]
        }),
        added: feature("added", { chrome: [{ version_added: "120" }] })
      },
      {
        bcdVersion: "1.1.0",
        bcdTimestamp: "2026-02-01T00:00:00.000Z",
        controlMappings: [
          {
            controlId: "one",
            mappingState: "active",
            combination: "all",
            paths: ["changed", "added"]
          }
        ],
        browsers: {
          ...before.browsers,
          chrome: {
            ...before.browsers.chrome,
            releases: [
              ...before.browsers.chrome.releases,
              { version: "121", status: "current", releaseDate: "2026-02-01" }
            ]
          }
        }
      }
    );
    const types = compareSnapshots(before, after).map((event) => event.type);
    expect(types).toContain("selected_path_added");
    expect(types).toContain("selected_path_removed");
    expect(types).toContain("partial_support_added");
    expect(types).toContain("control_mapping_changed");
    expect(types).toContain("browser_release_added");
  });

  it("marks missing browser statements as incomparable", () => {
    const before = snapshot({ one: feature("one", {}) });
    const after = structuredClone(before);
    const changedFeature = after.features.one;
    if (!changedFeature) throw new Error("Missing test feature.");
    delete changedFeature.support.chrome;
    expect(
      compareSnapshots(before, after).some((event) => event.type === "source_became_incomparable")
    ).toBe(true);
  });

  it.each([
    [
      { version_added: "100", flags: [{ type: "preference" as const, name: "flag" }] },
      { version_added: "100" },
      "flag_requirement_removed"
    ],
    [
      { version_added: "100" },
      { version_added: "100", flags: [{ type: "preference" as const, name: "flag" }] },
      "flag_requirement_added"
    ],
    [{ version_added: "100" }, { version_added: "100", prefix: "-x-" }, "prefix_changed"],
    [
      { version_added: "100" },
      { version_added: "100", alternative_name: "Legacy" },
      "alternative_name_changed"
    ],
    [{ version_added: "100" }, { version_added: "100", notes: "Qualified" }, "note_changed"],
    [{ version_added: "100" }, { version_added: "100", version_removed: "130" }, "support_removed"],
    [
      { version_added: "100", version_removed: "130" },
      { version_added: "100" },
      "support_version_corrected"
    ],
    [
      { version_added: "100", partial_implementation: true as const },
      { version_added: "100" },
      "partial_support_removed"
    ],
    [{ version_added: "100" }, { version_added: "101" }, "support_version_corrected"]
  ] satisfies [SupportStatement, SupportStatement, string][])(
    "classifies statement changes as %s",
    (previous, current, expectedType) => {
      const before = snapshot({
        one: feature("one", { chrome: [previous] })
      });
      const after = snapshot(
        {
          one: feature("one", { chrome: [current] })
        },
        { bcdVersion: "1.1.0" }
      );
      expect(compareSnapshots(before, after).some((event) => event.type === expectedType)).toBe(
        true
      );
    }
  );
});
