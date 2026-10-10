import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { canonicalJson } from "../src/canonical";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");

function outside(project: string, path: string): boolean {
  const child = relative(project, path);
  return child === ".." || child.startsWith(`..${sep}`);
}

function privatePath(project: string, path: string): boolean {
  const child = relative(project, path);
  return (
    outside(project, path) ||
    child.startsWith(`private-data${sep}`) ||
    child.startsWith(`.private-data${sep}`)
  );
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Parents must be trusted against concurrent directory replacement by local processes. */
export async function preparePrivateOutput(path: string, project = PROJECT_ROOT): Promise<string> {
  const lexicalProject = resolve(project);
  const trustedProject = await realpath(lexicalProject);
  const requested = resolve(path);
  if (!privatePath(lexicalProject, requested)) {
    throw new Error(
      "Collector output must be outside the repository or under private-data/ or .private-data/."
    );
  }

  let directory: string;
  if (!outside(lexicalProject, requested)) {
    // Reject even links that currently point to another private location. The
    // repository-private root and every child directory have one explicit owner.
    directory = trustedProject;
    for (const part of relative(lexicalProject, dirname(requested)).split(sep)) {
      directory = join(directory, part);
      try {
        await mkdir(directory, { mode: 0o700 });
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      }
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(
          "Collector output parents must be ordinary private directories, without symlinks."
        );
      }
    }
  } else {
    // Resolve the existing external anchor before creating any children. This
    // permits platform aliases such as /var while refusing aliases into public/.
    const pending: string[] = [];
    directory = dirname(requested);
    for (;;) {
      try {
        directory = await realpath(directory);
        break;
      } catch (error) {
        if (!missing(error)) throw error;
        pending.unshift(basename(directory));
        directory = dirname(directory);
      }
    }
    directory = join(directory, ...pending);
    if (!privatePath(trustedProject, join(directory, basename(requested)))) {
      throw new Error("Collector output resolves into the repository publication tree.");
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  const output = join(directory, basename(requested));
  try {
    await lstat(output);
    throw new Error("Collector output already exists; choose a new path.");
  } catch (error) {
    if (!missing(error)) throw error;
  }
  return output;
}

export async function writePrivateJson(
  path: string,
  value: unknown,
  project = PROJECT_ROOT
): Promise<string> {
  const output = await preparePrivateOutput(path, project);
  const contents = canonicalJson(value);
  const temporary = join(dirname(output), `.collector-${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(contents, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    // Same-directory hard linking publishes complete bytes atomically and fails
    // if any writer already claimed the destination. Never fall back to rename.
    await link(temporary, output);
  } finally {
    await unlink(temporary);
  }
  return output;
}
