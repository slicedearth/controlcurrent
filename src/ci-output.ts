import {
  decisionPacketComparisonSchema,
  evidencePolicyEvaluationSchema,
  policyDriftComparisonSchema,
  policyEvaluationSchema
} from "./contracts";

export type CliOutputFormat = "text" | "json" | "markdown" | "junit";

function markdown(value: string): string {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127) ? " " : character;
    })
    .join("")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .trim();
}

function xml(value: string): string {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined &&
        ((codePoint < 32 && ![9, 10, 13].includes(codePoint)) || codePoint === 127)
        ? " "
        : character;
    })
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function junitCase(
  name: string,
  classname: string,
  decision: "pass" | "review" | "fail",
  explanation: string
): string {
  if (decision === "pass") {
    return `  <testcase name="${xml(name)}" classname="${xml(classname)}"/>`;
  }
  const element = decision === "fail" ? "failure" : "skipped";
  return `  <testcase name="${xml(name)}" classname="${xml(classname)}"><${element} message="${xml(explanation)}"/></testcase>`;
}

function junitSuite(
  name: string,
  cases: readonly string[],
  failures: number,
  skipped: number,
  properties = ""
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${xml(name)}" tests="${String(cases.length)}" failures="${String(failures)}" skipped="${String(skipped)}">`,
    ...(properties ? [properties] : []),
    ...cases,
    "</testsuite>",
    ""
  ].join("\n");
}

export function renderPolicyEvaluationMarkdown(input: unknown): string {
  const evaluation = policyEvaluationSchema.parse(input);
  const rows = evaluation.findings
    .filter((finding) => finding.decision !== "pass")
    .map(
      (finding) =>
        `| ${markdown(finding.decision)} | ${markdown(finding.controlId)} | ${markdown(finding.browser)} ${markdown(finding.minimumVersion)} | ${markdown(finding.outcome)} |`
    );
  return [
    `# ${markdown(evaluation.profile.name)}`,
    "",
    `Evaluated ${evaluation.evaluatedAsOf} with BCD ${markdown(evaluation.bcdVersion)} and catalogue ${markdown(evaluation.catalogueVersion)}.`,
    "",
    `- Pass: ${String(evaluation.summary.pass)}`,
    `- Review: ${String(evaluation.summary.review)}`,
    `- Fail: ${String(evaluation.summary.fail)}`,
    "",
    "## Findings requiring attention",
    "",
    ...(rows.length
      ? ["| Decision | Control | Browser minimum | Outcome |", "| --- | --- | --- | --- |", ...rows]
      : ["No findings require attention."]),
    "",
    "Browser availability is planning evidence, not proof of runtime enforcement or production security.",
    ""
  ].join("\n");
}

export function renderPolicyEvaluationJunit(input: unknown): string {
  const evaluation = policyEvaluationSchema.parse(input);
  const cases = evaluation.findings.map((finding) =>
    junitCase(
      `${finding.controlId} / ${finding.browser} ${finding.minimumVersion}`,
      evaluation.profile.name,
      finding.decision,
      `${finding.outcome}: ${finding.explanation}`
    )
  );
  return junitSuite(
    evaluation.profile.name,
    cases,
    evaluation.summary.fail,
    evaluation.summary.review
  );
}

export function renderEvidenceEvaluationMarkdown(input: unknown): string {
  const evaluation = evidencePolicyEvaluationSchema.parse(input);
  const rows = evaluation.findings
    .filter((finding) => finding.decision !== "pass")
    .map(
      (finding) =>
        `| ${markdown(finding.decision)} | ${markdown(finding.surfaceId ?? "report")} | ${markdown(finding.targetKind)}:${markdown(finding.targetId)} | ${markdown(finding.outcome)} |`
    );
  return [
    `# ${markdown(evaluation.profile.name)}`,
    "",
    `Evidence for ${markdown(evaluation.reportIdentity.subject.applicationId)} / ${markdown(evaluation.reportIdentity.subject.environment)} / revision ${markdown(evaluation.reportIdentity.subject.revision)}.`,
    "",
    `- Pass: ${String(evaluation.summary.pass)}`,
    `- Review: ${String(evaluation.summary.review)}`,
    `- Fail: ${String(evaluation.summary.fail)}`,
    "",
    "## Findings requiring attention",
    "",
    ...(rows.length
      ? ["| Decision | Surface | Target | Outcome |", "| --- | --- | --- | --- |", ...rows]
      : ["No findings require attention."]),
    "",
    "Supplied evidence does not establish independent collection completeness or runtime enforcement.",
    ""
  ].join("\n");
}

export function renderEvidenceEvaluationJunit(input: unknown): string {
  const evaluation = evidencePolicyEvaluationSchema.parse(input);
  const cases = evaluation.findings.map((finding) =>
    junitCase(
      `${finding.surfaceId ?? "report"} / ${finding.targetKind}:${finding.targetId}`,
      evaluation.profile.name,
      finding.decision,
      `${finding.outcome}: ${finding.explanation}`
    )
  );
  return junitSuite(
    evaluation.profile.name,
    cases,
    evaluation.summary.fail,
    evaluation.summary.review
  );
}

export function renderPolicyDriftMarkdown(input: unknown): string {
  const comparison = policyDriftComparisonSchema.parse(input);
  const rows = comparison.events.map(
    (item) =>
      `| ${markdown(item.severity)} | ${markdown(item.type.replaceAll("_", " "))} | ${markdown(item.summary)} |`
  );
  return [
    `# Policy drift: ${markdown(comparison.beforeProfileName)} to ${markdown(comparison.afterProfileName)}`,
    "",
    `Compared ${comparison.comparedAsOf}; exception warning window ${String(comparison.expiryWarningDays)} days.`,
    "",
    `- Regressions: ${String(comparison.summary.regressions)}`,
    `- Resolutions: ${String(comparison.summary.resolutions)}`,
    `- Review: ${String(comparison.summary.review)}`,
    `- Information: ${String(comparison.summary.information)}`,
    `- Expiring exceptions: ${String(comparison.summary.expiringExceptions)}`,
    ...(comparison.summary.truncated
      ? [
          `- Displayed events: ${String(comparison.summary.emittedEvents)} of ${String(comparison.summary.totalEvents)}; full totals determine the gate.`
        ]
      : []),
    "",
    ...(rows.length
      ? ["| Classification | Change | Summary |", "| --- | --- | --- |", ...rows]
      : ["No policy or decision changes were detected."]),
    ""
  ].join("\n");
}

export function renderPolicyDriftJunit(input: unknown): string {
  const comparison = policyDriftComparisonSchema.parse(input);
  const cases = comparison.events.map((item) =>
    junitCase(
      `${item.type} / ${item.key}`,
      `${comparison.beforeProfileName} to ${comparison.afterProfileName}`,
      item.severity === "regression" ? "fail" : item.severity === "review" ? "review" : "pass",
      item.summary
    )
  );
  const visibleFailures = comparison.events.filter((item) => item.severity === "regression").length;
  const visibleReview = comparison.events.filter((item) => item.severity === "review").length;
  const hiddenFailures = comparison.summary.regressions - visibleFailures;
  const hiddenReview = comparison.summary.review - visibleReview;
  const omitted = comparison.summary.truncated === true;
  if (omitted)
    cases.push(
      junitCase(
        "Omitted bounded events",
        "browser policy",
        hiddenFailures > 0 ? "fail" : hiddenReview > 0 ? "review" : "pass",
        `${String(hiddenFailures)} adverse and ${String(hiddenReview)} review events were omitted; full totals still determine the gate.`
      )
    );
  return junitSuite(
    `${comparison.beforeProfileName} to ${comparison.afterProfileName}`,
    cases,
    visibleFailures + (omitted && hiddenFailures > 0 ? 1 : 0),
    visibleReview + (omitted && hiddenFailures <= 0 && hiddenReview > 0 ? 1 : 0),
    `<properties><property name="total-regressions" value="${String(comparison.summary.regressions)}"/></properties>`
  );
}

export function renderDecisionPacketComparisonMarkdown(input: unknown): string {
  const comparison = decisionPacketComparisonSchema.parse(input);
  return [
    "# Decision packet comparison",
    "",
    `Compared ${comparison.comparedAsOf}.`,
    "",
    `- Regressions: ${String(comparison.summary.regressions)}`,
    `- Resolutions: ${String(comparison.summary.resolutions)}`,
    `- Review: ${String(comparison.summary.review)}`,
    `- Other changes: ${String(comparison.summary.changed)}`,
    `- Incomparable: ${String(comparison.summary.incomparable)}`,
    "",
    "## Browser policy",
    "",
    renderPolicyDriftMarkdown(comparison.browserPolicy).trim(),
    "",
    "## Evidence",
    "",
    ...(comparison.evidence.summary.truncated
      ? [
          `Showing ${String(comparison.evidence.summary.emittedEvents)} of ${String(comparison.evidence.summary.totalEvents)} evidence events; the totals and gate include omitted events.`,
          ""
        ]
      : []),
    ...(comparison.evidence.events.length
      ? comparison.evidence.events.map(
          (item) => `- **${markdown(item.type)}** ${markdown(item.summary)}`
        )
      : ["No evidence changes were detected."]),
    "",
    "The two decision lanes remain separate; this comparison does not create a security score.",
    ""
  ].join("\n");
}

export function renderDecisionPacketComparisonJunit(input: unknown): string {
  const comparison = decisionPacketComparisonSchema.parse(input);
  const policyCases = comparison.browserPolicy.events.map((item) =>
    junitCase(
      `browser policy / ${item.type} / ${item.key}`,
      "decision packet",
      item.severity === "regression" ? "fail" : item.severity === "review" ? "review" : "pass",
      item.summary
    )
  );
  const evidenceCases = comparison.evidence.events.map((item) =>
    junitCase(
      `evidence / ${item.type} / ${item.key}`,
      "decision packet",
      item.type === "regression" || item.type === "incomparable"
        ? "fail"
        : item.type === "changed"
          ? "review"
          : "pass",
      item.summary
    )
  );
  const visibleFailures =
    comparison.browserPolicy.events.filter((item) => item.severity === "regression").length +
    comparison.evidence.events.filter((item) => ["regression", "incomparable"].includes(item.type))
      .length;
  const visibleReview =
    comparison.browserPolicy.events.filter((item) => item.severity === "review").length +
    comparison.evidence.events.filter((item) => item.type === "changed").length;
  const hiddenFailures =
    comparison.summary.regressions + comparison.summary.incomparable - visibleFailures;
  const hiddenReview =
    comparison.summary.review + comparison.evidence.summary.changed - visibleReview;
  const omitted =
    comparison.evidence.summary.truncated === true ||
    comparison.browserPolicy.summary.truncated === true;
  const summaryCases = omitted
    ? [
        junitCase(
          "Omitted bounded events",
          "decision packet",
          hiddenFailures > 0 ? "fail" : hiddenReview > 0 ? "review" : "pass",
          `${String(hiddenFailures)} adverse and ${String(hiddenReview)} review events were omitted from the display. Full totals still determine the gate.`
        )
      ]
    : [];
  const properties = `<properties><property name="total-regressions" value="${String(comparison.summary.regressions)}"/><property name="total-incomparable" value="${String(comparison.summary.incomparable)}"/></properties>`;
  return junitSuite(
    "decision packet comparison",
    [...policyCases, ...evidenceCases, ...summaryCases],
    visibleFailures + (omitted && hiddenFailures > 0 ? 1 : 0),
    visibleReview + (omitted && hiddenFailures <= 0 && hiddenReview > 0 ? 1 : 0),
    properties
  );
}
