import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  publicationReady,
  readPublicationMetadata,
  waitForPublication
} from "../tools/publication-gate";

const SHA = "a".repeat(40);
const ROOT = "/repos/slicedearth/controlcurrent";
const query = `branch=main&event=push&head_sha=${SHA}&per_page=30`;
const CI = `${ROOT}/actions/workflows/ci.yml/runs?${query}`;
const CODEQL = `${ROOT}/actions/workflows/codeql.yml/runs?${query}`;
const REF = `${ROOT}/git/ref/heads/main`;

function run(id: number, file: string, changes: Record<string, unknown> = {}) {
  return {
    id,
    run_attempt: 1,
    head_sha: SHA,
    head_branch: "main",
    event: "push",
    head_repository: { full_name: "slicedearth/controlcurrent" },
    path: `.github/workflows/${file}`,
    status: "completed",
    conclusion: "success",
    ...changes
  };
}

function fixture() {
  const data = new Map<string, unknown>([
    [REF, { ref: "refs/heads/main", object: { type: "commit", sha: SHA } }],
    [CI, { total_count: 1, workflow_runs: [run(100, "ci.yml")] }],
    [CODEQL, { total_count: 1, workflow_runs: [run(200, "codeql.yml")] }],
    [
      `${ROOT}/actions/runs/100/attempts/1/jobs?per_page=100`,
      {
        total_count: 2,
        jobs: ["verify", "browser"].map((name) => ({
          name,
          status: "completed",
          conclusion: "success"
        }))
      }
    ],
    [
      `${ROOT}/actions/runs/200/attempts/1/jobs?per_page=100`,
      { total_count: 1, jobs: [{ name: "analyse", status: "completed", conclusion: "success" }] }
    ]
  ]);
  const read = vi.fn((path: string) => Promise.resolve(structuredClone(data.get(path))));
  return { data, read };
}

describe("exact-commit publication gate", () => {
  it("requires both successful workflows, their required jobs and current main twice", async () => {
    const { read } = fixture();
    await expect(publicationReady(SHA, read)).resolves.toBe(true);
    expect(read.mock.calls.filter(([path]) => path === REF)).toHaveLength(2);
    expect(read.mock.calls.map(([path]) => path)).toContain(CODEQL);
  });

  it.each(["failure", "cancelled", "timed_out", "skipped", "neutral", "action_required"])(
    "refuses a newer %s run instead of reusing old success",
    async (conclusion) => {
      const { data, read } = fixture();
      data.set(CODEQL, {
        total_count: 2,
        workflow_runs: [run(200, "codeql.yml"), run(201, "codeql.yml", { conclusion })]
      });
      await expect(publicationReady(SHA, read)).rejects.toThrow(/did not succeed/u);
    }
  );

  it("waits for a newer pending run, not an older success", async () => {
    const { data, read } = fixture();
    data.set(CODEQL, {
      total_count: 2,
      workflow_runs: [
        run(201, "codeql.yml", { status: "in_progress", conclusion: null }),
        run(200, "codeql.yml")
      ]
    });
    await expect(publicationReady(SHA, read)).resolves.toBe(false);
  });

  it.each([
    { head_sha: "b".repeat(40) },
    { head_branch: "feature" },
    { event: "pull_request" },
    { head_repository: { full_name: "other/repository" } },
    { path: ".github/workflows/other.yml" },
    { id: -1 },
    { run_attempt: 0 },
    { status: "invented" },
    { status: "queued", conclusion: "success" }
  ])("refuses wrong or malformed provenance %j", async (changes) => {
    const { data, read } = fixture();
    data.set(CODEQL, { total_count: 1, workflow_runs: [run(200, "codeql.yml", changes)] });
    await expect(publicationReady(SHA, read)).rejects.toThrow();
  });

  it("requires the newest run attempt's jobs", async () => {
    const { data, read } = fixture();
    data.set(CODEQL, {
      total_count: 1,
      workflow_runs: [run(200, "codeql.yml", { run_attempt: 2 })]
    });
    data.set(`${ROOT}/actions/runs/200/attempts/2/jobs?per_page=100`, {
      total_count: 1,
      jobs: [{ name: "analyse", status: "completed", conclusion: "failure" }]
    });
    await expect(publicationReady(SHA, read)).rejects.toThrow(/job analyse/u);
  });

  it.each([
    [],
    [{ name: "analyse", status: "completed", conclusion: "skipped" }],
    [{ name: "analyse", status: "in_progress", conclusion: null }],
    [
      { name: "analyse", status: "completed", conclusion: "success" },
      { name: "analyse", status: "completed", conclusion: "success" }
    ]
  ])("refuses missing, skipped, pending or ambiguous required jobs %j", async (...jobs) => {
    const { data, read } = fixture();
    // each array is spread into test arguments; restore the job list.
    data.set(`${ROOT}/actions/runs/200/attempts/1/jobs?per_page=100`, {
      total_count: jobs.length,
      jobs
    });
    await expect(publicationReady(SHA, read)).rejects.toThrow(/job analyse/u);
  });

  it.each([
    { total_count: 31, workflow_runs: [] },
    { total_count: 2, workflow_runs: [run(200, "codeql.yml")] },
    { total_count: 1.5, workflow_runs: [] },
    { total_count: 1, workflow_runs: [null] },
    { total_count: 2, workflow_runs: [run(200, "codeql.yml"), run(200, "codeql.yml")] }
  ])("refuses truncated or malformed metadata %j", async (value) => {
    const { data, read } = fixture();
    data.set(CODEQL, value);
    await expect(publicationReady(SHA, read)).rejects.toThrow();
  });

  it("blocks superseded main before or during verification", async () => {
    const { data, read } = fixture();
    data.set(REF, { ref: "refs/heads/main", object: { type: "commit", sha: "b".repeat(40) } });
    await expect(publicationReady(SHA, read)).rejects.toThrow(/current main/u);
    const second = fixture();
    let reads = 0;
    const changing = async (path: string) => {
      if (path === REF && ++reads === 2) {
        return { ref: "refs/heads/main", object: { type: "commit", sha: "b".repeat(40) } };
      }
      return second.read(path);
    };
    await expect(publicationReady(SHA, changing)).rejects.toThrow(/current main/u);
  });

  it("validates SHA before making requests", async () => {
    const { read } = fixture();
    await expect(publicationReady("main; echo unsafe", read)).rejects.toThrow(/commit/u);
    expect(read).not.toHaveBeenCalled();
  });

  it("bounds pending waits and refuses missing checks at deployment", async () => {
    const { data, read } = fixture();
    data.set(CODEQL, { total_count: 0, workflow_runs: [] });
    let now = 0;
    const pause = vi.fn((ms: number) => {
      now += ms;
      return Promise.resolve();
    });
    await expect(waitForPublication(SHA, read, 40, () => now, pause)).rejects.toThrow(/pending/u);
    expect(pause).toHaveBeenCalledTimes(2);
    await expect(waitForPublication(SHA, read, 0)).rejects.toThrow(/pending/u);
    await expect(waitForPublication(SHA, read, 601)).rejects.toThrow(/600/u);
  });

  it("can observe pending analysis complete without dispatching anything", async () => {
    const { data, read } = fixture();
    data.set(CODEQL, { total_count: 0, workflow_runs: [] });
    const pause = vi.fn(() => {
      data.set(CODEQL, { total_count: 1, workflow_runs: [run(200, "codeql.yml")] });
      return Promise.resolve();
    });
    await expect(waitForPublication(SHA, read, 40, () => 0, pause)).resolves.toBeUndefined();
    expect(pause).toHaveBeenCalledTimes(1);
  });
});

describe("publication metadata transport", () => {
  it("refuses non-metadata routes and propagates the absolute request budget", async () => {
    const transport = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ ok: true })));
    for (const path of [
      `${ROOT}/contents/package.json`,
      `${REF}?unexpected=true`,
      `${ROOT}/../other/git/ref/heads/main`,
      `${ROOT}/actions/runs/1/attempts/1/jobs?per_page=100#fragment`
    ]) {
      await expect(readPublicationMetadata(path, "synthetic-token", transport)).rejects.toThrow(
        /allowlisted/u
      );
    }
    expect(transport).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await readPublicationMetadata(REF, "synthetic-token", transport, controller.signal);
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("uses fixed-origin GET requests with redirects refused and no diagnostic retention", async () => {
    const transport = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ ok: true })));
    await expect(readPublicationMetadata(REF, "synthetic-token", transport)).resolves.toEqual({
      ok: true
    });
    expect(transport.mock.calls[0]?.[0]).toBe(`https://api.github.com${REF}`);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(transport.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    await expect(
      readPublicationMetadata("https://elsewhere.example/", "synthetic-token", transport)
    ).rejects.toThrow(/allowlisted/u);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 429, 500])("refuses HTTP %i without leaking its body", async (status) => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("secret upstream details", { status }))
    );
    await expect(readPublicationMetadata(REF, "synthetic-token", transport)).rejects.toThrow(
      "Publication API request failed; no publication is permitted."
    );
  });

  it("caps declared and streamed bodies and rejects malformed JSON", async () => {
    for (const response of [
      new Response("{}", { headers: { "content-length": "999999" } }),
      new Response("x".repeat(512 * 1024 + 1)),
      new Response("not JSON")
    ]) {
      const transport = vi.fn<typeof fetch>(() => Promise.resolve(response));
      await expect(readPublicationMetadata(REF, "synthetic-token", transport)).rejects.toThrow();
    }
  });

  it("caps excessive stream fragmentation independently of byte length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 4097; i++) controller.enqueue(new Uint8Array([32]));
        controller.close();
      }
    });
    const transport = vi.fn<typeof fetch>(() => Promise.resolve(new Response(body)));
    await expect(readPublicationMetadata(REF, "synthetic-token", transport)).rejects.toThrow(
      /chunk bound/u
    );
  });

  it("refuses missing workflow context in the native dependency-free CLI", () => {
    const result = spawnSync(process.execPath, ["tools/publication-gate.ts"], {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "wrong/repository",
        GH_TOKEN: "synthetic-do-not-log"
      }
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Publication guard failed");
    expect(result.stderr).not.toContain("synthetic-do-not-log");
  });

  it("runs successfully with only the guard file, no package metadata and a fixture transport", () => {
    const directory = mkdtempSync(join(tmpdir(), "controlcurrent-guard-fixture-"));
    try {
      const filename = join(directory, "tools", "publication-gate.ts");
      const preload = join(directory, "fixture-transport.mjs");
      const output = join(directory, "output");
      mkdirSync(join(directory, "tools"));
      copyFileSync("tools/publication-gate.ts", filename);
      const { data } = fixture();
      writeFileSync(
        preload,
        `const data = new Map(${JSON.stringify([...data])});
globalThis.fetch = async (url, options) => {
  if (options.method !== "GET" || options.redirect !== "error") throw new Error("Unexpected request");
  const path = new URL(url).pathname + new URL(url).search;
  if (!String(url).startsWith("https://api.github.com/") || !data.has(path)) throw new Error("Unexpected endpoint");
  return Response.json(data.get(path));
};\n`
      );
      const result = spawnSync(process.execPath, ["--import", preload, filename], {
        cwd: directory,
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "slicedearth/controlcurrent",
          GITHUB_REF: "refs/heads/main",
          RELEASE_SHA: SHA,
          GH_TOKEN: "synthetic-do-not-log",
          GATE_WAIT_SECONDS: "0",
          GITHUB_OUTPUT: output
        }
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(output, "utf8")).toBe(`sha=${SHA}\n`);
      expect(result.stdout).toContain("required CI and analysis jobs succeeded");
      expect(result.stdout + result.stderr).not.toContain("synthetic-do-not-log");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
