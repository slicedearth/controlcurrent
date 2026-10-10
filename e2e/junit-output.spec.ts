import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderDecisionPacketComparisonJunit,
  renderEvidenceEvaluationJunit,
  renderPolicyDriftJunit,
  renderPolicyEvaluationJunit
} from "../src/ci-output";
import {
  evidencePolicyProfileSchema,
  evidenceReportComparisonSchema,
  selectedSnapshotSchema
} from "../src/contracts";
import { buildDecisionPacket, compareDecisionPackets } from "../src/decision-packet";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { evaluateEvidencePolicy } from "../src/evidence-policy";
import { evaluatePolicyProfile } from "../src/policy";
import { comparePolicyEvaluations } from "../src/policy-comparison";
import { evidenceIdentity, evidenceSourceContext } from "../tests/helpers";

const asOf = "2026-07-24";
const selectedSnapshot = selectedSnapshotSchema.parse(
  JSON.parse(readFileSync(new URL("../data/selected-bcd.json", import.meta.url), "utf8")) as unknown
);

async function report(name: string, csp = "default-src 'none'") {
  return inspectEvidenceBundle(
    {
      schemaVersion: 4,
      name,
      identity: evidenceIdentity,
      surfaces: [
        {
          id: "document",
          role: "document",
          requiredEvidence: ["response"],
          requiredControls: ["content-security-policy"],
          requiredComposites: []
        }
      ],
      responses: [
        {
          schemaVersion: 1,
          name: "Response",
          surfaceId: "document",
          headers: csp ? { "Content-Security-Policy": csp } : {}
        }
      ]
    },
    evidenceSourceContext
  );
}

function cli(args: string[], status: number): string {
  const environment: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  delete environment.FORCE_COLOR;
  const result = spawnSync(process.execPath, ["--import", "tsx", "tools/cli.ts", ...args], {
    cwd: process.cwd(),
    env: environment,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stderr.toString("utf8")).toBe("");
  expect(result.status).toBe(status);
  // Validate the emitted bytes before passing the decoded document to the XML parser.
  return new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
}

async function parseXml(page: Page, xml: string) {
  return page.evaluate((text) => {
    const document = new DOMParser().parseFromString(text, "application/xml");
    return {
      error: document.querySelector("parsererror")?.textContent ?? null,
      name: document.documentElement.getAttribute("name"),
      tests: Number(document.documentElement.getAttribute("tests")),
      failures: Number(document.documentElement.getAttribute("failures")),
      cases: document.querySelectorAll("testcase").length,
      failureElements: document.querySelectorAll("failure").length,
      properties: Object.fromEntries(
        Array.from(
          document.querySelectorAll("property"),
          (item) => [item.getAttribute("name") ?? "", item.getAttribute("value")] as const
        )
      ),
      values: Array.from(document.querySelectorAll("*"), (element) =>
        Array.from(element.attributes, (attribute) => attribute.value)
      ).flat()
    };
  }, xml);
}

test("XML oracle rejects the original illegal characters and accepts legal Unicode", async ({
  page
}) => {
  // sax's strict mode accepts these literals; it is not an oracle for XML 1.0 characters.
  for (const character of ["\uFFFE", "\uFFFF"]) {
    const parsed = await parseXml(page, `<testsuite name="Fixture${character}"/>`);
    expect(parsed.error).not.toBeNull();
  }
  expect((await parseXml(page, '<testsuite name="café 日本語 😀 𐀀"/>')).error).toBeNull();
});

for (const [label, input, expected] of [
  ["U+FFFE", "\uFFFE", " "],
  ["U+FFFF", "\uFFFF", " "],
  [
    "legal Unicode",
    "café 日本語 e\u0301 😀 \u{10000} \u{1FFFE} \u{10FFFF}",
    "café 日本語 e\u0301 😀 \u{10000} \u{1FFFE} \u{10FFFF}"
  ]
] as const) {
  test(`exports ${label} in genuine report CLI JUnit without changing gates or totals`, async ({
    page
  }) => {
    const name = `Fixture${input} <&> "' suffix`;
    const expectedName = `Fixture${expected} <&> "' suffix`;
    const before = await report(name);
    expect(before.name).toBe(name);
    const root = await mkdtemp(join(tmpdir(), "controlcurrent-junit-"));
    try {
      const beforePath = join(root, "before.json");
      const afterPath = join(root, "after.json");
      await writeFile(beforePath, JSON.stringify(before));
      for (const changed of [false, true]) {
        await writeFile(afterPath, JSON.stringify(changed ? await report(name, "") : before));
        const args = [
          "compare-reports",
          beforePath,
          afterPath,
          "--fail-regression",
          "--fail-incomparable"
        ];
        const status = changed ? 1 : 0;
        const comparison = evidenceReportComparisonSchema.parse(
          JSON.parse(cli([...args, "--format", "json"], status)) as unknown
        );
        expect(comparison.beforeName).toBe(name);
        expect(comparison.afterName).toBe(name);
        const xml = cli([...args, "--format", "junit"], status);
        const parsed = await parseXml(page, xml);
        expect(parsed.error).toBeNull();
        expect(parsed.name).toBe(`${expectedName} to ${expectedName}`);
        expect(parsed.tests).toBe(parsed.cases);
        expect(parsed.failures).toBe(parsed.failureElements);
        expect(parsed.failures).toBe(comparison.summary.regressions);
        expect(parsed.properties["total-events"]).toBe(String(comparison.summary.totalEvents));
        expect(parsed.properties["emitted-events"]).toBe(String(comparison.summary.emittedEvents));
        expect(parsed.properties["total-regressions"]).toBe(String(comparison.summary.regressions));
        expect(parsed.properties["total-incomparable"]).toBe(
          String(comparison.summary.incomparable)
        );
        expect(parsed.properties.truncated).toBe(String(comparison.summary.truncated));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("shared JUnit consumers encode names, case attributes and explanations as valid XML", async ({
  page
}) => {
  const name = "Fixture\uFFFE\uFFFF café 😀 <&> \"' suffix";
  const expectedName = "Fixture   café 😀 <&> \"' suffix";
  const policy = (controls: string[]) =>
    evaluatePolicyProfile(
      selectedSnapshot,
      {
        schemaVersion: 1,
        name,
        baselines: [{ browser: "chrome", minimumVersion: "120" }],
        requiredControls: controls,
        rules: { qualifications: "review", unknown: "fail", unsupported: "fail" },
        exceptions: []
      },
      asOf
    );
  const before = policy(["content-security-policy"]);
  const after = policy(["content-security-policy", "csp-nonces"]);
  const evidence = await report(name);
  const evidenceProfile = evidencePolicyProfileSchema.parse(
    JSON.parse(
      readFileSync(new URL("../examples/evidence-policy.json", import.meta.url), "utf8")
    ) as unknown
  );
  const evaluation = await evaluateEvidencePolicy(evidence, { ...evidenceProfile, name }, asOf);
  const packets = await compareDecisionPackets(
    await buildDecisionPacket(before, evidence, asOf),
    await buildDecisionPacket(after, evidence, asOf),
    asOf
  );
  expect(packets.browserPolicy.events.length).toBeGreaterThan(0);
  // Exercise accepted descriptive renderer fields; no reduced report fingerprint is fabricated.
  const outputs = [
    renderPolicyEvaluationJunit({
      ...after,
      findings: after.findings.map((finding) => ({ ...finding, explanation: name }))
    }),
    renderEvidenceEvaluationJunit(evaluation),
    renderPolicyDriftJunit(comparePolicyEvaluations(before, after, asOf)),
    renderDecisionPacketComparisonJunit({
      ...packets,
      browserPolicy: {
        ...packets.browserPolicy,
        events: packets.browserPolicy.events.map((item) => ({ ...item, summary: name }))
      }
    })
  ];
  for (const xml of outputs) {
    const parsed = await parseXml(page, xml);
    expect(parsed.error).toBeNull();
    expect(parsed.values.some((value) => value.includes(expectedName))).toBe(true);
    expect(parsed.tests).toBe(parsed.cases);
    expect(parsed.failures).toBe(parsed.failureElements);
  }
});
