import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
  type FileHandle
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preparePrivateOutput, writePrivateJson } from "../tools/private-output";

const run = promisify(execFile);
let root: string;
let project: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "controlcurrent-private-output-"));
  project = join(root, "project");
  await mkdir(join(project, "public"), { recursive: true });
});
afterEach(async () => rm(root, { recursive: true, force: true }));

describe("private collector publication", () => {
  it.each(["private-data", ".private-data", "../external"])(
    "writes complete private JSON in %s with owner-only permissions",
    async (directory) => {
      const path = join(project, directory, "nested", "bundle.json");
      const output = await writePrivateJson(path, { synthetic: true }, project);
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual({ synthetic: true });
      expect((await stat(output)).mode & 0o777).toBe(0o600);
      expect(await readdir(join(output, ".."))).toEqual(["bundle.json"]);
      await expect(writePrivateJson(path, { replacement: true }, project)).rejects.toThrow(
        "exists"
      );
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual({ synthetic: true });
    }
  );

  it.each(["private-data", "private-data/publish", ".private-data/publish"])(
    "refuses a pre-existing parent alias at %s",
    async (alias) => {
      const target = join(project, alias);
      await mkdir(join(target, ".."), { recursive: true });
      await symlink(join(project, "public"), target, "dir");
      await expect(writePrivateJson(join(target, "bundle.json"), {}, project)).rejects.toThrow(
        "without symlinks"
      );
      expect(await readdir(join(project, "public"))).toEqual([]);
    }
  );

  it("refuses external aliases into public output before creating any children", async () => {
    const alias = join(root, "external-alias");
    await symlink(join(project, "public"), alias, "dir");
    await expect(preparePrivateOutput(join(alias, "new", "bundle.json"), project)).rejects.toThrow(
      "publication tree"
    );
    expect(await readdir(join(project, "public"))).toEqual([]);
    await expect(
      preparePrivateOutput(join(project, "public", "bundle.json"), project)
    ).rejects.toThrow("outside the repository");
  });

  it("refuses existing final symlinks without modifying their target", async () => {
    const target = join(root, "original");
    await writeFile(target, "unchanged");
    const output = join(root, "bundle.json");
    await symlink(target, output);
    await expect(writePrivateJson(output, {}, project)).rejects.toThrow("exists");
    expect(await readFile(target, "utf8")).toBe("unchanged");
  });

  it("lets exactly one competing process publish and preserves the winner's complete bytes", async () => {
    const runner = join(root, "writer.mjs");
    await writeFile(
      runner,
      `import { writePrivateJson } from ${JSON.stringify(new URL("../tools/private-output.ts", import.meta.url).href)};
       try { await writePrivateJson(process.argv[2], { writer: process.argv[3], payload: "x".repeat(100000) }, process.argv[4]); console.log(process.argv[3]); }
       catch { process.exitCode = 1; }`
    );
    const path = join(project, "private-data", "bundle.json");
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        run(
          process.execPath,
          [
            "--import",
            resolve("node_modules/tsx/dist/loader.mjs"),
            runner,
            path,
            String(index),
            project
          ],
          { timeout: 15_000 }
        )
      )
    );
    const winners = attempts.filter((result) => result.status === "fulfilled");
    expect(winners).toHaveLength(1);
    const winner = winners[0];
    if (winner?.status !== "fulfilled") throw new Error("No winning process");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      writer: winner.value.stdout.trim(),
      payload: "x".repeat(100000)
    });
    expect(await readdir(join(project, "private-data"))).toEqual(["bundle.json"]);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("leaves no partial output when serialisation fails", async () => {
    const path = join(project, "private-data", "bundle.json");
    await expect(writePrivateJson(path, { invalid: 1n }, project)).rejects.toThrow();
    expect(await readdir(join(project, "private-data"))).toEqual([]);
  });

  it("preserves a destination claimed after preflight but before publication", async () => {
    const output = join(project, "private-data", "bundle.json");
    const probe = await open(join(root, "probe"), "wx");
    const prototype = Object.getPrototypeOf(probe) as FileHandle;
    const original: unknown = Object.getOwnPropertyDescriptor(prototype, "sync")?.value;
    if (typeof original !== "function") throw new Error("Missing native sync");
    await probe.close();
    const claimant = vi.spyOn(prototype, "sync").mockImplementation(async function (
      this: FileHandle
    ) {
      await Reflect.apply(original, this, []);
      await writeFile(output, "winning writer", { flag: "wx", mode: 0o600 });
    });
    try {
      await expect(writePrivateJson(output, { loser: true }, project)).rejects.toMatchObject({
        code: "EEXIST"
      });
      expect(await readFile(output, "utf8")).toBe("winning writer");
      expect(await readdir(join(project, "private-data"))).toEqual(["bundle.json"]);
    } finally {
      claimant.mockRestore();
    }
  });

  it("removes a partially written temporary file after an I/O failure", async () => {
    const probe = await open(join(root, "probe"), "wx");
    const prototype = Object.getPrototypeOf(probe) as FileHandle;
    const original: unknown = Object.getOwnPropertyDescriptor(prototype, "writeFile")?.value;
    if (typeof original !== "function") throw new Error("Missing native writer");
    await probe.close();
    const failure = vi.spyOn(prototype, "writeFile").mockImplementation(async function (
      this: FileHandle
    ) {
      await Reflect.apply(original, this, ["partial synthetic bytes", "utf8"]);
      throw new Error("Synthetic disk failure");
    });
    try {
      await expect(
        writePrivateJson(join(project, "private-data", "bundle.json"), {}, project)
      ).rejects.toThrow("Synthetic disk failure");
      expect(await readdir(join(project, "private-data"))).toEqual([]);
    } finally {
      failure.mockRestore();
    }
  });
});
