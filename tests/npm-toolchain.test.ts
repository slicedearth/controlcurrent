import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CLI_VERSION,
  downloadArchive,
  extractArchive,
  lockedPackages,
  validateMembers,
  verifyArchive
} from "../tools/bootstrap-npm";

const bytes = Buffer.from("bounded fixture archive");
const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const pkg = { resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz", integrity };
const lock = (path = "node_modules/example", entry: unknown = pkg) => ({
  name: "npm",
  version: CLI_VERSION,
  lockfileVersion: 3,
  packages: { "": {}, [path]: entry }
});

describe("reviewed package-manager runtime", () => {
  it.each([false, true])("validates actual host-tar extraction with link=%s", async (link) => {
    const root = mkdtempSync(join(tmpdir(), "controlcurrent-archive-test-"));
    try {
      mkdirSync(join(root, "package"));
      writeFileSync(join(root, "outside.txt"), "unchanged");
      writeFileSync(join(root, "package/regular.txt"), "fixture");
      if (link) symlinkSync("../outside.txt", join(root, "package/link.txt"));
      const archive = join(root, "fixture.tgz");
      execFileSync("tar", ["-czf", archive, "package"], { cwd: root, timeout: 10_000 });
      const target = join(root, "restored");
      if (link) {
        await expect(
          extractArchive(archive, target, [], AbortSignal.timeout(10_000))
        ).rejects.toThrow("unsafe");
        expect(existsSync(target)).toBe(false);
      } else {
        await extractArchive(archive, target, [], AbortSignal.timeout(10_000));
        expect(readFileSync(join(target, "regular.txt"), "utf8")).toBe("fixture");
      }
      expect(readFileSync(join(root, "outside.txt"), "utf8")).toBe("unchanged");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("retains compatible patched locked packages without overrides or bundles", () => {
    const raw: unknown = JSON.parse(readFileSync("tools/npm-toolchain/package-lock.json", "utf8"));
    const packages = lockedPackages(raw);
    expect(packages).toHaveLength(147);
    const text = readFileSync("tools/npm-toolchain/package.json", "utf8");
    expect(text).not.toContain('"overrides"');
    for (const [name, version] of [
      ["brace-expansion", "5.0.12"],
      ["http-cache-semantics", "4.3.0"],
      ["ip-address", "10.7.3"],
      ["undici", "8.11.2"]
    ] as const) {
      expect(packages.find((value) => value.path === `node_modules/${name}`)?.resolved).toContain(
        `-${version}.tgz`
      );
    }
  });

  it.each([
    "../escape",
    "/node_modules/a",
    "node_modules/../a",
    "node_modules/.hidden",
    "node_modules/a/../../b",
    "node_modules/a?b"
  ])("refuses lock path %s", (path) => {
    expect(() => lockedPackages(lock(path))).toThrow();
  });

  it.each([
    { ...pkg, resolved: "https://other.invalid/a.tgz" },
    { ...pkg, resolved: "https://registry.npmjs.org/a/-/a.tgz?token=x" },
    { ...pkg, resolved: "https://user:password@registry.npmjs.org/a/-/a.tgz" },
    { ...pkg, integrity: "sha1-not-reviewed" },
    { ...pkg, hasInstallScript: true },
    { ...pkg, inBundle: true },
    { ...pkg, link: true }
  ])("refuses unsafe metadata %#", (entry) =>
    expect(() => lockedPackages(lock(undefined, entry))).toThrow()
  );

  it("refuses future locks and excessive graphs", () => {
    expect(() => lockedPackages({ ...lock(), lockfileVersion: 4 })).toThrow();
    expect(() => lockedPackages({ ...lock(), version: "13.0.0" })).toThrow();
    expect(() =>
      lockedPackages({
        ...lock(),
        packages: Object.fromEntries(
          Array.from({ length: 181 }, (_, i) => [`node_modules/p${String(i)}`, pkg])
        )
      })
    ).toThrow();
  });

  it("checks archive integrity before any extraction", () => {
    expect(() => verifyArchive(bytes, integrity)).not.toThrow();
    expect(() => verifyArchive(Buffer.from("different"), integrity)).toThrow();
    expect(() => verifyArchive(Buffer.alloc(16 * 1024 * 1024 + 1), integrity)).toThrow();
  });

  it("accepts regular files and directories only", () => {
    expect(() =>
      validateMembers(
        "package/\npackage/lib/index.js\n",
        "drwx root 0 package/\n-rw root 1 package/lib/index.js\n"
      )
    ).not.toThrow();
  });

  it.each([
    "package/../escape",
    "/package/a",
    "package//a",
    "package/a\\b",
    "package/a\u0000b",
    "package/node_modules/hidden/a",
    "elsewhere/a"
  ])("refuses archive member %s", (name) =>
    expect(() => validateMembers(name, "-rw root 1 x")).toThrow()
  );
  it.each(["l", "h", "c", "b", "p", "s"])("refuses archive entry type %s", (type) =>
    expect(() => validateMembers("package/a", `${type}rw root 1 x`)).toThrow()
  );
  it("refuses incomplete listings", () => {
    expect(() => validateMembers("", "")).toThrow();
    expect(() => validateMembers("package/a\npackage/b", "-rw root 1 a")).toThrow();
  });

  it("uses fixed-origin downloads with redirect refusal and no credentials", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
    expect(
      await downloadArchive(pkg.resolved, integrity, AbortSignal.timeout(1000), transport)
    ).toEqual(bytes);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
    expect(transport.mock.calls[0]?.[1]).not.toHaveProperty("headers");
    await expect(
      downloadArchive("https://other.invalid/a", integrity, AbortSignal.timeout(1000), transport)
    ).rejects.toThrow();
  });

  it.each([403, 404, 429, 500])("refuses download status %s", async (status) => {
    await expect(
      downloadArchive(
        pkg.resolved,
        integrity,
        AbortSignal.timeout(1000),
        vi.fn<typeof fetch>().mockResolvedValue(new Response("upstream detail", { status }))
      )
    ).rejects.toThrow("download failed");
  });

  it("refuses oversized and altered downloads", async () => {
    await expect(
      downloadArchive(
        pkg.resolved,
        integrity,
        AbortSignal.timeout(1000),
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(bytes, { headers: { "content-length": String(16 * 1024 * 1024 + 1) } })
          )
      )
    ).rejects.toThrow();
    await expect(
      downloadArchive(
        pkg.resolved,
        integrity,
        AbortSignal.timeout(1000),
        vi.fn<typeof fetch>().mockResolvedValue(new Response("altered"))
      )
    ).rejects.toThrow("integrity");
  });
});
