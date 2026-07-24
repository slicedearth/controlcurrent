import { BROWSER_IDS } from "./browsers";
import { SECURITY_CONTROLS } from "./catalogue";
import { canonicalJson } from "./canonical";
import {
  deploymentProfileSchema,
  type DeploymentProfile,
  type Outcome,
  profileComparisonSchema,
  type ProfileComparison,
  profileEvaluationSchema,
  type ProfileEvaluation
} from "./contracts";
import { outcomeLabels } from "./format";

export const MAX_PROFILE_IMPORT_BYTES = 512 * 1_024;
export const MAX_ENGINEERING_REPORT_BYTES = 512 * 1_024;

const availableOutcomes = new Set<Outcome>([
  "available_unqualified",
  "available_with_qualification"
]);

export function importDeploymentProfile(contents: string): DeploymentProfile {
  if (new TextEncoder().encode(contents).byteLength > MAX_PROFILE_IMPORT_BYTES) {
    throw new Error(`Profile import exceeds the ${String(MAX_PROFILE_IMPORT_BYTES)}-byte limit.`);
  }
  const parsed = JSON.parse(contents) as unknown;
  const direct = deploymentProfileSchema.safeParse(parsed);
  if (direct.success) return direct.data;
  return profileEvaluationSchema.parse(parsed).profile;
}

function evaluationMap(
  evaluation: ProfileEvaluation
): Map<string, ProfileEvaluation["results"][string][number]> {
  const map = new Map<string, ProfileEvaluation["results"][string][number]>();
  for (const evaluations of Object.values(evaluation.results)) {
    for (const item of evaluations) map.set(`${item.controlId}\0${item.browser}`, item);
  }
  return map;
}

function eventType(before: Outcome, after: Outcome): ProfileComparison["events"][number]["type"] {
  if (!availableOutcomes.has(before) && availableOutcomes.has(after)) return "gained";
  if (availableOutcomes.has(before) && !availableOutcomes.has(after)) return "lost";
  if (before === "available_unqualified" && after === "available_with_qualification") {
    return "newly_qualified";
  }
  if (before === "available_with_qualification" && after === "available_unqualified") {
    return "qualification_removed";
  }
  return "changed";
}

function summaryFor(
  type: ProfileComparison["events"][number]["type"],
  beforeOutcome: Outcome | undefined,
  afterOutcome: Outcome | undefined,
  beforeVersion: string | undefined,
  afterVersion: string | undefined
): string {
  switch (type) {
    case "scope_added":
      return `Browser ${afterVersion ?? "unknown"} entered the compared profile.`;
    case "scope_removed":
      return `Browser ${beforeVersion ?? "unknown"} left the compared profile.`;
    case "baseline_changed":
      return `The browser minimum changed from ${beforeVersion ?? "unknown"} to ${afterVersion ?? "unknown"} without changing the compatibility outcome.`;
    default:
      return `${beforeOutcome ? outcomeLabels[beforeOutcome] : "Not evaluated"} became ${afterOutcome ? outcomeLabels[afterOutcome] : "not evaluated"}.`;
  }
}

export function compareProfileEvaluations(
  beforeInput: unknown,
  afterInput: unknown
): ProfileComparison {
  const before = profileEvaluationSchema.parse(beforeInput);
  const after = profileEvaluationSchema.parse(afterInput);
  if (
    before.bcdVersion !== after.bcdVersion ||
    before.catalogueVersion !== after.catalogueVersion
  ) {
    throw new Error(
      "Profiles must use the same BCD and catalogue versions for semantic comparison."
    );
  }

  const beforeMap = evaluationMap(before);
  const afterMap = evaluationMap(after);
  const events: ProfileComparison["events"] = [];
  let unchanged = 0;

  for (const control of SECURITY_CONTROLS) {
    for (const browser of BROWSER_IDS) {
      const key = `${control.id}\0${browser}`;
      const beforeItem = beforeMap.get(key);
      const afterItem = afterMap.get(key);
      if (!beforeItem && !afterItem) continue;

      let type: ProfileComparison["events"][number]["type"] | undefined;
      if (!beforeItem) type = "scope_added";
      else if (!afterItem) type = "scope_removed";
      else if (beforeItem.outcome !== afterItem.outcome) {
        type = eventType(beforeItem.outcome, afterItem.outcome);
      } else if (beforeItem.minimumVersion !== afterItem.minimumVersion) {
        type = "baseline_changed";
      } else {
        unchanged += 1;
      }
      if (!type) continue;

      events.push({
        type,
        controlId: control.id,
        browser,
        ...(beforeItem
          ? {
              beforeVersion: beforeItem.minimumVersion,
              beforeOutcome: beforeItem.outcome
            }
          : {}),
        ...(afterItem
          ? {
              afterVersion: afterItem.minimumVersion,
              afterOutcome: afterItem.outcome
            }
          : {}),
        summary: summaryFor(
          type,
          beforeItem?.outcome,
          afterItem?.outcome,
          beforeItem?.minimumVersion,
          afterItem?.minimumVersion
        )
      });
    }
  }

  const count = (type: ProfileComparison["events"][number]["type"]): number =>
    events.filter((event) => event.type === type).length;

  return profileComparisonSchema.parse({
    schemaVersion: 1,
    bcdVersion: before.bcdVersion,
    catalogueVersion: before.catalogueVersion,
    beforeProfile: before.profile,
    afterProfile: after.profile,
    summary: {
      gained: count("gained"),
      lost: count("lost"),
      newlyQualified: count("newly_qualified"),
      qualificationRemoved: count("qualification_removed"),
      changed: count("changed"),
      baselineChanged: count("baseline_changed"),
      scopeAdded: count("scope_added"),
      scopeRemoved: count("scope_removed"),
      unchanged
    },
    events
  });
}

function markdown(value: string): string {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127) ? " " : character;
    })
    .join("")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll(/([`*_{}[\]()#+.!<>-])/gu, "\\$1")
    .trim();
}

function outcomeCounts(evaluation: ProfileEvaluation): Map<Outcome, number> {
  const counts = new Map<Outcome, number>();
  for (const evaluations of Object.values(evaluation.results)) {
    for (const item of evaluations) counts.set(item.outcome, (counts.get(item.outcome) ?? 0) + 1);
  }
  return counts;
}

export function exportEngineeringReport(
  evaluationInput: unknown,
  comparisonInput?: unknown
): string {
  const evaluation = profileEvaluationSchema.parse(evaluationInput);
  const comparison =
    comparisonInput === undefined ? undefined : profileComparisonSchema.parse(comparisonInput);
  if (
    comparison &&
    (comparison.bcdVersion !== evaluation.bcdVersion ||
      comparison.catalogueVersion !== evaluation.catalogueVersion ||
      canonicalJson(comparison.afterProfile) !== canonicalJson(evaluation.profile))
  ) {
    throw new Error("The comparison does not end at the exported profile evaluation.");
  }

  const counts = outcomeCounts(evaluation);
  const lines = [
    "# ControlCurrent engineering report",
    "",
    "## Source",
    "",
    `- BCD: ${markdown(evaluation.bcdVersion)}`,
    `- BCD timestamp: ${markdown(evaluation.bcdTimestamp)}`,
    `- Catalogue: ${markdown(evaluation.catalogueVersion)}`,
    "",
    "## Deployment profile",
    "",
    `**${markdown(evaluation.profile.name)}**`,
    "",
    ...evaluation.profile.baselines.map(
      (baseline) => `- ${markdown(baseline.browser)} >= ${markdown(baseline.minimumVersion)}`
    ),
    "",
    "## Outcome summary",
    "",
    "| Outcome | Browser-control results |",
    "| --- | ---: |",
    ...Object.entries(outcomeLabels).map(
      ([outcome, label]) =>
        `| ${markdown(label)} | ${String(counts.get(outcome as Outcome) ?? 0)} |`
    )
  ];

  const attention = Object.values(evaluation.results)
    .flat()
    .filter((item) => item.outcome !== "available_unqualified");
  lines.push("", "## Results requiring context", "");
  if (attention.length === 0) {
    lines.push(
      "No qualified, unavailable, removed, unknown, unsupported, or inconsistent results."
    );
  } else {
    lines.push("| Control | Browser minimum | Outcome |", "| --- | --- | --- |");
    for (const item of attention) {
      lines.push(
        `| ${markdown(item.controlId)} | ${markdown(item.browser)} ${markdown(item.minimumVersion)} | ${markdown(outcomeLabels[item.outcome])} |`
      );
    }
  }

  if (comparison) {
    lines.push(
      "",
      "## Comparison",
      "",
      `Compared **${markdown(comparison.beforeProfile.name)}** with **${markdown(comparison.afterProfile.name)}**.`,
      "",
      `- Gained: ${String(comparison.summary.gained)}`,
      `- Lost: ${String(comparison.summary.lost)}`,
      `- Newly qualified: ${String(comparison.summary.newlyQualified)}`,
      `- Qualifications removed: ${String(comparison.summary.qualificationRemoved)}`,
      `- Other outcome changes: ${String(comparison.summary.changed)}`,
      `- Baseline-only changes: ${String(comparison.summary.baselineChanged)}`,
      `- Added-scope results: ${String(comparison.summary.scopeAdded)}`,
      `- Removed-scope results: ${String(comparison.summary.scopeRemoved)}`
    );
  }

  lines.push(
    "",
    "## Limitations",
    "",
    "Compatibility evidence does not establish correct configuration, runtime enforcement, collection completeness, or production security.",
    ""
  );
  const report = lines.join("\n");
  if (new TextEncoder().encode(report).byteLength > MAX_ENGINEERING_REPORT_BYTES) {
    throw new Error(
      `Engineering report exceeds the ${String(MAX_ENGINEERING_REPORT_BYTES)}-byte limit.`
    );
  }
  return report;
}
