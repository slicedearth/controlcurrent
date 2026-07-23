import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CompatData } from "@mdn/browser-compat-data";
import { z } from "zod";
import { BROWSER_IDS } from "../src/browsers";
import { canonicalJson } from "../src/canonical";
import { baselineEvent, compareSnapshots } from "../src/changes";
import { changeEventSchema, selectedSnapshotSchema } from "../src/contracts";
import { buildSelectedSnapshot, schemaFingerprint } from "../src/source";

const require = createRequire(import.meta.url);
const bcd = require("@mdn/browser-compat-data") as CompatData;
const root = resolve(import.meta.dirname, "..");
const snapshotPath = resolve(root, "data", "selected-bcd.json");
const eventsPath = resolve(root, "data", "change-events.json");
const checkOnly = process.argv.includes("--check");
const eventListSchema = z.array(changeEventSchema).max(10_000);
const packageSchema = z.looseObject({
  dependencies: z.looseObject({
    "web-features": z.string().regex(/^\d+\.\d+\.\d+$/u)
  })
});

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const projectPackage = packageSchema.parse(await readJson(resolve(root, "package.json")));
const generated = buildSelectedSnapshot(bcd, {
  webFeaturesVersion: projectPackage.dependencies["web-features"]
});
const generatedText = canonicalJson(generated);
const existingInput = await readJson(snapshotPath);
const existingEventsInput = await readJson(eventsPath);

function migrateLegacySnapshot(input: unknown) {
  if (
    typeof input !== "object" ||
    input === null ||
    (input as { schemaVersion?: unknown }).schemaVersion !== 1
  ) {
    return selectedSnapshotSchema.parse(input);
  }

  const migrated = structuredClone(input) as Record<string, unknown>;
  if (
    typeof migrated.browsers !== "object" ||
    migrated.browsers === null ||
    typeof migrated.features !== "object" ||
    migrated.features === null ||
    !Array.isArray(migrated.controlMappings)
  ) {
    throw new Error("Legacy selected snapshot is missing required collections.");
  }
  const browsers = migrated.browsers as Record<string, unknown>;
  const features = migrated.features as Record<
    string,
    { baseline?: unknown; support?: Record<string, unknown> }
  >;

  for (const browser of BROWSER_IDS) {
    browsers[browser] ??= generated.browsers[browser];
  }
  for (const [path, feature] of Object.entries(features)) {
    const current = generated.features[path];
    feature.baseline = current?.baseline ?? [];
    feature.support ??= {};
    for (const browser of BROWSER_IDS) {
      if (!(browser in feature.support) && current?.support[browser]) {
        feature.support[browser] = current.support[browser];
      }
    }
  }

  migrated.schemaVersion = 2;
  migrated.webFeaturesVersion = generated.webFeaturesVersion;
  migrated.schemaFingerprint = schemaFingerprint({
    browsers,
    controlMappings: migrated.controlMappings,
    features
  });
  return selectedSnapshotSchema.parse(migrated);
}

if (checkOnly) {
  const existing = migrateLegacySnapshot(existingInput);
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
  const existing = existingInput ? migrateLegacySnapshot(existingInput) : undefined;
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
