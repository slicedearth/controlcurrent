import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// XML parser already pinned by the build dependency graph; no new dependency is introduced.
import { parser } from "sax";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SECURITY_CONTROLS } from "../src/catalogue";
import { type EvidenceBundleReport, type EvidenceReportComparison } from "../src/contracts";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { compareEvidenceReports } from "../src/evidence-comparison";
import { fingerprintEvidenceReportBody } from "../src/evidence-report";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

async function report(
  options: {
    controls?: string[];
    application?: string;
    environment?: string;
    csp?: string;
    noResponse?: boolean;
    count?: number;
    removeControlsFrom?: number;
  } = {}
) {
  const surfaces = Array.from({ length: options.count ?? 1 }, (_, i) => ({
    id: i === 0 ? "document" : `document-${String(i)}`,
    role: "document",
    requiredEvidence: ["response"],
    requiredControls:
      i >= (options.removeControlsFrom ?? Infinity)
        ? []
        : (options.controls ?? ["content-security-policy"]),
    requiredComposites: []
  }));
  return inspectEvidenceBundle(
    {
      schemaVersion: 4,
      name: "Fixture <&> comparison",
      identity: {
        ...evidenceIdentity,
        subject: {
          ...evidenceIdentity.subject,
          applicationId: options.application ?? evidenceIdentity.subject.applicationId,
          environment: options.environment ?? evidenceIdentity.subject.environment
        }
      },
      surfaces,
      ...(options.noResponse
        ? {
            htmlDocuments: [
              { schemaVersion: 1, name: "Empty fixture", surfaceId: "document", html: "" }
            ]
          }
        : {
            responses: surfaces.slice(0, 16).map((surface) => ({
              schemaVersion: 1,
              name: "Response",
              surfaceId: surface.id,
              headers:
                options.csp === ""
                  ? {}
                  : { "Content-Security-Policy": options.csp ?? "default-src 'none'" }
            }))
          })
    },
    evidenceSourceContext
  );
}

let root: string;
let beforePath: string;
const scenarios = new Map<
  string,
  { path: string; comparison: EvidenceReportComparison; strict: number }
>();
function run(after: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "tools/cli.ts", "compare-reports", beforePath, after, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024
    }
  );
}
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "controlcurrent-report-cli-"));
  const before = await report();
  beforePath = join(root, "before.json");
  await writeFile(beforePath, JSON.stringify(before));
  const modelBody = { ...before, provenance: { ...before.provenance, analyserVersion: "5.0.0" } };
  const { reportFingerprint: oldFingerprint, ...body } = modelBody;
  expect(oldFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  const model = { ...body, reportFingerprint: await fingerprintEvidenceReportBody(body) };
  const inputs: [string, EvidenceBundleReport, number][] = [
    ["unchanged", before, 0],
    ["regression", await report({ csp: "" }), 1],
    ["removed requirement", await report({ controls: [] }), 1],
    ["not evaluated", await report({ noResponse: true }), 1],
    ["environment", await report({ environment: "production" }), 1],
    ["application", await report({ application: "other-app" }), 1],
    ["model", model, 1]
  ];
  for (const [name, after, strict] of inputs) {
    const path = join(root, `${name}.json`);
    await writeFile(path, JSON.stringify(after));
    scenarios.set(name, { path, comparison: await compareEvidenceReports(before, after), strict });
  }
}, 30_000);
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

function checkOutput(format: string, stdout: string, comparison: EvidenceReportComparison) {
  const summary = comparison.summary;
  if (format === "json") expect(JSON.parse(stdout)).toEqual(comparison);
  else if (format === "junit") {
    const xml = parser(true);
    const properties = new Map<string, string>();
    let suite: Record<string, unknown> = {};
    let cases = 0,
      failures = 0;
    xml.onerror = (error) => {
      throw error;
    };
    xml.onopentag = (tag) => {
      if (tag.name === "testsuite") suite = tag.attributes;
      if (tag.name === "testcase") cases++;
      if (tag.name === "failure") failures++;
      if (tag.name === "property") {
        const name = tag.attributes.name;
        const value = tag.attributes.value;
        if (typeof name !== "string" || typeof value !== "string")
          throw new Error("Invalid JUnit property");
        properties.set(name, value);
      }
    };
    xml.write(stdout).close();
    expect(suite.name).toBe("Fixture <&> comparison to Fixture <&> comparison");
    expect(Number(suite.tests)).toBe(cases);
    expect(Number(suite.failures)).toBe(failures);
    expect(properties.get("total-regressions")).toBe(String(summary.regressions));
    expect(properties.get("total-incomparable")).toBe(String(summary.incomparable));
    expect(properties.get("total-resolutions")).toBe(String(summary.resolutions));
    expect(properties.get("total-changed")).toBe(String(summary.changed));
    expect(properties.get("total-events")).toBe(String(summary.totalEvents));
    expect(properties.get("emitted-events")).toBe(String(summary.emittedEvents));
    expect(properties.get("truncated")).toBe(String(summary.truncated));
    expect(failures > 0).toBe(summary.regressions + summary.incomparable > 0);
    if (summary.truncated) expect(stdout).toContain("Omitted bounded events");
  } else {
    expect(stdout).toContain(
      `${String(summary.totalEvents)} total, ${String(summary.emittedEvents)} emitted, truncated: ${String(summary.truncated)}`
    );
    if (format === "markdown") {
      expect(stdout).toContain(`Regressions: ${String(summary.regressions)}`);
      expect(stdout).toContain(`Incomparable: ${String(summary.incomparable)}`);
      expect(stdout).toContain(`Resolutions: ${String(summary.resolutions)}`);
      expect(stdout).toContain(`Other changes: ${String(summary.changed)}`);
    } else {
      expect(stdout).toContain(`${String(summary.regressions)} regressions`);
      expect(stdout).toContain(`${String(summary.incomparable)} incomparable`);
      expect(stdout).toContain(`${String(summary.resolutions)} resolutions`);
      expect(stdout).toContain(`${String(summary.changed)} other changes`);
    }
  }
}

describe("reduced report CLI contract", () => {
  it("confirms the audit's genuine builder fixture before asserting the strict gate", () => {
    const comparison = scenarios.get("removed requirement")?.comparison;
    expect(comparison).toMatchObject({
      compatible: true,
      summary: { regressions: 0, incomparable: 2, changed: 1, totalEvents: 3 }
    });
    expect(comparison?.events.map((item) => [item.beforeState, item.afterState])).toContainEqual([
      "observed",
      "not_applicable"
    ]);
    expect(comparison?.events.map((item) => [item.beforeState, item.afterState])).toContainEqual([
      "observed",
      "absent"
    ]);
  });

  it.each(["text", "json", "markdown", "junit"])(
    "parses %s output and retains format-independent default and strict exits",
    (format) => {
      for (const [name, scenario] of scenarios) {
        for (const strict of [false, true]) {
          const result = run(
            scenario.path,
            "--format",
            format,
            ...(strict ? ["--fail-regression", "--fail-incomparable"] : [])
          );
          expect(result.error, name).toBeUndefined();
          expect(result.signal, name).toBeNull();
          expect(result.status, name).toBe(strict ? scenario.strict : 0);
          expect(result.stderr, name).toBe("");
          checkOutput(format, result.stdout, scenario.comparison);
        }
      }
    },
    60_000
  );

  it("keeps regression and incomparability independently opt-in and preserves --json", () => {
    const removal = scenarios.get("removed requirement");
    const regression = scenarios.get("regression");
    if (!removal || !regression) throw new Error("Missing process fixture");
    for (const [scenario, flag, status] of [
      [removal, "--fail-regression", 0],
      [removal, "--fail-incomparable", 1],
      [regression, "--fail-regression", 1],
      [regression, "--fail-incomparable", 0]
    ] as const) {
      const result = run(scenario.path, flag, "--json");
      expect(result.status).toBe(status);
      expect(result.stderr).toBe("");
      checkOutput("json", result.stdout, scenario.comparison);
    }
    const alias = run(beforePath, "--json", "--format", "json");
    expect(alias.status).toBe(0);
    expect(alias.stderr).toBe("");
    expect(JSON.parse(alias.stdout)).toMatchObject({ summary: { totalEvents: 0 } });
  }, 30_000);

  it.each([
    ["--format", "yaml"],
    ["--format"],
    ["--format", "--fail-incomparable"],
    ["--json", "--format", "text"],
    ["--format", "json", "--format", "junit"]
  ])("rejects invalid or conflicting options %j", (...args) => {
    const result = run(beforePath, ...args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/format/iu);
  });

  it.each(["incomparable", "mixed"])(
    "gates complete %s totals from bounded normal-builder output",
    async (kind) => {
      const controls = SECURITY_CONTROLS.map((item) => item.id);
      const before = await report({
        count: 32,
        controls,
        ...(kind === "mixed"
          ? {
              csp: "default-src 'nonce-AAAAAAAAAAAAAAAAAAAAAA==' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' 'strict-dynamic'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'"
            }
          : {})
      });
      const after = await report(
        kind === "mixed"
          ? { count: 32, controls, removeControlsFrom: 16, csp: "" }
          : { count: 32, controls: [] }
      );
      const comparison = await compareEvidenceReports(before, after);
      expect(comparison.compatible).toBe(true);
      expect(comparison.summary).toMatchObject({
        emittedEvents: 512,
        truncated: true
      });
      if (kind === "incomparable") {
        expect(comparison.summary.incomparable).toBeGreaterThan(512);
        expect(comparison.summary.regressions).toBe(0);
      } else {
        expect(comparison.summary.regressions).toBeGreaterThan(0);
        expect(comparison.summary.incomparable).toBeGreaterThan(0);
        const visibleAdverse = comparison.events.filter(
          (item) =>
            item.type.endsWith("_regressed") ||
            item.type === "surface_gap_added" ||
            item.type === "evidence_became_incomparable"
        ).length;
        expect(comparison.summary.regressions + comparison.summary.incomparable).toBeGreaterThan(
          visibleAdverse
        );
      }
      const previous = beforePath;
      beforePath = join(root, "bounded-before.json");
      const afterPath = join(root, "bounded-after.json");
      await writeFile(beforePath, JSON.stringify(before));
      await writeFile(afterPath, JSON.stringify(after));
      try {
        for (const format of ["text", "json", "markdown", "junit"]) {
          for (const strict of [false, true]) {
            const result = run(
              afterPath,
              "--format",
              format,
              ...(strict ? ["--fail-regression", "--fail-incomparable"] : [])
            );
            expect(result.error).toBeUndefined();
            expect(result.status).toBe(strict ? 1 : 0);
            expect(result.stderr).toBe("");
            checkOutput(format, result.stdout, comparison);
          }
        }
      } finally {
        beforePath = previous;
      }
    },
    30_000
  );
});
