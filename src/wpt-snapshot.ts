import { z } from "zod";
import { canonicalJson } from "./canonical";

export const WPT_SNAPSHOT_SUITES = [
  { path: "permissions-policy", name: "Permissions Policy" },
  { path: "clear-site-data", name: "Clear-Site-Data" },
  { path: "content-security-policy/script-src", name: "CSP script sources" },
  { path: "html/cross-origin-opener-policy", name: "Cross-origin opener policy" },
  { path: "html/cross-origin-embedder-policy", name: "Cross-origin embedder policy" }
] as const;
export const MAX_WPT_RESPONSE_BYTES = 1_024 * 1_024;
export const MAX_WPT_SNAPSHOT_BYTES = 1_024 * 1_024;
const runId = z.string().regex(/^[1-9][0-9]{0,15}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const statusSchema = z.enum(["O", "P", "F", "S", "E", "N", "C", "T", "PF", ""]);
export const WPT_STATUS_LABELS = {
  O: "OK",
  P: "Pass",
  F: "Fail",
  S: "Skipped",
  E: "Error",
  N: "Not run",
  C: "Crash",
  T: "Timeout",
  PF: "Precondition failed",
  "": "No result"
} as const;
const runSchema = z
  .object({
    id: runId,
    browser: z.enum(["chrome", "firefox", "safari", "edge"]),
    browserVersion: z.string().min(1).max(128),
    os: z.string().min(1).max(64),
    osVersion: z.string().min(1).max(64),
    revision: z.string().regex(/^[a-f0-9]{40}$/u),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    channel: z.literal("stable")
  })
  .strict()
  .refine(
    (run) => Date.parse(run.startedAt) <= Date.parse(run.completedAt),
    "Run times are reversed."
  );
const resultSchema = z
  .object({
    runId,
    status: statusSchema,
    passes: z.number().int().min(0).max(100_000),
    total: z.number().int().min(0).max(100_000)
  })
  .strict()
  .refine((result) => result.passes <= result.total, "Subtest passes exceed the reported total.");
const testSchema = z
  .object({
    path: z
      .string()
      .min(2)
      .max(512)
      .regex(/^\/[\w./?=&%+:-]+$/u),
    results: z.array(resultSchema).min(1).max(6)
  })
  .strict();
const suiteSchema = z
  .object({
    path: z.string().min(1).max(128),
    responseSha256: digest,
    returnedTests: z.number().int().min(0).max(4_096),
    tests: z.array(testSchema).max(2_048)
  })
  .strict();
export const wptSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewedOn: z.iso.date(),
    runs: z.array(runSchema).min(1).max(6),
    suites: z.array(suiteSchema).length(WPT_SNAPSHOT_SUITES.length)
  })
  .strict()
  .superRefine((snapshot, context) => {
    const issue = (message: string) => context.addIssue({ code: "custom", message });
    const ids = new Set(snapshot.runs.map((run) => run.id));
    if (
      ids.size !== snapshot.runs.length ||
      new Set(snapshot.runs.map((run) => run.browser)).size !== snapshot.runs.length
    )
      issue("Runs and browser families must be unique.");
    if (new Set(snapshot.runs.map((run) => run.revision)).size !== 1)
      issue("Retained runs must share one exact test-source revision.");
    if (snapshot.runs.some((run) => run.completedAt.slice(0, 10) > snapshot.reviewedOn))
      issue("A run completes after the review date.");
    if (new Set(snapshot.suites.map((suite) => suite.path)).size !== snapshot.suites.length)
      issue("Suite paths must be unique.");
    for (const suite of snapshot.suites) {
      if (!WPT_SNAPSHOT_SUITES.some((known) => known.path === suite.path))
        issue("Unknown snapshot suite.");
      if (suite.returnedTests < suite.tests.length)
        issue("Retained tests exceed the API response count.");
      if (new Set(suite.tests.map((test) => test.path)).size !== suite.tests.length)
        issue("Test paths must be unique within a suite.");
      for (const test of suite.tests) {
        if (!test.path.startsWith(`/${suite.path}/`) || test.path.includes("/../"))
          issue("A test falls outside its declared suite.");
        if (
          test.results.length !== ids.size ||
          new Set(test.results.map((result) => result.runId)).size !== ids.size ||
          test.results.some((result) => !ids.has(result.runId))
        )
          issue("Every test must have exactly one result for each retained run.");
      }
    }
  });
export type WptSnapshot = z.infer<typeof wptSnapshotSchema>;
export type WptSnapshotSuite = WptSnapshot["suites"][number];

const apiRunSchema = z.looseObject({
  id: z.number().int().positive(),
  browser_name: runSchema.shape.browser,
  browser_version: runSchema.shape.browserVersion,
  os_name: runSchema.shape.os,
  os_version: runSchema.shape.osVersion,
  full_revision_hash: runSchema.shape.revision,
  time_start: z.iso.datetime(),
  time_end: z.iso.datetime(),
  labels: z.array(z.string().max(128)).max(32)
});
const apiResultSchema = z.looseObject({
  passes: z.number().int().min(0).max(100_000),
  total: z.number().int().min(0).max(100_000),
  status: statusSchema,
  newAggProcess: z.literal(true)
});
const apiSchema = z.looseObject({
  runs: z.array(apiRunSchema).min(1).max(6),
  results: z
    .array(
      z.looseObject({
        test: testSchema.shape.path,
        legacy_status: z.array(apiResultSchema).min(1).max(6)
      })
    )
    .max(4_096)
});

/** Import already-downloaded API responses. No network request or test execution occurs here. */
export function buildWptSnapshot(
  inputs: { path: string; contents: string; sha256: string }[],
  reviewedOn: string
): WptSnapshot {
  if (inputs.length !== WPT_SNAPSHOT_SUITES.length)
    throw new Error("Supply one response for each retained suite.");
  let runs: WptSnapshot["runs"] | undefined;
  const suites = inputs.map((input) => {
    if (new TextEncoder().encode(input.contents).byteLength > MAX_WPT_RESPONSE_BYTES)
      throw new Error("WPT response exceeds the byte limit.");
    const response = apiSchema.parse(JSON.parse(input.contents) as unknown);
    const projectedRuns = response.runs.map((run) => {
      if (!run.labels.includes("stable"))
        throw new Error("Only explicitly labelled stable runs can enter this snapshot.");
      return runSchema.parse({
        id: String(run.id),
        browser: run.browser_name,
        browserVersion: run.browser_version,
        os: run.os_name,
        osVersion: run.os_version,
        revision: run.full_revision_hash,
        startedAt: run.time_start,
        completedAt: run.time_end,
        channel: "stable"
      });
    });
    const sortedRuns = [...projectedRuns].sort((a, b) => a.id.localeCompare(b.id));
    if (runs && canonicalJson(runs) !== canonicalJson(sortedRuns))
      throw new Error("Suite responses refer to different run metadata.");
    runs = sortedRuns;
    return {
      path: input.path,
      responseSha256: input.sha256,
      returnedTests: response.results.length,
      tests: response.results
        .filter((test) => test.test.startsWith(`/${input.path}/`))
        .map((test) => {
          if (test.legacy_status.length !== projectedRuns.length)
            throw new Error("A result array does not match the returned run order.");
          return {
            path: test.test,
            results: test.legacy_status
              .map((result, index) => ({
                runId: projectedRuns[index]?.id ?? "",
                status: result.status,
                passes: result.passes,
                total: result.total
              }))
              .sort((a, b) => a.runId.localeCompare(b.runId))
          };
        })
        .sort((a, b) => a.path.localeCompare(b.path))
    };
  });
  const snapshot = wptSnapshotSchema.parse({ schemaVersion: 1, reviewedOn, runs, suites });
  if (new TextEncoder().encode(canonicalJson(snapshot)).byteLength > MAX_WPT_SNAPSHOT_BYTES)
    throw new Error("WPT snapshot exceeds the byte limit.");
  return snapshot;
}

export function summariseWptSuite(suite: WptSnapshotSuite, id: string) {
  const results = suite.tests.flatMap((test) =>
    test.results.filter((result) => result.runId === id)
  );
  const statuses = Object.entries(WPT_STATUS_LABELS).flatMap(([code, label]) => {
    const count = results.filter((result) => result.status === code).length;
    return count ? [{ label, count }] : [];
  });
  return {
    files: results.length,
    passes: results.reduce((sum, result) => sum + result.passes, 0),
    total: results.reduce((sum, result) => sum + result.total, 0),
    statuses
  };
}

export function wptSnapshotQuery(suite: WptSnapshotSuite, runs: WptSnapshot["runs"]): string {
  const url = new URL("https://wpt.fyi/api/search");
  url.searchParams.set("run_ids", runs.map((run) => run.id).join(","));
  url.searchParams.set("q", `/${suite.path}/`);
  return url.href;
}
