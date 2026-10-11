import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inspectHeaders, scriptCspCandidate } from "../src/assurance";
import { SECURITY_CONTROLS } from "../src/catalogue";
import {
  evidencePolicyProfileSchema,
  evidencePolicyEvaluationSchema,
  type EvidencePolicyProfile
} from "../src/contracts";
import { selectedSnapshot } from "../src/data";
import { buildDecisionPacket, compareDecisionPackets } from "../src/decision-packet";
import { evaluateFeaturePopulation, evaluateProfile } from "../src/evaluate";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { evaluateEvidencePolicy } from "../src/evidence-policy";
import { compareEvidencePolicyProfiles } from "../src/evidence-policy-comparison";
import { EVIDENCE_ANALYSER_VERSION } from "../src/evidence-model";
import { fingerprintEvidenceReportBody } from "../src/evidence-report";
import { compareEvidenceReports } from "../src/evidence-comparison";
import {
  renderDecisionPacketComparisonJunit,
  renderDecisionPacketComparisonMarkdown
} from "../src/ci-output";
import { guardedStorage, OperationGeneration } from "../src/local-state";
import { loadProfile } from "../src/profile-storage";
import { loadEvaluation } from "../src/evaluation-storage";
import { evaluatePolicyProfile } from "../src/policy";
import { cacheState, sanitiseCollectorHeaders } from "../tools/collector-network";
import { evidenceIdentity, evidenceSourceContext, feature, snapshot } from "./helpers";

const policy = (): EvidencePolicyProfile =>
  evidencePolicyProfileSchema.parse(
    JSON.parse(
      readFileSync(new URL("../examples/evidence-policy.json", import.meta.url), "utf8")
    ) as unknown
  );
const browserPolicy = evaluatePolicyProfile(
  selectedSnapshot,
  {
    schemaVersion: 1,
    name: "Synthetic browser policy",
    baselines: [{ browser: "chrome", minimumVersion: "120" }],
    requiredControls: ["content-security-policy"],
    rules: { qualifications: "review", unknown: "fail", unsupported: "fail" },
    exceptions: []
  },
  "2026-07-24"
);
async function evidence() {
  return inspectEvidenceBundle(
    {
      schemaVersion: 4,
      name: "Synthetic audit fixture",
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
          name: "Fixture response",
          surfaceId: "document",
          headers: { "Content-Security-Policy": "default-src 'none'" }
        }
      ]
    },
    evidenceSourceContext
  );
}

describe("reviewed minimum population", () => {
  it.each(["safari", "safari_ios"] as const)(
    "does not promise Partitioned support across the %s gap",
    (browser) => {
      const result = evaluateProfile(selectedSnapshot, {
        schemaVersion: 1,
        name: "Cookie baseline",
        baselines: [{ browser, minimumVersion: "18.4" }]
      });
      expect(result.results["partitioned-cookies"]?.[0]?.outcome).not.toBe("available_unqualified");
      expect(
        result.results["partitioned-cookies"]?.[0]?.featureEvaluations
          .flatMap((item) => item.qualifications)
          .join(" ")
      ).toContain("18.5");
    }
  );
  it("retains removed, qualified, unknown and future boundaries", () => {
    const support = feature("x", {
      chrome: [{ version_added: "100", version_removed: "110" }, { version_added: "120" }]
    });
    const data = snapshot({ x: support });
    data.browsers.chrome.releases.splice(1, 0, {
      version: "110",
      status: "retired",
      releaseDate: "2023-01-01"
    });
    expect(
      evaluateFeaturePopulation(support, { browser: "chrome", minimumVersion: "100" }, data).outcome
    ).toBe("removed");
    expect(
      evaluateFeaturePopulation(support, { browser: "chrome", minimumVersion: "120" }, data).outcome
    ).toBe("available_unqualified");
    expect(
      evaluateFeaturePopulation(support, { browser: "chrome", minimumVersion: "121" }, data).outcome
    ).toBe("unknown");
    for (const statement of [
      { version_added: null },
      { version_added: "100", partial_implementation: true as const },
      { version_added: "100", version_last: "110" }
    ]) {
      const selected = feature("x", { chrome: [statement] });
      expect(
        evaluateFeaturePopulation(selected, { browser: "chrome", minimumVersion: "100" }, data)
          .outcome
      ).not.toBe("available_unqualified");
    }
    data.browsers.chrome.releases = [];
    expect(
      evaluateFeaturePopulation(support, { browser: "chrome", minimumVersion: "100" }, data).outcome
    ).toBe("unknown");
  });
  it("evaluates Firefox PRF and normal monotonic controls through reviewed releases", () => {
    const result = evaluateProfile(selectedSnapshot, {
      schemaVersion: 1,
      name: "Firefox minimum",
      baselines: [{ browser: "firefox", minimumVersion: "128" }]
    });
    expect(result.results["webauthn-prf"]?.[0]?.outcome).not.toBe("available_unqualified");
    expect(result.results["content-security-policy"]?.[0]?.outcome).toBe("available_unqualified");
  });
});

describe("script policy declaration recipe", () => {
  const nonce = "'nonce-AAAAAAAAAAAAAAAAAAAAAA=='";
  const candidate = (value: string | string[]) =>
    scriptCspCandidate({
      schemaVersion: 1,
      name: "CSP fixture",
      headers: { "Content-Security-Policy": value }
    });
  it.each([
    `script-src * 'unsafe-inline'; style-src ${nonce}; base-uri *`,
    `script-src ${nonce}; base-uri *`,
    `script-src-elem ${nonce}; script-src *; base-uri 'none'`,
    `style-src ${nonce}; base-uri 'self'`
  ])("rejects a permissive script declaration without needing HTML: %s", (value) =>
    expect(candidate(value)).toBe("gap")
  );
  it("preserves valid fallback, hashes and CSP3 backwards compatibility", () => {
    expect(candidate(`default-src ${nonce}; base-uri 'none'`)).toBe("satisfied");
    expect(
      candidate(
        `script-src ${nonce} 'strict-dynamic' https: 'self' 'unsafe-inline'; base-uri 'self'`
      )
    ).toBe("satisfied");
    expect(
      candidate("script-src 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; base-uri 'none'")
    ).toBe("satisfied");
    expect(candidate([`script-src ${nonce}; base-uri 'none'`, "default-src 'none'"])).toBe(
      "review"
    );
    expect(candidate("script-src 'nonce-short'; base-uri 'none'")).toBe("gap");
  });
  it.each([undefined, "<main>No inline elements</main>"])(
    "does not accept the adverse bundle with markup %s",
    async (html) => {
      const report = await inspectEvidenceBundle(
        {
          schemaVersion: 4,
          name: "Adverse policy",
          identity: evidenceIdentity,
          surfaces: [
            {
              id: "document",
              role: "document",
              requiredEvidence: ["response"],
              requiredControls: ["content-security-policy"],
              requiredComposites: ["strict-csp-candidate"]
            }
          ],
          responses: [
            {
              schemaVersion: 1,
              name: "Response",
              surfaceId: "document",
              headers: {
                "Content-Security-Policy": `script-src * 'unsafe-inline'; style-src ${nonce}; base-uri *`
              }
            }
          ],
          ...(html
            ? { htmlDocuments: [{ schemaVersion: 1, name: "Markup", surfaceId: "document", html }] }
            : {})
        },
        evidenceSourceContext
      );
      expect(report.composites.find((item) => item.id === "strict-csp-candidate")?.state).toBe(
        "gap"
      );
    }
  );
});

describe("faithful bounded collector reduction", () => {
  it("rejects a ninth cookie regardless of its position", () => {
    const values = [
      ...Array.from({ length: 8 }, () => "a=secret; Secure; HttpOnly"),
      "adverse=secret"
    ];
    for (let i = 0; i < values.length; i++) {
      expect(() =>
        sanitiseCollectorHeaders({ "set-cookie": [...values.slice(i), ...values.slice(0, i)] })
      ).toThrow(/eight/u);
    }
  });
  it.each(["__Host-Http-", "__Http-", "__Host-", "__Secure-"])(
    "preserves %s validity but not names or values",
    (prefix) => {
      for (const attributes of [
        "Path=/; Secure; HttpOnly",
        "Path=/",
        "Path=/; Secure; HttpOnly; Domain=example.invalid"
      ]) {
        const direct = `${prefix}private-name=private-value; ${attributes}`;
        const reduced = sanitiseCollectorHeaders({ "set-cookie": direct });
        const input = (headers: Record<string, string | string[]>) => ({
          schemaVersion: 1,
          name: "Cookies",
          headers
        });
        const outcome = (headers: Record<string, string | string[]>) =>
          inspectHeaders(input(headers)).findings.find(
            (item) => item.controlId === "secure-cookie-prefixes"
          )?.state;
        expect(outcome(reduced)).toBe(outcome({ "set-cookie": direct }));
        expect(JSON.stringify(reduced)).not.toMatch(/private-name|private-value/u);
      }
    }
  );
  it.each([
    ["HIT", "hit"],
    ["cache HIT, age=3", "hit"],
    ["(mIsS)", "miss"],
    ["HIT-MISS", "hit"],
    ["whither", "unknown"],
    ["dismiss", "unknown"]
  ] as const)("parses cache token %s", (value, expected) =>
    expect(cacheState(200, { "x-cache": value })).toBe(expected)
  );
});

describe("policy drift and exception ownership", () => {
  it("detects removed requirements and every replaced trust boundary", () => {
    const before = policy();
    expect(compareEvidencePolicyProfiles(before, before)).toEqual([]);
    for (const field of ["requiredControls", "requiredComposites", "requiredEvidence"] as const) {
      const after = structuredClone(before);
      const surface = after.surfaces[0];
      if (!surface) throw new Error("Missing fixture surface");
      surface[field] = [];
      expect(
        compareEvidencePolicyProfiles(before, after).some((event) => event.type === "regression")
      ).toBe(true);
    }
    for (const field of ["attestation", "identity", "scopeInventory"] as const) {
      const after = structuredClone(before);
      if (field === "attestation") after.attestation.required = !before.attestation.required;
      if (field === "identity") after.identity.maxAgeDays++;
      if (field === "scopeInventory") after.scopeInventory.maxExcludedEntries++;
      expect(compareEvidencePolicyProfiles(before, after)).toContainEqual(
        expect.objectContaining({ key: `policy:${field}`, type: "regression" })
      );
    }
    const after = structuredClone(before);
    after.rules.missing = "review";
    expect(compareEvidencePolicyProfiles(before, after)).toContainEqual(
      expect.objectContaining({ key: "policy:rules:missing", type: "regression" })
    );
  });
  it("rejects undeclared targets, duplicate outcomes and overlapping expired/active scopes", () => {
    const before = policy();
    const exception = {
      surfaceId: "document",
      targetKind: "control" as const,
      targetId: "content-security-policy",
      outcomes: ["missing" as const],
      reason: "Reviewed temporary exception",
      expiresOn: "2026-08-01"
    };
    for (const exceptions of [
      [{ ...exception, targetId: "invented" }],
      [{ ...exception, surfaceId: "missing" }],
      [{ ...exception, outcomes: ["missing", "missing"] }],
      [exception, { ...exception, expiresOn: "2025-01-01" }],
      [{ ...exception, expiresOn: "2025-01-01" }, exception]
    ])
      expect(evidencePolicyProfileSchema.safeParse({ ...before, exceptions }).success).toBe(false);
    expect(
      evidencePolicyProfileSchema.safeParse({
        ...before,
        exceptions: [exception, { ...exception, outcomes: ["invalid"] }]
      }).success
    ).toBe(true);
  });
  it("gates policy weakening independently of unchanged browser facts", async () => {
    const report = await evidence();
    const before = policy();
    before.expectedAnalyserVersion = EVIDENCE_ANALYSER_VERSION;
    before.expectedBcdVersion = "1.0.0";
    const after = structuredClone(before);
    const surface = after.surfaces[0];
    if (!surface) throw new Error("Missing fixture surface");
    surface.requiredControls = [];
    const comparison = await compareDecisionPackets(
      await buildDecisionPacket(
        browserPolicy,
        await evaluateEvidencePolicy(report, before, "2026-07-24"),
        "2026-07-24"
      ),
      await buildDecisionPacket(
        browserPolicy,
        await evaluateEvidencePolicy(report, after, "2026-07-24"),
        "2026-07-24"
      ),
      "2026-07-24"
    );
    expect(comparison.evidence.summary.regressions).toBeGreaterThan(0);
    expect(comparison.browserPolicy.summary.regressions).toBe(0);
  });
});

describe("display-independent public builder contracts", () => {
  it.each([511, 512, 513])(
    "preserves wrapped and unwrapped reduced-report totals at %s",
    async (count) => {
      // Public report-builder contract fixture: present assessments, not an invented missing-surface shortcut.
      const base = await evidence();
      const original = base.surfaceAssessments[0];
      if (!original) throw new Error("Missing fixture assessment");
      const template = original.findings[0];
      if (!template) throw new Error("Missing fixture finding");
      const make = async (adverse: boolean) => {
        const { reportFingerprint, ...body } = base;
        expect(reportFingerprint).toMatch(/^[a-f0-9]{64}$/u);
        const surfaceAssessments = Array.from({ length: Math.ceil(count / 64) }, (_, surface) => {
          const findings = Array.from(
            { length: Math.min(64, count - surface * 64) },
            (_, offset) => {
              const i = surface * 64 + offset;
              return {
                ...template,
                controlId: `control-${String(i).padStart(4, "0")}`,
                state: adverse && i === count - 1 ? ("missing" as const) : ("observed" as const),
                summary: adverse ? "New reduced detail" : "Prior reduced detail"
              };
            }
          );
          return {
            ...original,
            surfaceId: `s${String(surface).padStart(2, "0")}`,
            requiredControls: findings.map((finding) => finding.controlId),
            findings
          };
        });
        const next = { ...body, surfaceAssessments };
        return { ...next, reportFingerprint: await fingerprintEvidenceReportBody(next) };
      };
      const before = await make(false);
      const after = await make(true);
      const direct = await compareEvidenceReports(before, after);
      const wrapped = await compareDecisionPackets(
        await buildDecisionPacket(browserPolicy, before, "2026-07-24"),
        await buildDecisionPacket(browserPolicy, after, "2026-07-24"),
        "2026-07-24"
      );
      expect(wrapped.evidence.summary).toEqual(direct.summary);
      expect(wrapped.evidence.summary.regressions).toBe(1);
      expect(renderDecisionPacketComparisonMarkdown(wrapped)).toContain("Regressions: 1");
      const junit = renderDecisionPacketComparisonJunit(wrapped);
      expect(junit).toContain('failures="1"');
      expect(junit).toContain("<failure");
      if (count > 512) expect(junit).toContain("Omitted bounded events");
    }
  );
  // Schema-valid public-builder fixtures exercise the 512 display cap; they do not assert real collection.
  it.each([511, 512, 513])(
    "counts all %s decisions including a late adverse event",
    async (count) => {
      const base = await evaluateEvidencePolicy(await evidence(), policy(), "2026-07-24");
      const findings = Array.from({ length: count }, (_, i) => ({
        surfaceId: `s${String(Math.floor(i / 64)).padStart(2, "0")}`,
        targetKind: "control" as const,
        targetId: `control-${String(i).padStart(4, "0")}`,
        outcome: "observed" as const,
        decision: "review" as const,
        explanation: "Synthetic public-builder fixture"
      }));
      const profile = {
        ...base.profile,
        surfaces: Array.from({ length: Math.ceil(count / 64) }, (_, i) => ({
          id: `s${String(i).padStart(2, "0")}`,
          role: "document" as const,
          requiredEvidence: ["response" as const],
          requiredControls: findings
            .filter((finding) => finding.surfaceId === `s${String(i).padStart(2, "0")}`)
            .map((finding) => finding.targetId),
          requiredComposites: []
        }))
      };
      const before = evidencePolicyEvaluationSchema.parse({
        ...base,
        profile,
        findings,
        summary: { pass: 0, review: count, fail: 0 }
      });
      const after = evidencePolicyEvaluationSchema.parse({
        ...before,
        findings: findings.map((finding, i) => ({
          ...finding,
          decision: i === count - 1 ? "fail" : "pass"
        })),
        summary: { pass: count - 1, review: 0, fail: 1 }
      });
      const comparison = await compareDecisionPackets(
        await buildDecisionPacket(browserPolicy, before, "2026-07-24"),
        await buildDecisionPacket(browserPolicy, after, "2026-07-24"),
        "2026-07-24"
      );
      expect(comparison.evidence.summary).toMatchObject({
        regressions: 1,
        resolutions: count - 1,
        totalEvents: count,
        emittedEvents: Math.min(count, 512),
        truncated: count > 512
      });
    }
  );
  it("separately exercises the normal evaluator with present surfaces and required controls", async () => {
    const report = await evidence();
    const p = policy();
    const surface = p.surfaces[0];
    if (!surface) throw new Error("Missing fixture surface");
    surface.requiredControls = SECURITY_CONTROLS.map((control) => control.id);
    const result = await evaluateEvidencePolicy(report, p, "2026-07-24");
    expect(result.findings.filter((finding) => finding.targetKind === "control")).toHaveLength(36);
  });
});

describe("session-only storage and operation generations", () => {
  it("keeps shared schema parsing non-evaluating under a strict CSP", () => {
    expect(z.config().jitless).toBe(true);
    expect(evidencePolicyProfileSchema.safeParse(policy()).success).toBe(true);
    expect(
      evidencePolicyProfileSchema.safeParse({ ...policy(), unexpected: "value" }).success
    ).toBe(false);
  });
  it("handles throwing access and methods without pretending to persist", () => {
    const throwing = guardedStorage(() => {
      throw new Error("Denied getter");
    });
    expect(loadProfile(throwing)).toEqual({ state: "unavailable" });
    expect(loadEvaluation(throwing)).toEqual({ state: "unavailable" });
    expect(() => throwing.setItem("x", "y")).toThrow(/not saved/u);
    expect(() => throwing.removeItem("x")).toThrow(/may remain/u);
    const storage = guardedStorage(() => ({
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
      },
      removeItem: () => undefined
    }));
    expect(storage.getItem("x")).toBeNull();
    expect(() => storage.setItem("x", "y")).toThrow(/full/u);
    expect(() => storage.removeItem("x")).not.toThrow();
    const values = new Map<string, string>();
    const normal = guardedStorage(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      }
    }));
    normal.setItem("x", "y");
    expect(normal.getItem("x")).toBe("y");
    normal.removeItem("x");
    expect(normal.getItem("x")).toBeNull();
  });
  it("supersedes stale successes and errors after replacement or clear", () => {
    const operations = new OperationGeneration();
    const first = operations.begin();
    const second = operations.begin();
    expect(operations.current(first)).toBe(false);
    expect(operations.current(second)).toBe(true);
    operations.cancel();
    expect(operations.current(second)).toBe(false);
  });
});
