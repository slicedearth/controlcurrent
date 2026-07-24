import { canonicalJson } from "./canonical";
import {
  type BrowserBaseline,
  type PolicyDriftComparison,
  type PolicyDriftEvent,
  type PolicyEvaluation,
  type PolicyException,
  policyDriftComparisonSchema,
  policyEvaluationSchema
} from "./contracts";
import { compareBrowserVersions } from "./versions";

const DECISION_RANK = { pass: 0, review: 1, fail: 2 } as const;
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function validDate(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(input) && !Number.isNaN(Date.parse(input));
}

function fnv1a64(value: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function eventId(input: Omit<PolicyDriftEvent, "id">): string {
  const value = canonicalJson(input, 0);
  return `${fnv1a64(value)}${fnv1a64(`controlcurrent-policy-event-v1\0${value}`)}`.slice(0, 24);
}

function event(input: Omit<PolicyDriftEvent, "id">): PolicyDriftEvent {
  return {
    id: eventId(input),
    ...input
  };
}

function baselineMap(evaluation: PolicyEvaluation): Map<string, BrowserBaseline> {
  return new Map(evaluation.profile.baselines.map((baseline) => [baseline.browser, baseline]));
}

function exceptionKey(exception: PolicyException): string {
  return [
    exception.controlId,
    exception.browsers ? [...exception.browsers].sort().join(",") : "*",
    [...exception.outcomes].sort().join(",")
  ].join("\0");
}

function exceptionValue(exception: PolicyException): string {
  return canonicalJson(
    {
      controlId: exception.controlId,
      browsers: exception.browsers ? [...exception.browsers].sort() : undefined,
      outcomes: [...exception.outcomes].sort(),
      reason: exception.reason,
      expiresOn: exception.expiresOn
    },
    0
  );
}

function describeException(exception: PolicyException): string {
  return `${exception.controlId} for ${exception.browsers?.join(", ") ?? "all selected browsers"} when ${exception.outcomes.join(", ")}; expires ${exception.expiresOn}`;
}

function daysBetween(left: string, right: string): number {
  return Math.floor(
    (Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / (24 * 60 * 60 * 1_000)
  );
}

function findingKey(finding: PolicyEvaluation["findings"][number]): string {
  return `${finding.controlId}\0${finding.browser}`;
}

export function comparePolicyEvaluations(
  beforeInput: unknown,
  afterInput: unknown,
  comparedAsOf: string,
  expiryWarningDays = 30
): PolicyDriftComparison {
  if (!validDate(comparedAsOf)) {
    throw new Error(`Invalid policy comparison date: ${comparedAsOf}`);
  }
  if (!Number.isInteger(expiryWarningDays) || expiryWarningDays < 0 || expiryWarningDays > 365) {
    throw new Error("Exception expiry warning must be between 0 and 365 days.");
  }
  const before = policyEvaluationSchema.parse(beforeInput);
  const after = policyEvaluationSchema.parse(afterInput);
  const events: PolicyDriftEvent[] = [];

  const beforeBaselines = baselineMap(before);
  const afterBaselines = baselineMap(after);
  for (const browser of [
    ...new Set([...beforeBaselines.keys(), ...afterBaselines.keys()])
  ].sort()) {
    const left = beforeBaselines.get(browser);
    const right = afterBaselines.get(browser);
    if (!left && right) {
      events.push(
        event({
          type: "browser_added",
          severity: "review",
          key: `browser:${browser}`,
          after: right.minimumVersion,
          summary: `${browser} ${right.minimumVersion} entered the browser policy.`
        })
      );
      continue;
    }
    if (left && !right) {
      events.push(
        event({
          type: "browser_removed",
          severity: "review",
          key: `browser:${browser}`,
          before: left.minimumVersion,
          summary: `${browser} ${left.minimumVersion} left the browser policy.`
        })
      );
      continue;
    }
    if (!left || !right || left.minimumVersion === right.minimumVersion) continue;
    const relation = compareBrowserVersions(right.minimumVersion, left.minimumVersion);
    const type =
      relation === "before"
        ? "browser_scope_broadened"
        : relation === "after"
          ? "browser_scope_narrowed"
          : "browser_minimum_changed";
    events.push(
      event({
        type,
        severity: "review",
        key: `browser:${browser}`,
        before: left.minimumVersion,
        after: right.minimumVersion,
        summary:
          relation === "before"
            ? `${browser} now includes older versions: ${left.minimumVersion} became ${right.minimumVersion}.`
            : relation === "after"
              ? `${browser} now excludes older versions: ${left.minimumVersion} became ${right.minimumVersion}.`
              : `${browser} changed from ${left.minimumVersion} to ${right.minimumVersion}; the versions were not safely orderable.`
      })
    );
  }

  const beforeControls = new Set(before.profile.requiredControls);
  const afterControls = new Set(after.profile.requiredControls);
  for (const controlId of [...new Set([...beforeControls, ...afterControls])].sort()) {
    if (!beforeControls.has(controlId)) {
      events.push(
        event({
          type: "requirement_added",
          severity: "review",
          key: `control:${controlId}`,
          after: controlId,
          summary: `${controlId} became a required security feature.`
        })
      );
    } else if (!afterControls.has(controlId)) {
      events.push(
        event({
          type: "requirement_removed",
          severity: "regression",
          key: `control:${controlId}`,
          before: controlId,
          summary: `${controlId} is no longer required by the browser policy.`
        })
      );
    }
  }

  for (const rule of ["qualifications", "unknown", "unsupported"] as const) {
    const left = before.profile.rules[rule];
    const right = after.profile.rules[rule];
    if (left === right) continue;
    const strengthened = left === "review" && right === "fail";
    events.push(
      event({
        type: strengthened ? "rule_strengthened" : "rule_weakened",
        severity: strengthened ? "resolution" : "regression",
        key: `rule:${rule}`,
        before: left,
        after: right,
        summary: `${rule} results changed from ${left} to ${right}.`
      })
    );
  }

  const beforeExceptions = new Map(
    before.profile.exceptions.map((exception) => [exceptionKey(exception), exception])
  );
  const afterExceptions = new Map(
    after.profile.exceptions.map((exception) => [exceptionKey(exception), exception])
  );
  for (const key of [...new Set([...beforeExceptions.keys(), ...afterExceptions.keys()])].sort()) {
    const left = beforeExceptions.get(key);
    const right = afterExceptions.get(key);
    if (!left && right) {
      events.push(
        event({
          type: "exception_added",
          severity: "regression",
          key: `exception:${key}`,
          after: describeException(right),
          summary: `A policy exception was added for ${right.controlId}.`
        })
      );
    } else if (left && !right) {
      events.push(
        event({
          type: "exception_removed",
          severity: "resolution",
          key: `exception:${key}`,
          before: describeException(left),
          summary: `A policy exception was removed for ${left.controlId}.`
        })
      );
    } else if (left && right && exceptionValue(left) !== exceptionValue(right)) {
      events.push(
        event({
          type: "exception_changed",
          severity: "review",
          key: `exception:${key}`,
          before: describeException(left),
          after: describeException(right),
          summary: `A policy exception changed for ${right.controlId}.`
        })
      );
    }
  }

  for (const [key, exception] of [...afterExceptions.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const remaining = daysBetween(comparedAsOf, exception.expiresOn);
    if (remaining < 0) {
      events.push(
        event({
          type: "exception_expired",
          severity: "resolution",
          key: `exception-expiry:${key}`,
          before: exception.expiresOn,
          summary: `The exception for ${exception.controlId} expired on ${exception.expiresOn}.`
        })
      );
    } else if (remaining <= expiryWarningDays) {
      events.push(
        event({
          type: "exception_expiring",
          severity: "review",
          key: `exception-expiry:${key}`,
          after: exception.expiresOn,
          summary: `The exception for ${exception.controlId} expires in ${String(remaining)} day${remaining === 1 ? "" : "s"}.`
        })
      );
    }
  }

  const beforeFindings = new Map(before.findings.map((finding) => [findingKey(finding), finding]));
  const afterFindings = new Map(after.findings.map((finding) => [findingKey(finding), finding]));
  for (const key of [...new Set([...beforeFindings.keys(), ...afterFindings.keys()])].sort()) {
    const left = beforeFindings.get(key);
    const right = afterFindings.get(key);
    if (!left || !right) continue;
    if (left.decision !== right.decision) {
      const regressed = DECISION_RANK[right.decision] > DECISION_RANK[left.decision];
      events.push(
        event({
          type: regressed ? "decision_regressed" : "decision_resolved",
          severity: regressed ? "regression" : "resolution",
          key: `finding:${key}`,
          before: `${left.decision}:${left.outcome}`,
          after: `${right.decision}:${right.outcome}`,
          summary: `${right.controlId} for ${right.browser} changed from ${left.decision} to ${right.decision}.`
        })
      );
    } else if (left.outcome !== right.outcome) {
      events.push(
        event({
          type: "decision_context_changed",
          severity: "information",
          key: `finding:${key}`,
          before: left.outcome,
          after: right.outcome,
          summary: `${right.controlId} for ${right.browser} retained a ${right.decision} decision while its compatibility result changed.`
        })
      );
    }
  }

  const sorted = events
    .sort(
      (left, right) =>
        left.key.localeCompare(right.key) ||
        left.type.localeCompare(right.type) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, 512);
  const count = (severity: PolicyDriftEvent["severity"]): number =>
    sorted.filter((item) => item.severity === severity).length;

  return policyDriftComparisonSchema.parse({
    schemaVersion: 1,
    comparedAsOf,
    expiryWarningDays,
    sourceChanged:
      before.bcdVersion !== after.bcdVersion || before.catalogueVersion !== after.catalogueVersion,
    beforeProfileName: before.profile.name,
    afterProfileName: after.profile.name,
    summary: {
      regressions: count("regression"),
      resolutions: count("resolution"),
      review: count("review"),
      information: count("information"),
      expiringExceptions: sorted.filter((item) => item.type === "exception_expiring").length,
      totalEvents: sorted.length
    },
    events: sorted
  });
}
