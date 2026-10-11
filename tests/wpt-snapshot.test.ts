import { describe, expect, it } from "vitest";
import stored from "../data/wpt-snapshot.json";
import {
  buildWptSnapshot,
  MAX_WPT_RESPONSE_BYTES,
  summariseWptSuite,
  WPT_SNAPSHOT_SUITES,
  wptSnapshotQuery,
  wptSnapshotSchema
} from "../src/wpt-snapshot";

const run = {
  id: 100,
  browser_name: "chrome",
  browser_version: "100.0",
  os_name: "linux",
  os_version: "1",
  full_revision_hash: "a".repeat(40),
  time_start: "2026-10-01T00:00:00.000Z",
  time_end: "2026-10-01T01:00:00.000Z",
  labels: ["stable", "master"]
};
const secondRun = { ...run, id: 200, browser_name: "firefox" };
const ok = { passes: 2, total: 3, status: "O", newAggProcess: true };
const error = { passes: 0, total: 0, status: "E", newAggProcess: true };
const missing = { passes: 0, total: 0, status: "", newAggProcess: false };
function inputs() {
  return WPT_SNAPSHOT_SUITES.map((suite) => ({
    path: suite.path,
    sha256: "b".repeat(64),
    contents: JSON.stringify({
      runs: [run, secondRun],
      results: [
        { test: `/${suite.path}/test.html`, legacy_status: [ok, error] },
        { test: `/unrelated/${suite.path}/test.html`, legacy_status: [ok, ok] }
      ]
    })
  }));
}
function mutateInput(
  change: (value: {
    runs: (typeof run)[];
    results: { test: string; legacy_status: (typeof ok)[] }[];
  }) => void
) {
  const values = inputs();
  const first = values[0];
  if (!first) throw new Error("Missing fixture");
  const value = JSON.parse(first.contents) as Parameters<typeof change>[0];
  change(value);
  first.contents = JSON.stringify(value);
  return values;
}

describe("retained public browser-test snapshots", () => {
  it("validates the complete committed snapshot and exact run/source context", () => {
    const snapshot = wptSnapshotSchema.parse(stored);
    expect(snapshot.runs).toHaveLength(3);
    expect(new Set(snapshot.runs.map((entry) => entry.revision)).size).toBe(1);
    expect(snapshot.suites.reduce((count, suite) => count + suite.tests.length, 0)).toBe(488);
    for (const suite of snapshot.suites)
      for (const entry of snapshot.runs) {
        const summary = summariseWptSuite(suite, entry.id);
        expect(summary.files).toBe(suite.tests.length);
        expect(summary.passes).toBeLessThanOrEqual(summary.total);
        expect(summary.statuses.reduce((count, status) => count + status.count, 0)).toBe(
          summary.files
        );
      }
  });
  it("filters substring matches to exact suite prefixes and never folds harness OK into passes", () => {
    const snapshot = buildWptSnapshot(inputs(), "2026-10-11");
    const suite = snapshot.suites[0];
    if (!suite) throw new Error("Missing fixture suite");
    expect(suite.returnedTests).toBe(2);
    expect(suite.tests).toHaveLength(1);
    expect(summariseWptSuite(suite, "100")).toEqual({
      files: 1,
      passes: 2,
      total: 3,
      statuses: [{ label: "OK", count: 1 }]
    });
    expect(summariseWptSuite(suite, "200")).toEqual({
      files: 1,
      passes: 0,
      total: 0,
      statuses: [{ label: "Error", count: 1 }]
    });
    expect(summariseWptSuite(suite, "missing").files).toBe(0);
    const query = new URL(wptSnapshotQuery(suite, snapshot.runs));
    expect(query.origin).toBe("https://wpt.fyi");
    expect(query.searchParams.get("run_ids")).toBe("100,200");
    expect(query.searchParams.get("q")).toBe(`/${suite.path}/`);
  });
  it("binds every status to the returned run order even when another response reverses it", () => {
    const snapshot = buildWptSnapshot(
      mutateInput((value) => {
        value.runs.reverse();
        for (const test of value.results) test.legacy_status.reverse();
      }),
      "2026-10-11"
    );
    expect(snapshot.suites[0]?.tests[0]?.results).toEqual([
      { runId: "100", status: "O", passes: 2, total: 3 },
      { runId: "200", status: "E", passes: 0, total: 0 }
    ]);
  });
  it("retains an absent run as No result without changing another browser's counts", () => {
    const snapshot = buildWptSnapshot(
      mutateInput((value) => {
        const result = value.results[0];
        if (result) result.legacy_status[1] = missing;
        value.runs.reverse();
        for (const test of value.results) test.legacy_status.reverse();
      }),
      "2026-10-11"
    );
    const suite = snapshot.suites[0];
    if (!suite) throw new Error("Missing fixture suite");
    expect(suite.tests[0]?.results).toEqual([
      { runId: "100", status: "O", passes: 2, total: 3 },
      { runId: "200", status: "", passes: 0, total: 0 }
    ]);
    expect(summariseWptSuite(suite, "100")).toEqual({
      files: 1,
      passes: 2,
      total: 3,
      statuses: [{ label: "OK", count: 1 }]
    });
    expect(summariseWptSuite(suite, "200")).toEqual({
      files: 1,
      passes: 0,
      total: 0,
      statuses: [{ label: "No result", count: 1 }]
    });
  });
  it("discards an out-of-prefix match containing a missing-run slot", () => {
    const snapshot = buildWptSnapshot(
      mutateInput((value) => {
        const result = value.results[1];
        if (result) result.legacy_status[0] = missing;
      }),
      "2026-10-11"
    );
    expect(snapshot).toEqual(buildWptSnapshot(inputs(), "2026-10-11"));
  });
  it.each([
    ...["O", "P", "F", "S", "E", "N", "C", "T", "PF"].map((status) => ({
      ...missing,
      status
    })),
    { ...missing, total: 1 },
    { ...missing, passes: 1, total: 1 },
    { ...missing, passes: 1 },
    { passes: 0, total: 0, status: "" }
  ])("rejects legacy counts and incomplete missing-run slots: %j", (invalid) => {
    expect(() =>
      buildWptSnapshot(
        mutateInput((value) => {
          const result = value.results[0];
          if (result) result.legacy_status[1] = invalid as typeof ok;
        }),
        "2026-10-11"
      )
    ).toThrow();
  });
  it("refuses old count semantics, misaligned metadata, partial arrays and non-stable runs", () => {
    expect(() => buildWptSnapshot(inputs().slice(1), "2026-10-11")).toThrow(/each retained suite/u);
    expect(() =>
      buildWptSnapshot(
        mutateInput((value) => {
          const result = value.results[0]?.legacy_status[0];
          if (result) result.newAggProcess = false;
        }),
        "2026-10-11"
      )
    ).toThrow();
    expect(() =>
      buildWptSnapshot(
        mutateInput((value) => {
          const first = value.runs[0];
          if (first) first.labels = ["experimental"];
        }),
        "2026-10-11"
      )
    ).toThrow(/stable/u);
    expect(() =>
      buildWptSnapshot(
        mutateInput((value) => {
          const first = value.runs[0];
          if (first) first.browser_version = "different";
        }),
        "2026-10-11"
      )
    ).toThrow(/different run metadata/u);
    expect(() =>
      buildWptSnapshot(
        mutateInput((value) => {
          value.results[0]?.legacy_status.pop();
        }),
        "2026-10-11"
      )
    ).toThrow(/run order/u);
    const oversized = inputs();
    const first = oversized[0];
    if (first) first.contents = "x".repeat(MAX_WPT_RESPONSE_BYTES + 1);
    expect(() => buildWptSnapshot(oversized, "2026-10-11")).toThrow(/byte limit/u);
  });
  it("rejects contradictory counts, duplicate or foreign references, and future review claims", () => {
    const original = buildWptSnapshot(inputs(), "2026-10-11");
    const check = (change: (snapshot: typeof original) => void) => {
      const value = structuredClone(original);
      change(value);
      expect(() => wptSnapshotSchema.parse(value)).toThrow();
    };
    check((value) => {
      value.reviewedOn = "2026-09-30";
    });
    check((value) => {
      const entry = value.runs[1];
      if (entry) entry.revision = "c".repeat(40);
    });
    check((value) => {
      const entry = value.runs[0];
      if (entry) value.runs.push(entry);
    });
    check((value) => {
      const suite = value.suites[0];
      if (suite) suite.path = "unknown";
    });
    check((value) => {
      const suite = value.suites[0];
      if (suite) suite.returnedTests = 0;
    });
    check((value) => {
      const suite = value.suites[0];
      const test = suite?.tests[0];
      if (test) suite.tests.push(test);
    });
    check((value) => {
      const test = value.suites[0]?.tests[0];
      if (test) test.path = "/outside/test.html";
    });
    check((value) => {
      const test = value.suites[0]?.tests[0];
      if (test) test.path = "/permissions-policy/../test.html";
    });
    check((value) => {
      const result = value.suites[0]?.tests[0]?.results[0];
      if (result) result.runId = "300";
    });
    check((value) => {
      const result = value.suites[0]?.tests[0]?.results[0];
      if (result) result.passes = 4;
    });
    check((value) => {
      const suite = value.suites[0];
      if (suite) value.suites[1] = suite;
    });
    check((value) => {
      const entry = value.runs[0];
      if (entry) entry.completedAt = "2026-09-01T00:00:00.000Z";
    });
  });
});
