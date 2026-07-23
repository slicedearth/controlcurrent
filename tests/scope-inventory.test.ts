import { describe, expect, it } from "vitest";
import { evidenceBundleInputSchema } from "../src/contracts";
import { reduceScopeInventory } from "../src/scope-inventory";
import { evidenceIdentity } from "./helpers";

const entries = [
  { id: "sign-in", disposition: "included" },
  {
    id: "administration",
    disposition: "excluded",
    exclusionReason: "requires_separate_capture"
  }
] as const;

describe("scope inventory reduction", () => {
  it("fingerprints sorted semantic entries without retaining them", async () => {
    const first = await reduceScopeInventory({
      schemaVersion: 1,
      name: "Framework routes",
      kind: "framework_manifest",
      generatedAt: "2026-07-20T08:55:00.000Z",
      completeness: "partial",
      entries
    });
    const second = await reduceScopeInventory({
      schemaVersion: 1,
      name: "Renamed manifest",
      kind: "framework_manifest",
      generatedAt: "2026-07-21T08:55:00.000Z",
      completeness: "partial",
      entries: [...entries].reverse()
    });
    if (first.state !== "present" || second.state !== "present") {
      throw new Error("Expected present reduced inventories.");
    }

    expect(first).toEqual(
      expect.objectContaining({
        state: "present",
        totalEntries: 2,
        includedEntries: 1,
        excludedEntries: 1
      })
    );
    expect(second).toEqual(expect.objectContaining({ fingerprint: first.fingerprint }));
    expect(JSON.stringify(first)).not.toContain("administration");
    expect(JSON.stringify(first)).not.toContain("requires_separate_capture");
  });

  it("rejects duplicate entries and inconsistent completeness claims", async () => {
    await expect(
      reduceScopeInventory({
        schemaVersion: 1,
        name: "Duplicate routes",
        kind: "declared",
        generatedAt: "2026-07-20T08:55:00.000Z",
        completeness: "unknown",
        entries: [
          { id: "document", disposition: "included" },
          { id: "document", disposition: "included" }
        ]
      })
    ).rejects.toThrow(/unique/u);
    await expect(
      reduceScopeInventory({
        schemaVersion: 1,
        name: "False complete inventory",
        kind: "declared",
        generatedAt: "2026-07-20T08:55:00.000Z",
        completeness: "complete",
        entries
      })
    ).rejects.toThrow(/complete scope inventory/u);
    await expect(
      reduceScopeInventory({
        schemaVersion: 1,
        name: "Excluded-only inventory",
        kind: "declared",
        generatedAt: "2026-07-20T08:55:00.000Z",
        completeness: "partial",
        entries: [
          {
            id: "administration",
            disposition: "excluded",
            exclusionReason: "out_of_scope"
          }
        ]
      })
    ).rejects.toThrow(/at least one included entry/u);
  });

  it("requires included entries to match declared evidence surfaces exactly", () => {
    expect(() =>
      evidenceBundleInputSchema.parse({
        schemaVersion: 4,
        name: "Mismatched bundle",
        identity: evidenceIdentity,
        scopeInventory: {
          schemaVersion: 1,
          name: "Framework routes",
          kind: "framework_manifest",
          generatedAt: "2026-07-20T08:55:00.000Z",
          completeness: "complete",
          entries: [{ id: "other-surface", disposition: "included" }]
        },
        surfaces: [
          {
            id: "document",
            role: "document",
            requiredEvidence: ["response"],
            requiredControls: [],
            requiredComposites: []
          }
        ],
        responses: [
          {
            schemaVersion: 1,
            name: "Document response",
            surfaceId: "document",
            headers: {}
          }
        ]
      })
    ).toThrow(/match the declared evidence surfaces exactly/u);
  });

  it("rejects an inventory generated after evidence capture started", () => {
    expect(() =>
      evidenceBundleInputSchema.parse({
        schemaVersion: 4,
        name: "Future inventory bundle",
        identity: evidenceIdentity,
        scopeInventory: {
          schemaVersion: 1,
          name: "Late route manifest",
          kind: "framework_manifest",
          generatedAt: "2026-07-20T09:01:00.000Z",
          completeness: "complete",
          entries: [{ id: "document", disposition: "included" }]
        },
        surfaces: [
          {
            id: "document",
            role: "document",
            requiredEvidence: ["response"],
            requiredControls: [],
            requiredComposites: []
          }
        ],
        responses: [
          {
            schemaVersion: 1,
            name: "Document response",
            surfaceId: "document",
            headers: {}
          }
        ]
      })
    ).toThrow(/must not follow evidence capture start/u);
  });
});
