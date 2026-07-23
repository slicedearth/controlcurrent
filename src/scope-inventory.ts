import { canonicalJson } from "./canonical";
import {
  type EvidenceScopeInventoryInput,
  type EvidenceScopeInventoryReport,
  evidenceScopeInventoryInputSchema,
  evidenceScopeInventoryReportSchema
} from "./contracts";

function semanticInventory(input: EvidenceScopeInventoryInput): unknown {
  return {
    schemaVersion: input.schemaVersion,
    kind: input.kind,
    completeness: input.completeness,
    entries: [...input.entries].sort((left, right) => left.id.localeCompare(right.id))
  };
}

async function sha256(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input, 0));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function reduceScopeInventory(input: unknown): Promise<EvidenceScopeInventoryReport> {
  const inventory = evidenceScopeInventoryInputSchema.parse(input);
  const includedEntries = inventory.entries.filter(
    (entry) => entry.disposition === "included"
  ).length;
  const excludedEntries = inventory.entries.length - includedEntries;
  return evidenceScopeInventoryReportSchema.parse({
    schemaVersion: 1,
    state: "present",
    name: inventory.name,
    kind: inventory.kind,
    generatedAt: inventory.generatedAt,
    completeness: inventory.completeness,
    fingerprint: await sha256(semanticInventory(inventory)),
    totalEntries: inventory.entries.length,
    includedEntries,
    excludedEntries
  });
}

export function absentScopeInventory(): EvidenceScopeInventoryReport {
  return evidenceScopeInventoryReportSchema.parse({
    schemaVersion: 1,
    state: "absent"
  });
}
