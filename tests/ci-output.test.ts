import { describe, expect, it } from "vitest";
import {
  renderPolicyDriftJunit,
  renderPolicyDriftMarkdown,
  renderPolicyEvaluationJunit,
  renderPolicyEvaluationMarkdown
} from "../src/ci-output";
import { selectedSnapshot } from "../src/data";
import { evaluatePolicyProfile } from "../src/policy";
import { comparePolicyEvaluations } from "../src/policy-comparison";

const evaluation = evaluatePolicyProfile(
  selectedSnapshot,
  {
    schemaVersion: 1,
    name: "<build & review>",
    baselines: [{ browser: "chrome", minimumVersion: "120" }],
    requiredControls: ["content-security-policy", "csp-nonces"],
    rules: { qualifications: "review", unknown: "fail", unsupported: "fail" },
    exceptions: []
  },
  "2026-07-24"
);

describe("CI report formats", () => {
  it("renders bounded Markdown with policy totals and caveats", () => {
    const report = renderPolicyEvaluationMarkdown(evaluation);
    expect(report).toContain("# <build & review>");
    expect(report).toContain("| fail | csp-nonces |");
    expect(report).toContain("not proof of runtime enforcement");
  });

  it("escapes hostile values in JUnit XML", () => {
    const report = renderPolicyEvaluationJunit(evaluation);
    expect(report).toContain('name="&lt;build &amp; review&gt;"');
    expect(report).not.toContain('name="<build & review>"');
    expect(report).toContain("<failure ");
  });

  it.each([0, 8, 11, 12, 31, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xfffe, 0xffff])(
    "replaces XML-illegal code point %i with one space",
    (codePoint) => {
      const name = `Fixture${String.fromCodePoint(codePoint)}suffix`;
      const report = renderPolicyEvaluationJunit({
        ...evaluation,
        profile: { ...evaluation.profile, name },
        findings: evaluation.findings.map((finding) => ({ ...finding, explanation: name }))
      });
      expect(report).toContain('name="Fixture suffix"');
      expect(report).toContain('classname="Fixture suffix"');
      expect(report).toContain('message="unsupported_mapping: Fixture suffix"');
    }
  );

  it("preserves the XML 1.0 legal character boundaries and supplementary Unicode", () => {
    const name = "A\t\n\r\u0020\u007f\u0085\ud7ff\ue000\ufffd\u{10000}\u{1fffe}\u{10ffff}Z";
    const report = renderPolicyEvaluationJunit({
      ...evaluation,
      profile: { ...evaluation.profile, name }
    });
    expect(report).toContain(`name="${name}"`);
    expect(report).toContain(`classname="${name}"`);
  });

  it("renders deterministic policy-drift Markdown and JUnit", () => {
    const comparison = comparePolicyEvaluations(evaluation, evaluation, "2026-07-24");
    expect(renderPolicyDriftMarkdown(comparison)).toContain("No policy or decision changes");
    expect(renderPolicyDriftJunit(comparison)).toContain('tests="0"');
    expect(renderPolicyDriftJunit(comparison)).toBe(renderPolicyDriftJunit(comparison));
  });

  it("represents omitted adverse policy events without claiming an unreachable evaluator edge", () => {
    // Public comparison contract fixture: the current catalogue does not generate this size.
    const base = comparePolicyEvaluations(evaluation, evaluation, "2026-07-24");
    const comparison = {
      ...base,
      summary: {
        ...base.summary,
        regressions: 1,
        information: 512,
        totalEvents: 513,
        emittedEvents: 512,
        truncated: true
      },
      events: Array.from({ length: 512 }, (_, i) => ({
        id: i.toString(16).padStart(24, "0"),
        type: "decision_context_changed" as const,
        severity: "information" as const,
        key: `fixture-${String(i)}`,
        summary: "Synthetic context change"
      }))
    };
    expect(renderPolicyDriftMarkdown(comparison)).toContain("512 of 513");
    const junit = renderPolicyDriftJunit(comparison);
    expect(junit).toContain('tests="513"');
    expect(junit).toContain('failures="1"');
    expect(junit).toContain("Omitted bounded events");
    expect(junit).toContain("<failure");
  });
});
