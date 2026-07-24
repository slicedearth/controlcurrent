import { readFile } from "node:fs/promises";
import { summariseSourceReview } from "../src/source-review";

const MAX_SOURCE_REVIEW_BYTES = 64 * 1_024;
const path = process.argv[2];
if (!path) throw new Error("Provide the npm outdated JSON path.");
const contents = await readFile(path, "utf8");
if (Buffer.byteLength(contents) > MAX_SOURCE_REVIEW_BYTES) {
  throw new Error("Source review input exceeds the 64 KiB limit.");
}
const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
};
process.stdout.write(
  summariseSourceReview(JSON.parse(contents) as unknown, packageJson.dependencies ?? {})
);
