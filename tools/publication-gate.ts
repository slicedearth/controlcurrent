import { appendFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPOSITORY = "slicedearth/controlcurrent";
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUIRED_WORKFLOWS = [
  { file: "ci.yml", jobs: ["verify", "browser"] },
  { file: "codeql.yml", jobs: ["analyse"] }
] as const;

type JsonObject = Record<string, unknown>;
export type ReadMetadata = (path: string) => Promise<unknown>;

function object(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Publication metadata is not an object.");
  }
  return value as JsonObject;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Publication metadata has an invalid identifier.");
  }
  return value;
}

function boundedList(value: unknown, key: string, limit: number): JsonObject[] {
  const envelope = object(value);
  const count = envelope.total_count;
  const list = envelope[key];
  if (
    typeof count !== "number" ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > limit ||
    !Array.isArray(list) ||
    list.length !== count
  ) {
    throw new Error("Publication metadata is incomplete or exceeds its bound.");
  }
  return list.map(object);
}

function validateSha(sha: string): void {
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error("Invalid publication commit.");
}

async function requireCurrentCommit(sha: string, read: ReadMetadata): Promise<void> {
  const reference = object(await read(`/repos/${REPOSITORY}/git/ref/heads/main`));
  const target = object(reference.object);
  if (reference.ref !== "refs/heads/main" || target.type !== "commit" || target.sha !== sha) {
    throw new Error("Publication commit is no longer the current main commit.");
  }
}

/** A complete successful workflow and its latest attempt's required jobs are mandatory. */
export async function publicationReady(sha: string, read: ReadMetadata): Promise<boolean> {
  validateSha(sha);
  await requireCurrentCommit(sha, read);
  let ready = true;
  for (const workflow of REQUIRED_WORKFLOWS) {
    const query = `branch=main&event=push&head_sha=${sha}&per_page=30`;
    const runs = boundedList(
      await read(`/repos/${REPOSITORY}/actions/workflows/${workflow.file}/runs?${query}`),
      "workflow_runs",
      30
    );
    const ids = new Set<number>();
    for (const run of runs) {
      const id = positiveInteger(run.id);
      if (ids.has(id)) throw new Error("Publication workflow metadata contains duplicates.");
      ids.add(id);
      positiveInteger(run.run_attempt);
      if (
        run.head_sha !== sha ||
        run.head_branch !== "main" ||
        run.event !== "push" ||
        object(run.head_repository).full_name !== REPOSITORY ||
        run.path !== `.github/workflows/${workflow.file}`
      ) {
        throw new Error("Publication workflow provenance does not match the release.");
      }
    }
    // A newer failed or pending run must not be hidden by an older successful run.
    const latest = runs.sort((left, right) => Number(right.id) - Number(left.id))[0];
    if (!latest) {
      ready = false;
      continue;
    }
    if (
      ["queued", "in_progress", "waiting", "pending", "requested"].includes(String(latest.status))
    ) {
      if (latest.conclusion !== null) throw new Error("Inconsistent pending workflow metadata.");
      ready = false;
      continue;
    }
    if (latest.status !== "completed" || latest.conclusion !== "success") {
      throw new Error(`Required ${workflow.file} workflow did not succeed.`);
    }
    const id = positiveInteger(latest.id);
    const attempt = positiveInteger(latest.run_attempt);
    const jobs = boundedList(
      await read(
        `/repos/${REPOSITORY}/actions/runs/${String(id)}/attempts/${String(attempt)}/jobs?per_page=100`
      ),
      "jobs",
      100
    );
    for (const name of workflow.jobs) {
      const matches = jobs.filter((job) => job.name === name);
      if (
        matches.length !== 1 ||
        matches[0]?.status !== "completed" ||
        matches[0].conclusion !== "success"
      ) {
        throw new Error(`Required ${workflow.file} job ${name} did not succeed.`);
      }
    }
  }
  await requireCurrentCommit(sha, read);
  return ready;
}

/** Fixed-origin GET-only client; redirects, large bodies and upstream diagnostics are refused. */
export async function readPublicationMetadata(
  path: string,
  token: string,
  transport: typeof fetch = fetch,
  budget?: AbortSignal
): Promise<unknown> {
  const allowed =
    /^\/repos\/slicedearth\/controlcurrent\/(?:git\/ref\/heads\/main|actions\/workflows\/(?:ci|codeql)\.yml\/runs\?branch=main&event=push&head_sha=[a-f0-9]{40}&per_page=30|actions\/runs\/[1-9][0-9]{0,15}\/attempts\/[1-9][0-9]{0,15}\/jobs\?per_page=100)$/u;
  if (!allowed.test(path)) {
    throw new Error("Publication API path is not allowlisted.");
  }
  const response = await transport(`https://api.github.com${path}`, {
    method: "GET",
    redirect: "error",
    signal: budget
      ? AbortSignal.any([budget, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10"
    }
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("Publication API request failed; no publication is permitted.");
  }
  if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
    await response.body.cancel();
    throw new Error("Publication API response exceeds its bound.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new Error("Publication API response exceeds its bound.");
      if (chunks.length >= 4096) throw new Error("Publication API stream exceeds its chunk bound.");
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel();
  }
}

export async function waitForPublication(
  sha: string,
  read: ReadMetadata,
  waitSeconds: number,
  clock: () => number = Date.now,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<void> {
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 600) {
    throw new Error("Publication wait must be between zero and 600 seconds.");
  }
  const deadline = clock() + waitSeconds * 1000;
  for (let attempts = 0; attempts < 31; attempts++) {
    if (await publicationReady(sha, read)) return;
    const remaining = deadline - clock();
    if (remaining <= 0) break;
    await pause(Math.min(20_000, remaining));
  }
  throw new Error("Required release checks are missing or still pending; publication is blocked.");
}

async function main(): Promise<void> {
  const sha = process.env.RELEASE_SHA ?? "";
  const token = process.env.GH_TOKEN ?? "";
  const waitSeconds = Number(process.env.GATE_WAIT_SECONDS ?? "0");
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 600) {
    throw new Error("Publication wait must be between zero and 600 seconds.");
  }
  if (
    process.env.GITHUB_REPOSITORY !== REPOSITORY ||
    process.env.GITHUB_REF !== "refs/heads/main" ||
    !token
  ) {
    throw new Error("Publication requires the expected main-branch workflow context.");
  }
  const budget = AbortSignal.timeout(Math.max(10, waitSeconds) * 1000);
  await waitForPublication(
    sha,
    (path) => readPublicationMetadata(path, token, fetch, budget),
    waitSeconds
  );
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\n`);
  console.log("Publication commit is current; required CI and analysis jobs succeeded.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch(() => {
    // Never echo credentials, upstream bodies or request diagnostics into workflow logs.
    console.error(
      "Publication guard failed. Check current main and its required workflow results."
    );
    process.exitCode = 1;
  });
}
