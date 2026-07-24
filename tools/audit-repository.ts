import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  ALLOWED_PUBLIC_DATA_FILES,
  ALLOWED_PUBLIC_SCHEMA_FILES,
  ALLOWED_SYNTHETIC_EXAMPLE_FILES,
  auditCiWorkflow,
  auditPagesWorkflow,
  auditPublicJson,
  auditPublicJsonTotal,
  auditRepositoryPaths,
  auditSourceUpdateWorkflow,
  auditWorkflow
} from "../src/repository-audit";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

const { stdout } = await run(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1_024 * 1_024
  }
);
const files = stdout.split("\0").filter(Boolean);
auditRepositoryPaths(files);

const jsonFiles = files.filter(
  (file) =>
    ALLOWED_PUBLIC_DATA_FILES.has(file) ||
    ALLOWED_PUBLIC_SCHEMA_FILES.has(file) ||
    ALLOWED_SYNTHETIC_EXAMPLE_FILES.has(file)
);
let totalBytes = 0;
for (const file of jsonFiles) {
  const path = resolve(root, file);
  const metadata = await stat(path);
  totalBytes += metadata.size;
  const contents = await readFile(path, "utf8");
  auditPublicJson(file, contents, metadata.size);
}
auditPublicJsonTotal(totalBytes);

const workflowFiles = files.filter(
  (file) => file.startsWith(".github/workflows/") && /\.ya?ml$/u.test(file)
);
for (const file of workflowFiles) {
  const path = resolve(root, file);
  const metadata = await stat(path);
  const contents = await readFile(path, "utf8");
  auditWorkflow(file, contents, metadata.size);
  if (file === ".github/workflows/ci.yml") auditCiWorkflow(contents);
  if (file === ".github/workflows/pages.yml") auditPagesWorkflow(contents);
  if (file === ".github/workflows/update-dry-run.yml") auditSourceUpdateWorkflow(contents);
}

console.log(
  `Audited ${String(files.length)} tracked or unignored paths, ${String(jsonFiles.length)} bounded public JSON files (${String(totalBytes)} bytes), and ${String(workflowFiles.length)} workflow files; no local exports, prohibited content, mutable action references, or privileged build permissions found.`
);
