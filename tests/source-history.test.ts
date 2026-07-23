import { describe, expect, it } from "vitest";
import {
  appendSourceHistory,
  entryMatchesSnapshot,
  sourceHistoryEntry
} from "../src/source-history";
import { snapshot } from "./helpers";

describe("source history", () => {
  it("creates deterministic bounded entries from selected snapshots", () => {
    const selected = snapshot({});
    const first = sourceHistoryEntry(selected, 3);

    expect(first).toEqual(sourceHistoryEntry(selected, 3));
    expect(first.browserCount).toBe(9);
    expect(first.controlCount).toBe(0);
    expect(first.pathCount).toBe(0);
    expect(first.associatedEventCount).toBe(3);
    expect(entryMatchesSnapshot(first, selected)).toBe(true);
  });

  it("does not append the same source state twice", () => {
    const selected = snapshot({});
    const first = sourceHistoryEntry(selected, 1);
    const history = appendSourceHistory(undefined, first);
    const repeated = appendSourceHistory(history, sourceHistoryEntry(selected, 0));

    expect(repeated.entries).toHaveLength(1);
  });

  it("appends a changed source state without rewriting earlier entries", () => {
    const before = snapshot({});
    const after = snapshot({}, { bcdVersion: "1.1.0", catalogueVersion: "2.0.0" });
    const first = sourceHistoryEntry(before, 1);
    const second = sourceHistoryEntry(after, 2);
    const history = appendSourceHistory(appendSourceHistory(undefined, first), second);

    expect(history.entries).toEqual([first, second]);
    expect(entryMatchesSnapshot(first, after)).toBe(false);
  });

  it("refuses a history entry whose content-derived identifier was altered", () => {
    const selected = snapshot({});
    const entry = sourceHistoryEntry(selected, 1);

    expect(() =>
      appendSourceHistory(undefined, {
        ...entry,
        id: "000000000000000000000000"
      })
    ).toThrow(/invalid content-derived identifier/u);
  });
});
