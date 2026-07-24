import { SECURITY_CONTROLS } from "./catalogue";
import { policyEvaluationSchema, profileEvaluationSchema } from "./contracts";
import { canonicalJson } from "./canonical";
import { browserNames, outcomeLabels } from "./format";

export const MAX_DECISION_REPORT_BYTES = 1_024 * 1_024;

function html(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function exportDecisionReport(
  evaluationInput: unknown,
  policyEvaluationInput: unknown
): string {
  const evaluation = profileEvaluationSchema.parse(evaluationInput);
  const policyEvaluation = policyEvaluationSchema.parse(policyEvaluationInput);
  const profile = policyEvaluation.profile;
  if (
    evaluation.bcdVersion !== policyEvaluation.bcdVersion ||
    evaluation.catalogueVersion !== policyEvaluation.catalogueVersion
  ) {
    throw new Error("The policy decision and browser result use different source versions.");
  }
  if (
    canonicalJson(evaluation.profile) !==
    canonicalJson({
      schemaVersion: 1,
      name: profile.name,
      baselines: profile.baselines
    })
  ) {
    throw new Error("The policy decision and browser result use different browser plans.");
  }
  const controlNames = new Map<string, string>(
    SECURITY_CONTROLS.map((control) => [control.id, control.name])
  );
  const fallbacks = new Map<string, string>(
    SECURITY_CONTROLS.map((control) => [control.id, control.fallback])
  );
  const rows = policyEvaluation.findings
    .map(
      (finding) => `<tr>
        <td>${html(controlNames.get(finding.controlId) ?? finding.controlId)}</td>
        <td>${html(browserNames[finding.browser])} ${html(finding.minimumVersion)}</td>
        <td>${html(outcomeLabels[finding.outcome])}</td>
        <td>${html(finding.decision)}</td>
        <td>${html(finding.explanation)}</td>
      </tr>`
    )
    .join("");
  const exceptions =
    profile.exceptions.length === 0
      ? "<p>No exceptions were recorded.</p>"
      : `<div class="table"><table>
        <thead><tr><th>Security feature</th><th>Browser scope</th><th>Results covered</th><th>Reason</th><th>Expires</th></tr></thead>
        <tbody>${profile.exceptions
          .map(
            (exception) => `<tr>
              <td>${html(controlNames.get(exception.controlId) ?? exception.controlId)}</td>
              <td>${html(
                exception.browsers?.map((browser) => browserNames[browser]).join(", ") ??
                  "All selected browsers"
              )}</td>
              <td>${html(exception.outcomes.map((outcome) => outcomeLabels[outcome]).join(", "))}</td>
              <td>${html(exception.reason)}</td>
              <td>${html(exception.expiresOn)}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table></div>`;
  const fallbackItems = profile.requiredControls
    .map(
      (controlId) =>
        `<li><strong>${html(controlNames.get(controlId) ?? controlId)}</strong>: ${html(fallbacks.get(controlId) ?? "Review the feature guidance.")}</li>`
    )
    .join("");
  const report = `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <title>${html(profile.name)} · ControlCurrent decision report</title>
  <style>
    :root{font-family:system-ui,sans-serif;color:#14201d;background:#fff}body{max-width:1100px;margin:0 auto;padding:40px;line-height:1.5}h1,h2{line-height:1.15}h2{margin-top:2rem;border-top:1px solid #ccd8d4;padding-top:1rem}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.summary div{border:1px solid #ccd8d4;padding:1rem}.summary strong{display:block;font-size:1.8rem}table{width:100%;border-collapse:collapse;font-size:.88rem}th,td{padding:.65rem;border:1px solid #ccd8d4;text-align:left;vertical-align:top}th{background:#eef5f2}.limit{border-left:4px solid #b7791f;padding:1rem;background:#fff8e8}@media(max-width:700px){body{padding:20px}.summary{grid-template-columns:1fr}.table{overflow-x:auto}table{min-width:800px}}@media print{body{max-width:none;padding:0}.table{overflow:visible}a{color:inherit}}
  </style>
</head>
<body>
  <header>
    <p>ControlCurrent engineering decision record</p>
    <h1>${html(profile.name)}</h1>
    <p>Evaluated ${html(policyEvaluation.evaluatedAsOf)} using MDN browser data ${html(policyEvaluation.bcdVersion)} and catalogue ${html(policyEvaluation.catalogueVersion)}.</p>
  </header>
  <section>
    <h2>Decision summary</h2>
    <div class="summary">
      <div><strong>${String(policyEvaluation.summary.pass)}</strong>pass</div>
      <div><strong>${String(policyEvaluation.summary.review)}</strong>review</div>
      <div><strong>${String(policyEvaluation.summary.fail)}</strong>fail</div>
    </div>
  </section>
  <section>
    <h2>Supported browsers</h2>
    <ul>${profile.baselines
      .map(
        (baseline) =>
          `<li>${html(browserNames[baseline.browser])} ${html(baseline.minimumVersion)} or newer</li>`
      )
      .join("")}</ul>
  </section>
  <section>
    <h2>Decision rules</h2>
    <ul>
      <li>Known browser limitations: ${html(profile.rules.qualifications)}</li>
      <li>Unknown browser data: ${html(profile.rules.unknown)}</li>
      <li>Features without a precise mapping: ${html(profile.rules.unsupported)}</li>
    </ul>
  </section>
  <section>
    <h2>Recorded exceptions</h2>
    ${exceptions}
  </section>
  <section>
    <h2>Fallbacks to keep</h2>
    <ul>${fallbackItems}</ul>
  </section>
  <section>
    <h2>Detailed results</h2>
    <div class="table"><table>
      <thead><tr><th>Security feature</th><th>Browser minimum</th><th>Support result</th><th>Policy decision</th><th>Reason</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>
  <section class="limit">
    <h2>What this report cannot prove</h2>
    <p>Browser compatibility does not establish correct configuration, runtime enforcement, complete evidence collection, absence of browser defects, compliance, or production security. This report records a reproducible engineering decision, not a certification.</p>
  </section>
</body>
</html>`;
  if (new TextEncoder().encode(report).byteLength > MAX_DECISION_REPORT_BYTES) {
    throw new Error(`Decision report exceeds the ${String(MAX_DECISION_REPORT_BYTES)}-byte limit.`);
  }
  return report;
}
