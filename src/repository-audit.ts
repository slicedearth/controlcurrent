export const MAX_PUBLIC_JSON_FILE_BYTES = 2 * 1_024 * 1_024;
export const MAX_PUBLIC_JSON_TOTAL_BYTES = 5 * 1_024 * 1_024;

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
