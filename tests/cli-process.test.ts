import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { buildDecisionPacket } from "../src/decision-packet";
import { fingerprintEvidenceReportBody } from "../src/evidence-report";
import { evaluatePolicyProfile } from "../src/policy";
import { selectedSnapshot } from "../src/data";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

describe("offline CLI process gates", () => {
  it("preserves a late capped regression in text, JSON, Markdown and JUnit packet exits", async () => {
    const base = await inspectEvidenceBundle(
      {
        schemaVersion: 4,
        name: "Synthetic contract fixture",
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
            name: "Fixture",
            surfaceId: "document",
            headers: { "Content-Security-Policy": "default-src 'none'" }
          }
        ]
      },
      evidenceSourceContext
    );
    const assessment = base.surfaceAssessments[0];
    const finding = assessment?.findings[0];
    if (!assessment || !finding) throw new Error("Missing synthetic builder fixture");
    const browser = evaluatePolicyProfile(
      selectedSnapshot,
      {
        schemaVersion: 1,
        name: "Browser policy",
        baselines: [{ browser: "chrome", minimumVersion: "120" }],
        requiredControls: ["content-security-policy"],
        rules: { qualifications: "review", unknown: "fail", unsupported: "fail" },
        exceptions: []
      },
      "2026-07-24"
    );
    const packet = async (changed: boolean) => {
      const { reportFingerprint, ...body } = base;
      expect(reportFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      const surfaceAssessments = Array.from({ length: 9 }, (_, s) => {
        const findings = Array.from({ length: s === 8 ? 1 : 64 }, (_, i) => ({
          ...finding,
          controlId: `c${String(s * 64 + i).padStart(4, "0")}`,
          state: changed && s === 8 ? ("missing" as const) : ("observed" as const),
          summary: changed ? "New detail" : "Old detail"
        }));
        return {
          ...assessment,
          surfaceId: `s${String(s)}`,
          requiredControls: findings.map((item) => item.controlId),
          findings
        };
      });
      const next = { ...body, surfaceAssessments };
      return buildDecisionPacket(
        browser,
        { ...next, reportFingerprint: await fingerprintEvidenceReportBody(next) },
        "2026-07-24"
      );
    };
    const root = await mkdtemp(join(tmpdir(), "controlcurrent-cli-cap-"));
    try {
      const before = join(root, "before.json"),
        after = join(root, "after.json");
      await writeFile(before, JSON.stringify(await packet(false)));
      await writeFile(after, JSON.stringify(await packet(true)));
      for (const format of ["text", "json", "markdown", "junit"]) {
        const result = spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "tools/cli.ts",
            "compare-packets",
            before,
            after,
            "--as-of",
            "2026-07-24",
            "--fail-regression",
            "--format",
            format
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 }
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toBe("");
        if (format === "json")
          expect(JSON.parse(result.stdout)).toMatchObject({
            evidence: {
              summary: { regressions: 1, totalEvents: 513, emittedEvents: 512, truncated: true }
            }
          });
        if (format === "text") expect(result.stdout).toContain("1 regressions");
        if (format === "markdown") expect(result.stdout).toContain("Regressions: 1");
        if (format === "junit") {
          expect(result.stdout).toContain('failures="1"');
          expect(result.stdout).toContain("<failure");
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  it("keeps default exits compatible and explicitly fails incomparable reports", async () => {
    const report = async (environment: string, policy: string) =>
      inspectEvidenceBundle(
        {
          schemaVersion: 4,
          name: "CLI fixture",
          identity: { ...evidenceIdentity, subject: { ...evidenceIdentity.subject, environment } },
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
              name: "Fixture",
              surfaceId: "document",
              headers: { "Content-Security-Policy": policy }
            }
          ]
        },
        evidenceSourceContext
      );
    const root = await mkdtemp(join(tmpdir(), "controlcurrent-cli-"));
    try {
      const before = join(root, "before.json");
      const other = join(root, "other.json");
      const adverse = join(root, "adverse.json");
      await writeFile(before, JSON.stringify(await report("staging", "default-src 'none'")));
      await writeFile(other, JSON.stringify(await report("production", "default-src 'none'")));
      await writeFile(adverse, JSON.stringify(await report("staging", "")));
      const run = (...args: string[]) =>
        spawnSync(process.execPath, ["--import", "tsx", "tools/cli.ts", ...args], {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 10_000
        });
      expect(run("compare-reports", before, other).status).toBe(0);
      const strict = run("compare-reports", before, other, "--fail-incomparable", "--json");
      expect(strict.status).toBe(1);
      expect(JSON.parse(strict.stdout)).toMatchObject({ compatible: false });
      expect(run("compare-reports", before, adverse, "--fail-regression").status).toBe(1);
      expect(
        run("compare-reports", before, before, "--fail-incomparable", "--fail-regression").status
      ).toBe(0);
      expect(run("check", join(root, "absent.json")).status).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
