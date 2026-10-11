import { describe, expect, it } from "vitest";
import stored from "../data/wpt-snapshot.json";
import { getWptEvidence } from "../src/wpt-evidence";
import { selectWptSnapshot, summariseWptSuite, wptSnapshotSchema } from "../src/wpt-snapshot";

const snapshot = wptSnapshotSchema.parse(stored);

describe("directive-specific retained test results", () => {
  it.each([
    [
      "permissions-policy-camera",
      4,
      [
        [0, 4],
        [0, 4],
        [4, 4]
      ]
    ],
    [
      "permissions-policy-microphone",
      2,
      [
        [0, 2],
        [0, 2],
        [2, 2]
      ]
    ],
    [
      "permissions-policy-geolocation",
      2,
      [
        [0, 2],
        [0, 1],
        [1, 2]
      ]
    ],
    [
      "clear-site-data-cache",
      4,
      [
        [29, 29],
        [12, 29],
        [21, 29]
      ]
    ],
    [
      "clear-site-data-cookies",
      2,
      [
        [2, 2],
        [2, 2],
        [2, 2]
      ]
    ],
    [
      "clear-site-data-storage",
      1,
      [
        [6, 8],
        [8, 8],
        [10, 10]
      ]
    ]
  ] as const)("selects exact files and complete file totals for %s", (id, count, totals) => {
    const mapping = getWptEvidence(id);
    const selection = selectWptSnapshot(snapshot, mapping);
    expect(selection.state).toBe("available");
    expect(selection.suites).toHaveLength(1);
    const selected = selection.suites[0];
    if (!selected) throw new Error("Missing selection");
    expect(selected.suite.tests).toHaveLength(count);
    expect(selected.selectedFiles).toHaveLength(count);
    expect(selected.missingFiles).toEqual([]);
    expect(selected.retainedFiles).toBe(id.startsWith("permissions-policy") ? 118 : 15);
    expect(snapshot.runs.map((run) => run.browser)).toEqual(["firefox", "safari", "chrome"]);
    expect(
      snapshot.runs.map((run) => {
        const summary = summariseWptSuite(selected.suite, run.id);
        expect(summary.files).toBe(count);
        expect(summary.statuses.reduce((sum, status) => sum + status.count, 0)).toBe(count);
        return [summary.passes, summary.total];
      })
    ).toEqual(totals);
  });

  it("excludes similar filenames and unreviewed query variants without mutating the source", () => {
    const input = structuredClone(snapshot);
    const suite = input.suites.find((entry) => entry.path === "clear-site-data");
    const file = suite?.tests.find((test) => test.path === "/clear-site-data/storage.https.html");
    if (!suite || !file) throw new Error("Missing source fixture");
    suite.tests.push(
      { ...file, path: "/clear-site-data/storage.https.html?unreviewed" },
      { ...file, path: "/clear-site-data/storage.https.html-similar" }
    );
    suite.returnedTests += 2;
    const valid = wptSnapshotSchema.parse(input);
    const before = JSON.stringify(valid);
    const selected = selectWptSnapshot(valid, getWptEvidence("clear-site-data-storage"));
    expect(selected.suites[0]?.suite.tests).toEqual([file]);
    expect(selected.suites[0]?.retainedFiles).toBe(17);
    expect(JSON.stringify(valid)).toBe(before);
  });

  it("reports absent selected files without substituting parent results or zero passes", () => {
    const input = structuredClone(snapshot);
    const suite = input.suites.find((entry) => entry.path === "clear-site-data");
    if (!suite) throw new Error("Missing source fixture");
    suite.tests = suite.tests.filter((test) => test.path !== "/clear-site-data/storage.https.html");
    const selected = selectWptSnapshot(
      wptSnapshotSchema.parse(input),
      getWptEvidence("clear-site-data-storage")
    );
    expect(selected.suites[0]?.suite.tests).toEqual([]);
    expect(selected.suites[0]?.selectedFiles).toEqual(["clear-site-data/storage.https.html"]);
    expect(selected.suites[0]?.missingFiles).toEqual(["clear-site-data/storage.https.html"]);
    expect(selected.suites[0]?.retainedFiles).toBe(14);
  });

  it("keeps a missing browser outcome distinct from missing files and passing subtests", () => {
    const input = structuredClone(snapshot);
    const result = input.suites
      .find((suite) => suite.path === "clear-site-data")
      ?.tests.find((test) => test.path === "/clear-site-data/storage.https.html")?.results[0];
    if (!result) throw new Error("Missing source fixture");
    Object.assign(result, { status: "", passes: 0, total: 0 });
    const selected = selectWptSnapshot(
      wptSnapshotSchema.parse(input),
      getWptEvidence("clear-site-data-storage")
    );
    const suite = selected.suites[0];
    if (!suite) throw new Error("Missing selection");
    expect(suite.missingFiles).toEqual([]);
    expect(summariseWptSuite(suite.suite, result.runId)).toEqual({
      files: 1,
      passes: 0,
      total: 0,
      statuses: [{ label: "No result", count: 1 }]
    });
  });

  it("refuses exact file selections from a different source revision", () => {
    const input = structuredClone(snapshot);
    for (const run of input.runs) run.revision = "a".repeat(40);
    expect(
      selectWptSnapshot(wptSnapshotSchema.parse(input), getWptEvidence("clear-site-data-cache"))
    ).toEqual({
      state: "revision_mismatch",
      suites: []
    });
  });

  it("preserves full-suite totals, absent suites and unmapped controls", () => {
    expect(selectWptSnapshot(snapshot).suites.map((entry) => entry.suite)).toEqual(snapshot.suites);
    const parent = selectWptSnapshot(snapshot, getWptEvidence("permissions-policy"));
    expect(parent.suites[0]?.suite).toEqual(snapshot.suites[0]);
    expect(parent.suites[0]?.selectedFiles).toBeUndefined();
    expect(selectWptSnapshot(snapshot, getWptEvidence("trusted-types"))).toEqual({
      state: "not_retained",
      suites: []
    });
    expect(selectWptSnapshot(snapshot, getWptEvidence("httponly-cookies"))).toEqual({
      state: "not_retained",
      suites: []
    });
  });
});
