import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildWptSnapshot, MAX_WPT_RESPONSE_BYTES, WPT_SNAPSHOT_SUITES } from "../src/wpt-snapshot";
import { canonicalJson } from "../src/canonical";

const [directory, reviewedOn, ...extra] = process.argv.slice(2);
if (!directory || !reviewedOn || extra.length)
  throw new Error(
    "Usage: npm run wpt:import -- <directory containing wpt-search-0.json through wpt-search-4.json> <YYYY-MM-DD>"
  );
const inputs = [];
for (const [index, suite] of WPT_SNAPSHOT_SUITES.entries()) {
  const path = resolve(directory, `wpt-search-${String(index)}.json`);
  if ((await stat(path)).size > MAX_WPT_RESPONSE_BYTES)
    throw new Error("WPT response exceeds the byte limit.");
  const contents = await readFile(path, "utf8");
  inputs.push({
    path: suite.path,
    contents,
    sha256: createHash("sha256").update(contents).digest("hex")
  });
}
const snapshot = buildWptSnapshot(inputs, reviewedOn);
await writeFile(resolve(import.meta.dirname, "../data/wpt-snapshot.json"), canonicalJson(snapshot));
console.log(
  `Retained ${String(snapshot.runs.length)} aligned stable runs and ${String(snapshot.suites.reduce((count, suite) => count + suite.tests.length, 0))} test-file results across ${String(snapshot.suites.length)} suites. No tests were executed.`
);
