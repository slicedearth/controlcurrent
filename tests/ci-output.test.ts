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
  it("renders bounded Markdown without creating active markup", () => {
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

  it("renders deterministic policy-drift Markdown and JUnit", () => {
    const comparison = comparePolicyEvaluations(evaluation, evaluation, "2026-07-24");
    expect(renderPolicyDriftMarkdown(comparison)).toContain("No policy or decision changes");
    expect(renderPolicyDriftJunit(comparison)).toContain('tests="0"');
    expect(renderPolicyDriftJunit(comparison)).toBe(renderPolicyDriftJunit(comparison));
  });
});
