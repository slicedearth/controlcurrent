import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { canonicalJson } from "../src/canonical";
import {
  generatePublicJsonSchema,
  PUBLIC_JSON_SCHEMAS,
  publicJsonSchemaManifest
} from "../src/json-schemas";

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(root, "public", "schemas");
const checkOnly = process.argv.includes("--check");

async function writeOrCheck(path: string, value: unknown): Promise<void> {
  const expected = await format(canonicalJson(value), { parser: "json", printWidth: 100 });
  if (checkOnly) {
    const existing = await readFile(path, "utf8");
    if (existing !== expected) {
      throw new Error(
        `${path.replace(`${root}/`, "")} does not match the current runtime contract. Run npm run schemas:generate and review the changes.`
      );
    }
    return;
  }
  await writeFile(path, expected, { encoding: "utf8", mode: 0o644 });
}

await mkdir(outputRoot, { recursive: true });
for (const definition of PUBLIC_JSON_SCHEMAS) {
  await writeOrCheck(resolve(outputRoot, definition.file), generatePublicJsonSchema(definition));
}
await writeOrCheck(resolve(outputRoot, "index.json"), publicJsonSchemaManifest());

console.log(
  `${checkOnly ? "Verified" : "Generated"} ${String(PUBLIC_JSON_SCHEMAS.length)} public JSON Schemas.`
);
