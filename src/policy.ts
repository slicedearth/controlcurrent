import { SECURITY_CONTROLS } from "./catalogue";
import {
  type BrowserId,
  type Outcome,
  type PolicyDecision,
  type PolicyEvaluation,
  policyEvaluationSchema,
  type PolicyException,
  policyProfileSchema,
  selectedSnapshotSchema
} from "./contracts";
import { evaluateProfile } from "./evaluate";

function baseDecision(
  outcome: Outcome,
  rules: {
    qualifications: "review" | "fail";
    unknown: "review" | "fail";
    unsupported: "review" | "fail";
  }
): PolicyDecision {
  switch (outcome) {
    case "available_unqualified":
      return "pass";
    case "available_with_qualification":
      return rules.qualifications;
    case "unknown":
    case "source_inconsistent":
      return rules.unknown;
    case "unsupported_mapping":
      return rules.unsupported;
    case "removed":
    case "unavailable":
      return "fail";
  }
}

function matchingException(
  exceptions: readonly PolicyException[],
  controlId: string,
  browser: BrowserId,
  outcome: Outcome
): PolicyException | undefined {
  return exceptions.find(
    (candidate) =>
      candidate.controlId === controlId &&
      candidate.outcomes.includes(outcome) &&
      (!candidate.browsers || candidate.browsers.includes(browser))
  );
}

export function evaluatePolicyProfile(
  snapshotInput: unknown,
  profileInput: unknown,
  evaluatedAsOf: string
): PolicyEvaluation {
  const snapshot = selectedSnapshotSchema.parse(snapshotInput);
  const profile = policyProfileSchema.parse(profileInput);
  const knownControls = new Set<string>(SECURITY_CONTROLS.map((control) => control.id));
  for (const controlId of profile.requiredControls) {
    if (!knownControls.has(controlId)) {
      throw new Error(`Unknown required control: ${controlId}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(evaluatedAsOf) || Number.isNaN(Date.parse(evaluatedAsOf))) {
    throw new Error(`Invalid evaluation date: ${evaluatedAsOf}`);
  }

  const evaluation = evaluateProfile(snapshot, {
    schemaVersion: 1,
    name: profile.name,
    baselines: profile.baselines
  });
  const findings = profile.requiredControls.flatMap((controlId) =>
    (evaluation.results[controlId] ?? []).map((item) => {
      const exception = matchingException(
        profile.exceptions,
        controlId,
        item.browser,
        item.outcome
      );
      const exceptionState = exception
        ? exception.expiresOn >= evaluatedAsOf
          ? "active"
          : "expired"
        : undefined;
      const decision =
        exceptionState === "active" ? "review" : baseDecision(item.outcome, profile.rules);

      return {
        controlId,
        browser: item.browser,
        minimumVersion: item.minimumVersion,
        outcome: item.outcome,
        decision,
        explanation: item.explanation,
        ...(exceptionState ? { exceptionState } : {}),
        ...(exception
          ? {
              exceptionReason: exception.reason,
              exceptionExpiresOn: exception.expiresOn
            }
          : {})
      };
    })
  );

  return policyEvaluationSchema.parse({
    schemaVersion: 1,
    evaluatedAsOf,
    bcdVersion: snapshot.bcdVersion,
    bcdTimestamp: snapshot.bcdTimestamp,
    catalogueVersion: snapshot.catalogueVersion,
    profile,
    summary: {
      pass: findings.filter((finding) => finding.decision === "pass").length,
      review: findings.filter((finding) => finding.decision === "review").length,
      fail: findings.filter((finding) => finding.decision === "fail").length
    },
    findings
  });
}
