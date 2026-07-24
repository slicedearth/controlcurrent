import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { CompatData } from "@mdn/browser-compat-data";
import { z } from "zod";
import { selectedSnapshot } from "../src/data";
import { buildSelectedSnapshot, type WebFeatures } from "../src/source";
import { createSourceUpdatePreview, renderSourceUpdatePreview } from "../src/source-update-preview";

const packageSchema = z
  .object({
    name: z.enum(["@mdn/browser-compat-data", "web-features"]),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u)
  })
  .loose();
const webFeaturesDataSchema = z
  .object({
    features: z.record(z.string(), z.unknown())
  })
  .loose();

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required option ${name}.`);
  return resolve(value);
}

async function readBoundedJson(path: string, maximumBytes: number): Promise<unknown> {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(`${path} is not a bounded regular source file.`);
  }
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

const bcdPackage = packageSchema.parse(await readBoundedJson(option("--bcd-package"), 128 * 1_024));
const webFeaturesPackage = packageSchema.parse(
  await readBoundedJson(option("--web-features-package"), 128 * 1_024)
);
if (bcdPackage.name !== "@mdn/browser-compat-data") {
  throw new Error("The candidate BCD package identity is incorrect.");
}
if (webFeaturesPackage.name !== "web-features") {
  throw new Error("The candidate Web Platform Features package identity is incorrect.");
}
const candidateBcd = (await readBoundedJson(
  option("--bcd-data"),
  32 * 1_024 * 1_024
)) as CompatData;
const candidateWebFeatures = webFeaturesDataSchema.parse(
  await readBoundedJson(option("--web-features-data"), 8 * 1_024 * 1_024)
);
const candidate = buildSelectedSnapshot(candidateBcd, {
  webFeaturesVersion: webFeaturesPackage.version,
  webFeatures: candidateWebFeatures.features as WebFeatures
});
if (candidate.bcdVersion !== bcdPackage.version) {
  throw new Error("The candidate BCD data and package versions do not match.");
}

process.stdout.write(
  renderSourceUpdatePreview(createSourceUpdatePreview(selectedSnapshot, candidate))
);
