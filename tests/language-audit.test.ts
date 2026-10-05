import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const upstreamSpelling = ["norm", "alize"].join("");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "controlcurrent-language-"));
  directories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  mkdirSync(join(root, "tools"));
  copyFileSync(
    new URL("../tools/audit-language.ts", import.meta.url),
    join(root, "tools/audit-language.ts")
  );
  const write = (file: string, contents: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  };
  const stage = (file: string) => execFileSync("git", ["add", "--", file], { cwd: root });
  const audit = (cwd = root) =>
    spawnSync(process.execPath, [join(root, "tools/audit-language.ts")], {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 2 * 1_024 * 1_024
    });
  return { root, write, stage, audit };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("Australian-English repository audit", () => {
  it("excludes only the reviewed generated locks, not nearby authored manifests", () => {
    const { write, stage, audit } = fixture();
    for (const file of ["package-lock.json", "tools/npm-toolchain/package-lock.json"]) {
      write(file, JSON.stringify({ dependency: `npm-${upstreamSpelling}-package-bin` }));
      stage(file);
    }
    expect(audit().status).toBe(0);
    write("tools/npm-toolchain/package.json", JSON.stringify({ description: upstreamSpelling }));
    expect(audit().stderr).toContain("tools/npm-toolchain/package.json:1:");
    write("tools/other/package-lock.json", JSON.stringify({ description: upstreamSpelling }));
    expect(audit().stderr).toContain("tools/other/package-lock.json:1:");
  });

  it("catches new authored files before staging and after staging", () => {
    const { write, stage, audit } = fixture();
    write("README.md", `First line\n${upstreamSpelling}\n`);
    const before = audit();
    expect(before.status).not.toBe(0);
    expect(before.stderr).toContain("README.md:2:");
    stage("README.md");
    const after = audit();
    expect(after.status).not.toBe(0);
    expect(after.stderr).toBe(before.stderr);
    write("README.md", "Normalise project-authored text.\n");
    expect(audit().status).toBe(0);
  });

  it("uses NUL-delimited paths and the repository root even from a subdirectory", () => {
    const { root, write, audit } = fixture();
    const file = "docs/new\nterminology – fixture.md";
    write(file, upstreamSpelling);
    const result = audit(join(root, "tools"));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${file}:1:`);
  });

  it("respects ignored files and audits each staged file only once", () => {
    const { write, stage, audit } = fixture();
    write(".gitignore", "local-notes/\n");
    write("local-notes/private.md", upstreamSpelling);
    write("README.md", "Normalise project-authored text.\n");
    stage("README.md");
    const result = audit();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Audited 1 tracked or unignored project-authored files");
  });
});
