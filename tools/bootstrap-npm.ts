import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
export { activateToolchain, CLI_VERSION } from "./toolchain-activation.ts";
import { activateToolchain, CLI_VERSION } from "./toolchain-activation.ts";
const CLI_URL = `https://registry.npmjs.org/npm/-/npm-${CLI_VERSION}.tgz`;
const CLI_INTEGRITY =
  "sha512-ZsJjKpTnlmSXOLLXiU1xDCzC4Wlok4IwZmh/aw2KUuXytU7q6qMv/cUT7MoeSf95Slwuw/lRXYefGzGCspHPNQ==";
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const CLI_MEMBERS = [
  "package/bin",
  "package/lib",
  "package/index.js",
  "package/package.json",
  "package/LICENSE",
  "package/docs",
  "package/man"
];

type LockedPackage = { path: string; resolved: string; integrity: string };
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid toolchain metadata.");
  }
  return value as JsonObject;
}

export function lockedPackages(value: unknown): LockedPackage[] {
  const lock = object(value);
  if (lock.name !== "npm" || lock.version !== CLI_VERSION || lock.lockfileVersion !== 3) {
    throw new Error("Unreviewed toolchain lock version.");
  }
  const entries = Object.entries(object(lock.packages));
  if (entries.length < 2 || entries.length > 180)
    throw new Error("Toolchain graph exceeds bounds.");
  return entries
    .filter(([path]) => path !== "")
    .map(([path, raw]) => {
      const entry = object(raw);
      if (
        path.length > 512 ||
        !/^(?:node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:\/node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)*$/u.test(
          path
        ) ||
        path.split("/").some((part) => part.startsWith(".")) ||
        entry.link ||
        entry.inBundle ||
        entry.hasInstallScript ||
        typeof entry.resolved !== "string" ||
        typeof entry.integrity !== "string" ||
        !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(entry.integrity)
      ) {
        throw new Error("Unsafe or script-bearing toolchain package.");
      }
      const url = new URL(entry.resolved);
      if (
        url.origin !== "https://registry.npmjs.org" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !/^\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+\/-\/[a-z0-9._-]+\.tgz$/u.test(url.pathname)
      ) {
        throw new Error("Toolchain archive is not a fixed registry tarball.");
      }
      return { path, resolved: entry.resolved, integrity: entry.integrity };
    });
}

export function verifyArchive(bytes: Uint8Array, integrity: string): void {
  if (
    bytes.byteLength > MAX_ARCHIVE_BYTES ||
    `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== integrity
  ) {
    throw new Error("Toolchain archive integrity failed.");
  }
}

export function validateMembers(names: string, modes: string): void {
  const entries = names.trim().split("\n");
  const descriptions = modes.trim().split("\n");
  if (!names.trim() || entries.length > 10_000 || descriptions.length !== entries.length) {
    throw new Error("Toolchain archive member bounds failed.");
  }
  for (let index = 0; index < entries.length; index++) {
    const path = entries[index] ?? "";
    const parts = path.replace(/\/$/u, "").split("/");
    if (
      path.length > 2048 ||
      parts[0] !== "package" ||
      parts.some((part) => !part || part === "." || part === "..") ||
      parts.includes("node_modules") ||
      path.includes("\\") ||
      Array.from(path).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ) ||
      !/^[d-]/u.test(descriptions[index] ?? "")
    ) {
      throw new Error("Toolchain archive contains unsafe paths, links or special files.");
    }
  }
}

export async function downloadArchive(
  url: string,
  integrity: string,
  budget: AbortSignal,
  transport: typeof fetch = fetch
): Promise<Uint8Array> {
  if (new URL(url).origin !== "https://registry.npmjs.org")
    throw new Error("Unreviewed archive origin.");
  const response = await transport(url, {
    redirect: "error",
    signal: AbortSignal.any([budget, AbortSignal.timeout(30_000)])
  });
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length") ?? 0) > MAX_ARCHIVE_BYTES
  ) {
    await response.body?.cancel();
    throw new Error("Toolchain download failed.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_ARCHIVE_BYTES || chunks.length >= 4096)
        throw new Error("Toolchain download exceeds bounds.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const archive = Buffer.concat(chunks);
  verifyArchive(archive, integrity);
  return archive;
}

export async function extractArchive(
  archive: string,
  target: string,
  members: string[],
  budget: AbortSignal
): Promise<void> {
  const options = {
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    signal: budget,
    env: { ...process.env, LC_ALL: "C" }
  };
  const names = await run("tar", ["-tzf", archive, ...members], options);
  const modes = await run("tar", ["-tvzf", archive, ...members], options);
  validateMembers(names.stdout, modes.stdout);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  await run(
    "tar",
    [
      "-xzf",
      archive,
      "--strip-components=1",
      "--no-same-owner",
      "--no-same-permissions",
      "-C",
      target,
      ...members
    ],
    options
  );
}

/** Restore verified CLI code and a script-free runtime graph without ever invoking runner npm. */
export async function bootstrapToolchain(): Promise<string> {
  const source = resolve(import.meta.dirname, "npm-toolchain");
  const manifestPath = join(source, "package.json");
  const lockPath = join(source, "package-lock.json");
  const manifestText = readFileSync(manifestPath, "utf8");
  const lockText = readFileSync(lockPath, "utf8");
  if (manifestText.length > 32 * 1024 || lockText.length > 256 * 1024)
    throw new Error("Toolchain metadata exceeds bounds.");
  const manifest = object(JSON.parse(manifestText));
  const lock = object(JSON.parse(lockText));
  const packages = lockedPackages(lock);
  const root = object(object(lock.packages)[""]);
  const canonical = (value: unknown) =>
    JSON.stringify(Object.entries(object(value)).sort(([a], [b]) => a.localeCompare(b)));
  if (
    manifest.name !== "npm" ||
    manifest.version !== CLI_VERSION ||
    canonical(root.dependencies) !== canonical(manifest.dependencies)
  ) {
    throw new Error("Toolchain manifest and lock disagree.");
  }
  const target = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "controlcurrent-npm-"));
  const staging = mkdtempSync(join(target, "archives-"));
  const budget = AbortSignal.timeout(300_000);
  let totalBytes = 0;
  try {
    const cli = await downloadArchive(CLI_URL, CLI_INTEGRITY, budget);
    const archive = join(staging, "cli.tgz");
    writeFileSync(archive, cli, { mode: 0o600 });
    await extractArchive(archive, target, CLI_MEMBERS, budget);
    const official = object(JSON.parse(readFileSync(join(target, "package.json"), "utf8")));
    if (
      official.name !== "npm" ||
      official.version !== CLI_VERSION ||
      canonical(official.dependencies) !== canonical(manifest.dependencies)
    ) {
      throw new Error("Official CLI identity or dependency contract changed.");
    }
    // Only runtime metadata is retained; workspace/development/bundle declarations are not restored.
    copyFileSync(manifestPath, join(target, "package.json"));
    copyFileSync(lockPath, join(target, "package-lock.json"));
    let next = 0;
    totalBytes += cli.byteLength;
    const workers = await Promise.allSettled(
      Array.from({ length: 4 }, async () => {
        for (;;) {
          const index = next++;
          const pkg = packages[index];
          if (!pkg) return;
          const bytes = await downloadArchive(pkg.resolved, pkg.integrity, budget);
          totalBytes += bytes.byteLength;
          if (totalBytes > MAX_TOTAL_BYTES)
            throw new Error("Toolchain total download exceeds bounds.");
          const file = join(staging, `${String(index)}.tgz`);
          writeFileSync(file, bytes, { mode: 0o600 });
          await extractArchive(file, join(target, pkg.path), [], budget);
        }
      })
    );
    if (workers.some((worker) => worker.status === "rejected"))
      throw new Error("Toolchain materialisation failed.");
    rmSync(staging, { recursive: true, force: true });
    return target;
  } catch (error) {
    // All workers have settled; remove only this invocation's fresh temporary directory.
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const target = await bootstrapToolchain();
  let path: string;
  try {
    path = await activateToolchain(target);
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
  console.log(
    `Reviewed npm ${CLI_VERSION} restored with an independently audited locked runtime graph.`
  );
  console.log(`For local use: export PATH="${path}:$PATH"`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch(() => {
    console.error("Reviewed toolchain restoration failed; do not fall back to runner npm.");
    process.exitCode = 1;
  });
}
