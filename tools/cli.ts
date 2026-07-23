import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SECURITY_CONTROLS } from "../src/catalogue";
import { canonicalJson } from "../src/canonical";
import { selectedSnapshot } from "../src/data";
import { browserIdSchema, policyProfileSchema } from "../src/contracts";
import { findMinimumBaselines } from "../src/minimums";
import { evaluatePolicyProfile } from "../src/policy";

const MAX_PROFILE_BYTES = 64 * 1_024;

function usage(): never {
  console.error(`Usage:
  npm run cli -- check <profile.json> [--as-of YYYY-MM-DD] [--strict-review] [--json]
  npm run cli -- minimum <control-id,...> [--browsers chrome,edge,...] [--allow-qualified] [--json]
  npm run cli -- explain <control-id> [--json]`);
  process.exitCode = 2;
  throw new Error("Invalid command.");
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readBoundedJson(path: string): Promise<unknown> {
  const contents = await readFile(resolve(path), "utf8");
  if (Buffer.byteLength(contents, "utf8") > MAX_PROFILE_BYTES) {
    throw new Error(`Profile exceeds ${String(MAX_PROFILE_BYTES)} bytes.`);
  }
  return JSON.parse(contents) as unknown;
}

async function check(): Promise<void> {
  const path = process.argv[3] ?? usage();
  const asOf = optionValue("--as-of") ?? utcDate();
  const profile = policyProfileSchema.parse(await readBoundedJson(path));
  const result = evaluatePolicyProfile(selectedSnapshot, profile, asOf);
  const strictReview = process.argv.includes("--strict-review");
  const failed = result.summary.fail > 0 || (strictReview && result.summary.review > 0);

  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(result));
  } else {
    console.log(`${profile.name}: ${failed ? "policy failed" : "policy satisfied"}`);
    console.log(
      `${String(result.summary.pass)} pass, ${String(result.summary.review)} review, ${String(result.summary.fail)} fail`
    );
    for (const finding of result.findings.filter((item) => item.decision !== "pass")) {
      console.log(
        `- ${finding.decision.toUpperCase()} ${finding.controlId} ${finding.browser} ${finding.minimumVersion}: ${finding.outcome}`
      );
    }
  }
  process.exitCode = failed ? 1 : 0;
}

function minimum(): void {
  const controls = (process.argv[3] ?? usage())
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const browserInput = (optionValue("--browsers") ?? "chrome,edge,firefox,safari")
    .split(",")
    .map((value) => browserIdSchema.parse(value.trim()));
  const results = findMinimumBaselines(selectedSnapshot, {
    controlIds: controls,
    browsers: browserInput,
    allowQualified: process.argv.includes("--allow-qualified")
  });

  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(results));
  } else {
    for (const result of results) {
      if (result.status === "found") {
        const { minimumVersion, releaseDate } = result;
        if (!minimumVersion || !releaseDate) {
          throw new Error(`Minimum-baseline result is incomplete for ${result.browser}.`);
        }
        console.log(`${result.browser}: ${minimumVersion} (${releaseDate})`);
      } else {
        console.log(`${result.browser}: ${result.status}; blockers: ${result.blockers.join(", ")}`);
      }
    }
  }
}

function explain(): void {
  const controlId = process.argv[3] ?? usage();
  const control = SECURITY_CONTROLS.find((candidate) => candidate.id === controlId);
  if (!control) throw new Error(`Unknown control: ${controlId}`);
  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(control));
  } else {
    console.log(`${control.name} (${control.id})`);
    console.log(control.summary);
    console.log(
      `Mapping: ${control.mappingState}; paths: ${control.bcdPaths.join(", ") || "none"}`
    );
    console.log(`Fallback: ${control.fallback}`);
  }
}

try {
  switch (process.argv[2]) {
    case "check":
      await check();
      break;
    case "minimum":
      minimum();
      break;
    case "explain":
      explain();
      break;
    default:
      usage();
  }
} catch (error) {
  if (process.exitCode !== 2) process.exitCode = 2;
  console.error(error instanceof Error ? error.message : "Command failed.");
}
