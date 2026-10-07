import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveCspBroadSourceCount, scriptCspCandidate } from "../src/assurance";
import { evidencePolicyProfileSchema } from "../src/contracts";
import { inspectEvidenceBundle, inspectHtmlResources } from "../src/evidence-bundle";
import { evaluateEvidencePolicy } from "../src/evidence-policy";
import { encodeBase64, parseCspHashSource, parseIntegrityMetadata } from "../src/integrity";
import { evidenceIdentity, evidenceSourceContext } from "./helpers";

const nonce = "'nonce-AAAAAAAAAAAAAAAAAAAAAA=='";
const surface = {
  id: "document",
  role: "document",
  requiredEvidence: ["response"],
  requiredControls: ["content-security-policy"],
  requiredComposites: ["strict-csp-candidate"]
} as const;
const policy = evidencePolicyProfileSchema.parse({
  ...JSON.parse(readFileSync(new URL("../examples/evidence-policy.json", import.meta.url), "utf8")),
  expectedBcdVersion: evidenceSourceContext.bcdVersion,
  scopeInventory: {
    required: false,
    allowedKinds: ["declared"],
    requireComplete: false,
    maxAgeDays: 30,
    maxExcludedEntries: 32
  },
  surfaces: [surface]
});
const snapshot = (csp: string | string[]) => ({
  schemaVersion: 1,
  name: "CSP fixture",
  headers: { "Content-Security-Policy": csp }
});
async function inspect(csp: string | string[], html?: string) {
  return inspectEvidenceBundle(
    {
      schemaVersion: 4,
      name: "CSP grammar",
      identity: evidenceIdentity,
      surfaces: [surface],
      responses: [{ ...snapshot(csp), surfaceId: "document" }],
      ...(html === undefined
        ? {}
        : { htmlDocuments: [{ schemaVersion: 1, name: "Markup", surfaceId: "document", html }] })
    },
    evidenceSourceContext
  );
}

const algorithms = [
  ["sha256", 32],
  ["sha384", 48],
  ["sha512", 64]
] as const;
describe("CSP hash grammar remains separate from SRI options", () => {
  it.each(algorithms)(
    "rejects %s options through every decision layer",
    async (algorithm, length) => {
      const expression = `${algorithm}-${encodeBase64(new Uint8Array(length))}`;
      expect(parseCspHashSource(`'${expression}'`).metadata).toHaveLength(1);
      expect(
        parseCspHashSource(`'${expression.toUpperCase().slice(0, 6)}${expression.slice(6)}'`)
          .metadata
      ).toHaveLength(1);
      for (const suffix of ["?x", "?", "?option=value"]) {
        const malformed = `'${expression}${suffix}'`;
        expect(parseCspHashSource(malformed)).toEqual({
          metadata: [],
          invalidSupportedTokenCount: 1
        });
        expect(parseIntegrityMetadata(`${expression}${suffix}`).metadata).toHaveLength(1);
        expect(
          inspectHtmlResources({
            schemaVersion: 1,
            name: "SRI options",
            html: `<script src="/fixture.js" integrity="${expression}${suffix}"></script>`
          }).finding.state
        ).toBe("observed");
        for (const inline of [false, true]) {
          const tokens = [malformed, ...(inline ? ["'unsafe-inline'"] : [])];
          expect(effectiveCspBroadSourceCount(tokens, "script")).toBe(inline ? 1 : 0);
          expect(
            effectiveCspBroadSourceCount([...tokens, "'strict-dynamic'", "https:"], "script")
          ).toBe(inline ? 2 : 1);
          const csp = `script-src ${tokens.join(" ")}; base-uri 'none'`;
          expect(scriptCspCandidate(snapshot(csp))).toBe("gap");
          for (const html of [undefined, "", "<main>Fixture</main>"]) {
            const report = await inspect(csp, html);
            expect(
              report.composites.find((item) => item.id === "strict-csp-candidate")?.state
            ).toBe("gap");
            const evaluation = await evaluateEvidencePolicy(report, policy, "2026-07-23");
            expect(
              evaluation.findings.find(
                (item) =>
                  item.targetKind === "composite" && item.targetId === "strict-csp-candidate"
              )
            ).toMatchObject({ outcome: "gap", decision: "fail" });
          }
        }
      }
    }
  );

  it.each([
    [
      "malformed default fallback",
      `default-src 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=?x' 'unsafe-inline'; base-uri 'none'`,
      "gap"
    ],
    [
      "malformed element override",
      `script-src ${nonce}; script-src-elem 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=?x' 'unsafe-inline'; base-uri 'none'`,
      "gap"
    ],
    [
      "malformed general override",
      `script-src-elem ${nonce}; script-src 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=?x' 'unsafe-inline'; base-uri 'none'`,
      "gap"
    ],
    ["style-only nonce", `style-src ${nonce}; script-src 'unsafe-inline'; base-uri 'none'`, "gap"],
    [
      "element override",
      `script-src ${nonce}; script-src-elem 'unsafe-inline'; base-uri 'none'`,
      "gap"
    ],
    [
      "general override",
      `script-src-elem ${nonce}; script-src 'unsafe-inline'; base-uri 'none'`,
      "gap"
    ],
    ["default fallback", `default-src ${nonce}; base-uri 'none'`, "satisfied"],
    ["valid nonce", `script-src ${nonce}; base-uri 'none'`, "satisfied"],
    [
      "CSP3 ignored sources",
      `script-src ${nonce} 'strict-dynamic' 'unsafe-inline' https: 'self'; base-uri 'none'`,
      "satisfied"
    ],
    [
      "element and general lists",
      `script-src-elem ${nonce}; script-src ${nonce}; base-uri 'none'`,
      "satisfied"
    ],
    [
      "unsafe attribute override",
      `script-src ${nonce}; script-src-attr 'unsafe-inline'; base-uri 'none'`,
      "gap"
    ],
    [
      "multiple enforced policies",
      [`script-src ${nonce}; base-uri 'none'`, "default-src 'none'"],
      "review"
    ]
  ] as const)("preserves %s", async (_name, csp, state) => {
    const input = typeof csp === "string" ? csp : [...csp];
    expect(scriptCspCandidate(snapshot(input))).toBe(state);
    for (const html of [undefined, ""]) {
      const report = await inspect(input, html);
      expect(report.composites.find((item) => item.id === "strict-csp-candidate")).toMatchObject({
        name: "Script CSP declaration candidate",
        state
      });
      const evaluation = await evaluateEvidencePolicy(report, policy, "2026-07-23");
      expect(evaluation.findings.find((item) => item.targetKind === "composite")).toMatchObject({
        outcome: state,
        decision: state === "satisfied" ? "pass" : state === "review" ? "review" : "fail"
      });
    }
  });

  it.each(algorithms)(
    "preserves valid %s fallback and ignored inline sources",
    async (algorithm, length) => {
      const hash = `'${algorithm}-${encodeBase64(new Uint8Array(length))}'`;
      expect(effectiveCspBroadSourceCount([hash, "'unsafe-inline'"], "script")).toBe(0);
      expect(
        effectiveCspBroadSourceCount(
          [hash, "'strict-dynamic'", "https:", "'self'", "'unsafe-inline'"],
          "script"
        )
      ).toBe(0);
      for (const directive of ["script-src", "default-src"]) {
        const report = await inspect(`${directive} ${hash} 'unsafe-inline'; base-uri 'none'`);
        const evaluation = await evaluateEvidencePolicy(report, policy, "2026-07-23");
        expect(evaluation.findings.find((item) => item.targetKind === "composite")).toMatchObject({
          outcome: "satisfied",
          decision: "pass"
        });
      }
    }
  );

  it("requires the full token even when a regular-expression end anchor precedes a newline", () => {
    const hash = `'sha256-${encodeBase64(new Uint8Array(32))}'`;
    for (const suffix of ["\n", "\r\n", " ", "\t"]) {
      expect(parseCspHashSource(`${hash}${suffix}`)).toEqual({
        metadata: [],
        invalidSupportedTokenCount: 1
      });
    }
  });

  it.each([
    "sha256-AAAA",
    "'sha256-AAAA'",
    "'sha256-AAAA' trailing",
    "'sha256-AAAA extra'",
    "'sha256-AAAA=== '",
    "'md5-AAAA'"
  ])("does not authorise malformed full token %s", (token) => {
    expect(parseCspHashSource(token).metadata).toHaveLength(0);
  });
});
