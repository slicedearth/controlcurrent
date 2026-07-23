export const MAX_PUBLIC_JSON_FILE_BYTES = 2 * 1_024 * 1_024;
export const MAX_PUBLIC_JSON_TOTAL_BYTES = 5 * 1_024 * 1_024;
export const MAX_WORKFLOW_BYTES = 128 * 1_024;

export const ALLOWED_PUBLIC_DATA_FILES = new Set([
  "data/change-events.json",
  "data/selected-bcd.json",
  "data/source-history.json"
]);

export const ALLOWED_SYNTHETIC_EXAMPLE_FILES = new Set([
  "examples/evidence-bundle.example.json",
  "examples/evidence-policy.json",
  "examples/headers.example.json",
  "examples/policy-profile.json",
  "examples/scope-inventory.json"
]);

const prohibitedBasenames = new Set([
  "controlcurrent-profile.json",
  "controlcurrent-evidence-report.json",
  "controlcurrent-evidence-comparison.json",
  "report.json",
  "statement.json",
  "sigstore-bundle.json",
  "evidence-policy-evaluation.json"
]);

const prohibitedJsonPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\b(?:api|access|auth|secret)[_-]?key["']?\s*[:=]\s*["'][^"']{8,}/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_]{20,}\b/u,
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/iu,
  /\b10\.(?:\d{1,3}\.){2}\d{1,3}\b/u,
  /\b192\.168\.(?:\d{1,3}\.)\d{1,3}\b/u,
  /\b172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3}\b/u
];

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

export function auditRepositoryPaths(files: readonly string[]): void {
  for (const file of files) {
    if (prohibitedBasenames.has(basename(file))) {
      throw new Error(`${file} is a local evidence or profile export and must not be tracked.`);
    }
    if (file.startsWith("data/") && !ALLOWED_PUBLIC_DATA_FILES.has(file)) {
      throw new Error(`${file} is not an approved public data file.`);
    }
    if (file.startsWith("examples/") && !ALLOWED_SYNTHETIC_EXAMPLE_FILES.has(file)) {
      throw new Error(`${file} is not an approved synthetic example file.`);
    }
  }
}

export function auditPublicJson(file: string, contents: string, bytes: number): void {
  if (bytes > MAX_PUBLIC_JSON_FILE_BYTES) {
    throw new Error(`${file} exceeds the public JSON file bound.`);
  }
  JSON.parse(contents);
  for (const pattern of prohibitedJsonPatterns) {
    if (pattern.test(contents)) {
      throw new Error(`${file} matches prohibited public JSON content.`);
    }
  }
}

export function auditPublicJsonTotal(bytes: number): void {
  if (bytes > MAX_PUBLIC_JSON_TOTAL_BYTES) {
    throw new Error("Approved public JSON exceeds the aggregate size bound.");
  }
}

export function auditWorkflow(file: string, contents: string, bytes: number): void {
  if (bytes > MAX_WORKFLOW_BYTES) {
    throw new Error(`${file} exceeds the workflow file bound.`);
  }
  if (/^\s*pull_request_target\s*:/mu.test(contents)) {
    throw new Error(`${file} uses the privileged pull_request_target trigger.`);
  }
  if (/\bself-hosted\b/u.test(contents)) {
    throw new Error(`${file} uses a self-hosted runner.`);
  }
  if (/^\s*permissions:\s*write-all\s*$/mu.test(contents)) {
    throw new Error(`${file} grants write-all permissions.`);
  }

  for (const match of contents.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.+))?$/gmu)) {
    const reference = match[1];
    if (!reference || reference.startsWith("./")) continue;
    const at = reference.lastIndexOf("@");
    const revision = at === -1 ? "" : reference.slice(at + 1);
    if (!/^[a-f0-9]{40}$/u.test(revision)) {
      throw new Error(`${file} uses an action that is not pinned to a full commit SHA.`);
    }
    if (!/^v\d+\.\d+\.\d+(?:\s|$)/u.test(match[2] ?? "")) {
      throw new Error(`${file} is missing a reviewed version comment for ${reference}.`);
    }
  }
}

function workflowJob(contents: string, name: string): string {
  const jobsIndex = contents.indexOf("\njobs:\n");
  if (jobsIndex === -1) throw new Error("Workflow has no jobs block.");
  const jobs = contents.slice(jobsIndex + 1);
  const matches = [...jobs.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gmu)];
  const current = matches.findIndex((match) => match[1] === name);
  if (current === -1) throw new Error(`Workflow has no ${name} job.`);
  const start = matches[current]?.index ?? 0;
  const end = matches[current + 1]?.index ?? jobs.length;
  return jobs.slice(start, end);
}

export function auditPagesWorkflow(contents: string): void {
  const build = workflowJob(contents, "build");
  const deploy = workflowJob(contents, "deploy");

  if (!/^\s{6}contents:\s*read\s*$/mu.test(build)) {
    throw new Error("The Pages build job must retain read-only repository access.");
  }
  if (!/^\s{6}pages:\s*read\s*$/mu.test(build)) {
    throw new Error("The Pages build job must limit Pages access to read.");
  }
  if (/^\s{6}(?:pages|id-token):\s*write\s*$/mu.test(build)) {
    throw new Error("The Pages build job must not receive deployment credentials.");
  }
  if (!/^\s{6}pages:\s*write\s*$/mu.test(deploy)) {
    throw new Error("The Pages deploy job requires pages: write.");
  }
  if (!/^\s{6}id-token:\s*write\s*$/mu.test(deploy)) {
    throw new Error("The Pages deploy job requires id-token: write.");
  }
  if (/^\s{6}contents:\s*write\s*$/mu.test(deploy)) {
    throw new Error("The Pages deploy job must not receive repository write access.");
  }

  if (/^ {2}workflow_run:\s*$/mu.test(contents)) {
    const requiredTriggerFragments = [
      "workflows:\n      - CI",
      "types:\n      - completed",
      "branches:\n      - main"
    ];
    if (requiredTriggerFragments.some((fragment) => !contents.includes(fragment))) {
      throw new Error("The Pages workflow_run trigger must follow completed CI runs on main.");
    }
    const requiredBuildGuards = [
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.event == 'push'",
      "github.event.workflow_run.head_branch == 'main'"
    ];
    if (requiredBuildGuards.some((guard) => !build.includes(guard))) {
      throw new Error("The Pages build must accept only successful main push CI runs.");
    }
    if (!build.includes("github.event.workflow_run.head_sha || github.sha")) {
      throw new Error("The Pages build must check out the exact commit verified by CI.");
    }
  }
}
