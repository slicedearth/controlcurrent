import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CompatData } from "@mdn/browser-compat-data";
import { z } from "zod";
import { canonicalJson } from "../src/canonical";
import { baselineEvent, compareSnapshots } from "../src/changes";
import { changeEventSchema, selectedSnapshotSchema } from "../src/contracts";
import { buildSelectedSnapshot } from "../src/source";

const require = createRequire(import.meta.url);
const bcd = require("@mdn/browser-compat-data") as CompatData;
const root = resolve(import.meta.dirname, "..");
const snapshotPath = resolve(root, "data", "selected-bcd.json");
const eventsPath = resolve(root, "data", "change-events.json");
const checkOnly = process.argv.includes("--check");
const eventListSchema = z.array(changeEventSchema).max(10_000);

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const generated = buildSelectedSnapshot(bcd);
const generatedText = canonicalJson(generated);
const existingInput = await readJson(snapshotPath);
const existingEventsInput = await readJson(eventsPath);

if (checkOnly) {
  const existing = selectedSnapshotSchema.parse(existingInput);
  eventListSchema.parse(existingEventsInput);
  if (canonicalJson(existing) !== generatedText) {
    throw new Error(
      "The committed selected BCD subset does not match the locked package. Run npm run generate and review the change events."
    );
  }
  console.log(
    `Verified selected BCD ${generated.bcdVersion}: ${String(Object.keys(generated.features).length)} paths, ${String(generated.controlMappings.length)} controls.`
  );
} else {
  const existing = existingInput ? selectedSnapshotSchema.parse(existingInput) : undefined;
  const existingEvents = existingEventsInput ? eventListSchema.parse(existingEventsInput) : [];
  const newEvents = existing
    ? existing.bcdVersion === generated.bcdVersion && canonicalJson(existing) === generatedText
      ? []
      : compareSnapshots(existing, generated)
    : [baselineEvent(generated)];
  const combinedEvents = eventListSchema.parse(
    [...existingEvents, ...newEvents]
      .filter(
        (event, index, values) =>
          values.findIndex((candidate) => candidate.id === event.id) === index
      )
      .sort(
        (left, right) =>
          left.sourceTimestamp.localeCompare(right.sourceTimestamp) ||
          left.id.localeCompare(right.id)
      )
  );

  await mkdir(resolve(root, "data"), { recursive: true });
  await writeFile(snapshotPath, generatedText, { encoding: "utf8", mode: 0o644 });
  await writeFile(eventsPath, canonicalJson(combinedEvents), {
    encoding: "utf8",
    mode: 0o644
  });
  console.log(
    `Generated selected BCD ${generated.bcdVersion}: ${String(Object.keys(generated.features).length)} paths, ${String(newEvents.length)} new events.`
  );
}
