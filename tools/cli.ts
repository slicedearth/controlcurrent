import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { inspectHeaders } from "../src/assurance";
import { SECURITY_CONTROLS } from "../src/catalogue";
import { canonicalJson } from "../src/canonical";
import {
  MAX_COLLECTOR_MANIFEST_BYTES,
  collectEvidenceBundle,
  collectorManifestSchema
} from "../src/collector";
import { selectedSnapshot } from "../src/data";
import {
  attestedEvidenceEvaluationSchema,
  browserIdSchema,
  evidencePolicyProfileSchema,
  policyProfileSchema
} from "../src/contracts";
import {
  createEvidenceAttestationStatement,
  verifyEvidenceAttestation
} from "../src/evidence-attestation";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { compareEvidenceReports } from "../src/evidence-comparison";
import { evaluateEvidencePolicy } from "../src/evidence-policy";
import { findMinimumBaselines } from "../src/minimums";
import { evaluatePolicyProfile } from "../src/policy";
import { reduceScopeInventory } from "../src/scope-inventory";
import { FixedOriginCollectorTransport } from "./collector-network";

const MAX_INPUT_BYTES = 64 * 1_024;

function usage(): never {
  console.error(`Usage:
  npm run cli -- check <profile.json> [--as-of YYYY-MM-DD] [--strict-review] [--json]
  npm run cli -- minimum <control-id,...> [--browsers chrome,edge,...] [--allow-qualified] [--json]
  npm run cli -- explain <control-id> [--json]
  npm run cli -- inspect-headers <snapshot.json> [--fail-missing] [--json]
  npm run cli -- inspect-bundle <bundle.json> [--fail-missing] [--strict-composites] [--json]
  npm run cli -- compare-reports <before.json> <after.json> [--fail-regression] [--json]
  npm run cli -- reduce-scope-inventory <inventory.json> [--json]
  npm run cli -- collect-evidence <manifest.json> --output <private-path.json> --confirm-authorised-target [--allow-loopback]
  npm run cli -- create-attestation-statement <report.json>
  npm run cli -- check-evidence <policy.json> <report.json> [--as-of YYYY-MM-DD] [--strict-review] [--json]
  npm run cli -- verify-evidence <policy.json> <report.json> <sigstore-bundle.json> [--as-of YYYY-MM-DD] [--strict-review] [--json]`);
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

function outputIsPrivate(path: string): boolean {
  const output = resolve(path);
  const project = resolve(process.cwd());
  const projectRelative = relative(project, output);
  if (projectRelative.startsWith(`..${sep}`) || projectRelative === "..") return true;
  return (
    projectRelative.startsWith(`private-data${sep}`) ||
    projectRelative.startsWith(`.private-data${sep}`)
  );
}

async function writePrivateJson(path: string, value: unknown): Promise<string> {
  const output = resolve(path);
  if (!outputIsPrivate(output)) {
    throw new Error(
      "Collector output must be outside the repository or under private-data/ or .private-data/."
    );
  }
  try {
    await lstat(output);
    throw new Error("Collector output already exists; choose a new path.");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
  }
  const directory = dirname(output);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${output}.${String(process.pid)}.tmp`;
  await writeFile(temporary, canonicalJson(value), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, output);
  return output;
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
  const report = await inspectEvidenceBundle(await readBoundedJson(path, 2 * 1_024 * 1_024), {
    bcdVersion: selectedSnapshot.bcdVersion,
    bcdTimestamp: selectedSnapshot.bcdTimestamp,
    webFeaturesVersion: selectedSnapshot.webFeaturesVersion,
    selectedSchemaFingerprint: selectedSnapshot.schemaFingerprint
  });
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
      `Subject: ${report.identity.subject.applicationId} · ${report.identity.subject.environment} · revision ${report.identity.subject.revision}${report.identity.subject.buildId ? ` · build ${report.identity.subject.buildId}` : ""}`
    );
    console.log(
      `Capture: ${report.identity.capture.startedAt} to ${report.identity.capture.completedAt} · ${report.identity.capture.producer.kind} ${report.identity.capture.producer.id}`
    );
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

async function checkEvidence(): Promise<void> {
  const profilePath = process.argv[3] ?? usage();
  const reportPath = process.argv[4] ?? usage();
  const asOf = optionValue("--as-of") ?? utcDate();
  const profile = evidencePolicyProfileSchema.parse(await readBoundedJson(profilePath));
  const evaluation = await evaluateEvidencePolicy(
    await readBoundedJson(reportPath, 1_024 * 1_024),
    profile,
    asOf
  );
  const strictReview = process.argv.includes("--strict-review");
  const failed = evaluation.summary.fail > 0 || (strictReview && evaluation.summary.review > 0);
  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(evaluation));
  } else {
    console.log(
      `${profile.name}: ${failed ? "evidence policy failed" : "evidence policy satisfied"}`
    );
    console.log(
      `Report: ${evaluation.reportIdentity.subject.applicationId} · ${evaluation.reportIdentity.subject.environment} · revision ${evaluation.reportIdentity.subject.revision} · ${evaluation.reportProvenance.analyserVersion} analyser · evaluated ${evaluation.evaluatedAsOf}`
    );
    console.log(
      `${String(evaluation.summary.pass)} pass, ${String(evaluation.summary.review)} review, ${String(evaluation.summary.fail)} fail`
    );
    for (const finding of evaluation.findings.filter((item) => item.decision !== "pass")) {
      console.log(
        `- ${finding.decision.toUpperCase()} ${finding.surfaceId ?? "report"} ${finding.targetKind}:${finding.targetId}: ${finding.outcome}`
      );
    }
  }
  process.exitCode = failed ? 1 : 0;
}

async function createAttestationStatement(): Promise<void> {
  const reportPath = process.argv[3] ?? usage();
  const statement = await createEvidenceAttestationStatement(
    await readBoundedJson(reportPath, 1_024 * 1_024)
  );
  process.stdout.write(canonicalJson(statement));
  process.exitCode = 0;
}

async function reduceInventory(): Promise<void> {
  const inventoryPath = process.argv[3] ?? usage();
  const inventory = await reduceScopeInventory(await readBoundedJson(inventoryPath, 64 * 1_024));
  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(inventory));
  } else if (inventory.state === "present") {
    console.log(`${inventory.name}: ${inventory.fingerprint}`);
    console.log(
      `${inventory.kind} · ${inventory.completeness} · ${String(inventory.includedEntries)} included · ${String(inventory.excludedEntries)} excluded`
    );
  }
  process.exitCode = 0;
}

async function collectEvidence(): Promise<void> {
  const manifestPath = process.argv[3] ?? usage();
  const outputPath = optionValue("--output") ?? usage();
  if (!process.argv.includes("--confirm-authorised-target")) {
    throw new Error(
      "Collection requires --confirm-authorised-target to confirm ownership or explicit authorisation."
    );
  }
  const manifest = collectorManifestSchema.parse(
    await readBoundedJson(manifestPath, MAX_COLLECTOR_MANIFEST_BYTES)
  );
  const bundle = await collectEvidenceBundle(
    manifest,
    new FixedOriginCollectorTransport(process.argv.includes("--allow-loopback"))
  );
  const output = await writePrivateJson(outputPath, bundle);
  console.log(`Collected ${String(bundle.responses.length)} bounded response observations.`);
  console.log(`Wrote private evidence bundle: ${output}`);
  console.log(
    "No JavaScript, form submission, cookies, credentials, or cross-origin redirect followed."
  );
  process.exitCode = 0;
}

async function verifyEvidence(): Promise<void> {
  const profilePath = process.argv[3] ?? usage();
  const reportPath = process.argv[4] ?? usage();
  const bundlePath = process.argv[5] ?? usage();
  const asOf = optionValue("--as-of") ?? utcDate();
  const profile = evidencePolicyProfileSchema.parse(await readBoundedJson(profilePath));
  const report = await readBoundedJson(reportPath, 1_024 * 1_024);
  const attestation = await verifyEvidenceAttestation(
    report,
    await readBoundedJson(bundlePath, 512 * 1_024),
    profile.attestation
  );
  const evidence = await evaluateEvidencePolicy(report, profile, asOf, attestation);
  const result = attestedEvidenceEvaluationSchema.parse({
    schemaVersion: 1,
    attestation,
    evidence
  });
  const strictReview = process.argv.includes("--strict-review");
  const failed =
    result.evidence.summary.fail > 0 || (strictReview && result.evidence.summary.review > 0);
  if (process.argv.includes("--json")) {
    process.stdout.write(canonicalJson(result));
  } else {
    console.log(
      `${profile.name}: ${failed ? "attested evidence policy failed" : "attested evidence policy satisfied"}`
    );
    console.log(`Attestation: ${attestation.state} · ${attestation.explanation}`);
    if (attestation.signer) {
      console.log(`Signer: ${attestation.signer.identity} · issuer ${attestation.signer.issuer}`);
    }
    console.log(
      `${String(evidence.summary.pass)} pass, ${String(evidence.summary.review)} review, ${String(evidence.summary.fail)} fail`
    );
    for (const finding of evidence.findings.filter((item) => item.decision !== "pass")) {
      console.log(
        `- ${finding.decision.toUpperCase()} ${finding.surfaceId ?? "report"} ${finding.targetKind}:${finding.targetId}: ${finding.outcome}`
      );
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
    case "reduce-scope-inventory":
      await reduceInventory();
      break;
    case "collect-evidence":
      await collectEvidence();
      break;
    case "create-attestation-statement":
      await createAttestationStatement();
      break;
    case "check-evidence":
      await checkEvidence();
      break;
    case "verify-evidence":
      await verifyEvidence();
      break;
    default:
      usage();
  }
} catch (error) {
  if (process.exitCode !== 2) process.exitCode = 2;
  console.error(error instanceof Error ? error.message : "Command failed.");
}
