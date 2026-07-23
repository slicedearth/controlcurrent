import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectHeaders } from "../src/assurance";
import { SECURITY_CONTROLS } from "../src/catalogue";
import { canonicalJson } from "../src/canonical";
import { selectedSnapshot } from "../src/data";
import { browserIdSchema, policyProfileSchema } from "../src/contracts";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { compareEvidenceReports } from "../src/evidence-comparison";
import { findMinimumBaselines } from "../src/minimums";
import { evaluatePolicyProfile } from "../src/policy";

const MAX_INPUT_BYTES = 64 * 1_024;

function usage(): never {
  console.error(`Usage:
  npm run cli -- check <profile.json> [--as-of YYYY-MM-DD] [--strict-review] [--json]
  npm run cli -- minimum <control-id,...> [--browsers chrome,edge,...] [--allow-qualified] [--json]
  npm run cli -- explain <control-id> [--json]
  npm run cli -- inspect-headers <snapshot.json> [--fail-missing] [--json]
  npm run cli -- inspect-bundle <bundle.json> [--fail-missing] [--strict-composites] [--json]
  npm run cli -- compare-reports <before.json> <after.json> [--fail-regression] [--json]`);
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

async function readBoundedJson(path: string, maximumBytes = MAX_INPUT_BYTES): Promise<unknown> {
  const contents = await readFile(resolve(path), "utf8");
  if (Buffer.byteLength(contents, "utf8") > maximumBytes) {
    throw new Error(`Input exceeds ${String(maximumBytes)} bytes.`);
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

async function inspectHeaderSnapshot(): Promise<void> {
  const path = process.argv[3] ?? usage();
  const report = inspectHeaders(await readBoundedJson(path));
  const failed =
    report.summary.invalid > 0 ||
    report.summary.inconclusive > 0 ||
    (process.argv.includes("--fail-missing") &&
      report.summary.missing + report.summary.reportOnly > 0);

  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(report));
  } else {
    console.log(`${report.name}: ${failed ? "review required" : "inspection complete"}`);
    console.log(
      `${String(report.summary.observed)} observed, ${String(report.summary.missing)} not observed, ${String(report.summary.invalid)} invalid, ${String(report.summary.reportOnly)} report only, ${String(report.summary.inconclusive)} inconclusive, ${String(report.summary.notEvaluated)} not evaluated`
    );
    for (const result of report.findings.filter((finding) => finding.state !== "observed")) {
      console.log(`- ${result.state.toUpperCase()} ${result.controlId}: ${result.summary}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

async function inspectBundle(): Promise<void> {
  const path = process.argv[3] ?? usage();
  const report = await inspectEvidenceBundle(await readBoundedJson(path, 2 * 1_024 * 1_024));
  const strictComposites = process.argv.includes("--strict-composites");
  const failed =
    report.summary.invalid > 0 ||
    report.summary.inconclusive > 0 ||
    (process.argv.includes("--fail-missing") &&
      report.summary.missing + report.summary.reportOnly > 0) ||
    (strictComposites &&
      report.composites.some((composite) => ["review", "gap"].includes(composite.state)));

  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(report));
  } else {
    console.log(`${report.name}: ${failed ? "review required" : "inspection complete"}`);
    console.log(
      `${String(report.coverage.responses)} responses, ${String(report.coverage.htmlDocuments)} HTML documents, ${String(report.coverage.requests)} requests, ${String(report.coverage.webauthn)} WebAuthn configurations`
    );
    console.log(
      `${String(report.summary.observed)} observed, ${String(report.summary.missing)} not observed, ${String(report.summary.invalid)} invalid, ${String(report.summary.reportOnly)} report only, ${String(report.summary.inconclusive)} inconclusive, ${String(report.summary.notEvaluated)} not evaluated`
    );
    for (const composite of report.composites) {
      console.log(`- ${composite.state.toUpperCase()} ${composite.name}: ${composite.summary}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

async function compareReports(): Promise<void> {
  const beforePath = process.argv[3] ?? usage();
  const afterPath = process.argv[4] ?? usage();
  const comparison = await compareEvidenceReports(
    await readBoundedJson(beforePath, 1_024 * 1_024),
    await readBoundedJson(afterPath, 1_024 * 1_024)
  );
  const failed = process.argv.includes("--fail-regression") && comparison.summary.regressions > 0;
  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(comparison));
  } else {
    console.log(
      `${comparison.beforeName} to ${comparison.afterName}: ${String(comparison.summary.regressions)} regressions, ${String(comparison.summary.resolutions)} resolutions, ${String(comparison.summary.changed)} other changes, ${String(comparison.summary.incomparable)} incomparable`
    );
    for (const event of comparison.events) {
      console.log(`- ${event.type.toUpperCase()} ${event.key}: ${event.summary}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
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
    case "inspect-headers":
      await inspectHeaderSnapshot();
      break;
    case "inspect-bundle":
      await inspectBundle();
      break;
    case "compare-reports":
      await compareReports();
      break;
    default:
      usage();
  }
} catch (error) {
  if (process.exitCode !== 2) process.exitCode = 2;
  console.error(error instanceof Error ? error.message : "Command failed.");
}
