import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical";
import {
  type SelectedSnapshot,
  type SourceHistory,
  type SourceHistoryEntry,
  selectedSnapshotSchema,
  sourceHistoryEntrySchema,
  sourceHistorySchema
} from "./contracts";

type SourceHistoryPayload = Omit<SourceHistoryEntry, "id">;

function entryId(payload: SourceHistoryPayload): string {
  return createHash("sha256").update(canonicalJson(payload, 0)).digest("hex").slice(0, 24);
}

function payloadFromEntry(entry: SourceHistoryEntry): SourceHistoryPayload {
  return {
    bcdVersion: entry.bcdVersion,
    bcdTimestamp: entry.bcdTimestamp,
    webFeaturesVersion: entry.webFeaturesVersion,
    catalogueVersion: entry.catalogueVersion,
    schemaFingerprint: entry.schemaFingerprint,
    browserCount: entry.browserCount,
    controlCount: entry.controlCount,
    pathCount: entry.pathCount,
    baselineAssociationCount: entry.baselineAssociationCount,
    associatedEventCount: entry.associatedEventCount
  };
}

function assertEntryId(entry: SourceHistoryEntry): void {
  if (entry.id !== entryId(payloadFromEntry(entry))) {
    throw new Error(`Source history entry ${entry.id} has an invalid content-derived identifier.`);
  }
}

function entryPayload(
  snapshot: SelectedSnapshot,
  associatedEventCount: number
): SourceHistoryPayload {
  return {
    bcdVersion: snapshot.bcdVersion,
    bcdTimestamp: snapshot.bcdTimestamp,
    webFeaturesVersion: snapshot.webFeaturesVersion,
    catalogueVersion: snapshot.catalogueVersion,
    schemaFingerprint: snapshot.schemaFingerprint,
    browserCount: Object.keys(snapshot.browsers).length,
    controlCount: snapshot.controlMappings.length,
    pathCount: Object.keys(snapshot.features).length,
    baselineAssociationCount: Object.values(snapshot.features).reduce(
      (total, feature) => total + feature.baseline.length,
      0
    ),
    associatedEventCount
  };
}

export function sourceHistoryEntry(
  snapshotInput: unknown,
  associatedEventCount: number
): SourceHistoryEntry {
  const snapshot = selectedSnapshotSchema.parse(snapshotInput);
  const payload = entryPayload(snapshot, associatedEventCount);
  return sourceHistoryEntrySchema.parse({ id: entryId(payload), ...payload });
}

export function entryMatchesSnapshot(entryInput: unknown, snapshotInput: unknown): boolean {
  const entry = sourceHistoryEntrySchema.parse(entryInput);
  assertEntryId(entry);
  const snapshot = selectedSnapshotSchema.parse(snapshotInput);
  const expected = entryPayload(snapshot, entry.associatedEventCount);
  return (
    entry.bcdVersion === expected.bcdVersion &&
    entry.bcdTimestamp === expected.bcdTimestamp &&
    entry.webFeaturesVersion === expected.webFeaturesVersion &&
    entry.catalogueVersion === expected.catalogueVersion &&
    entry.schemaFingerprint === expected.schemaFingerprint &&
    entry.browserCount === expected.browserCount &&
    entry.controlCount === expected.controlCount &&
    entry.pathCount === expected.pathCount &&
    entry.baselineAssociationCount === expected.baselineAssociationCount
  );
}

export function appendSourceHistory(historyInput: unknown, entryInput: unknown): SourceHistory {
  const history =
    historyInput === undefined
      ? sourceHistorySchema.parse({ schemaVersion: 1, entries: [] })
      : sourceHistorySchema.parse(historyInput);
  const entry = sourceHistoryEntrySchema.parse(entryInput);
  for (const candidate of history.entries) assertEntryId(candidate);
  assertEntryId(entry);
  const current = history.entries.at(-1);

  if (current && sameSourceState(current, entry)) return history;
  if (history.entries.some((candidate) => candidate.id === entry.id)) return history;
  return sourceHistorySchema.parse({
    schemaVersion: 1,
    entries: [...history.entries, entry]
  });
}

function sameSourceState(left: SourceHistoryEntry, right: SourceHistoryEntry): boolean {
  return (
    left.bcdVersion === right.bcdVersion &&
    left.bcdTimestamp === right.bcdTimestamp &&
    left.webFeaturesVersion === right.webFeaturesVersion &&
    left.catalogueVersion === right.catalogueVersion &&
    left.schemaFingerprint === right.schemaFingerprint &&
    left.browserCount === right.browserCount &&
    left.controlCount === right.controlCount &&
    left.pathCount === right.pathCount &&
    left.baselineAssociationCount === right.baselineAssociationCount
  );
}
