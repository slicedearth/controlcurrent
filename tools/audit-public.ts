import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicRoot = resolve(root, "dist");
const MAX_FILE_BYTES = 2 * 1_024 * 1_024;
const MAX_TOTAL_BYTES = 25 * 1_024 * 1_024;
const textExtensions = new Set([".css", ".csv", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);
const linkBearingExtensions = new Set([".csv", ".html", ".json", ".txt"]);
const prohibitedPatterns = [
  /(?:api|access|auth|secret)[_-]?key\s*[:=]\s*["'][^"']{8,}/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_]{20,}\b/u,
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/iu
];

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const files = await listFiles(publicRoot);
let total = 0;
for (const file of files) {
  const metadata = await stat(file);
  total += metadata.size;
  if (metadata.size > MAX_FILE_BYTES) {
    throw new Error(`${relative(root, file)} exceeds ${String(MAX_FILE_BYTES)} bytes.`);
  }
  if (textExtensions.has(extname(file))) {
    const contents = await readFile(file, "utf8");
    for (const pattern of prohibitedPatterns) {
      if (pattern.test(contents)) {
        throw new Error(`${relative(root, file)} matches prohibited public content.`);
      }
    }
    if (linkBearingExtensions.has(extname(file)) && contents.includes("http://")) {
      throw new Error(`${relative(root, file)} contains an insecure HTTP URL.`);
    }
  }
}
if (total > MAX_TOTAL_BYTES) {
  throw new Error(`Public build exceeds ${String(MAX_TOTAL_BYTES)} bytes.`);
}
console.log(
  `Audited ${String(files.length)} public files (${String(total)} bytes); no prohibited content found.`
);
