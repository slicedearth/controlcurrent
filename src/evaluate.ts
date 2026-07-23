import {
  type BrowserBaseline,
  type ControlEvaluation,
  deploymentProfileSchema,
  type FeatureEvaluation,
  type Outcome,
  profileEvaluationSchema,
  type ProfileEvaluation,
  type SelectedFeature,
  selectedSnapshotSchema,
  type SupportStatement
} from "./contracts";
import { SECURITY_CONTROLS, type SecurityControl } from "./catalogue";
import { compareBrowserVersions, thresholdState } from "./versions";

function notesToArray(notes: SupportStatement["notes"]): string[] {
  if (notes === undefined) return [];
  return Array.isArray(notes) ? [...notes] : [notes];
}

function statementQualifications(statement: SupportStatement): string[] {
  const qualifications: string[] = [];
  if (statement.partial_implementation) qualifications.push("Partial implementation");
  if (statement.flags) {
    for (const flag of statement.flags) {
      qualifications.push(`Requires ${flag.type.replace("_", " ")}: ${flag.name}`);
    }
  }
  if (statement.prefix) qualifications.push(`Uses prefix ${statement.prefix}`);
  if (statement.alternative_name) {
    qualifications.push(`Uses alternative name ${statement.alternative_name}`);
  }
  qualifications.push(...notesToArray(statement.notes));
  return qualifications;
}

function evaluateStatement(
  baseline: string,
  statement: SupportStatement
): { outcome: Outcome; qualifications: string[] } {
  const qualifications = statementQualifications(statement);
  const added = statement.version_added;

  if (added === false) return { outcome: "unavailable", qualifications };
  if (added === null) {
    return {
      outcome: "unknown",
      qualifications: [...qualifications, "BCD does not identify a support version"]
    };
  }
  if (added === true) {
    return {
      outcome: "available_with_qualification",
      qualifications: [...qualifications, "Supported, but the first version is unknown"]
    };
  }

  const addedState = thresholdState(baseline, added);
  if (addedState === "not_met") return { outcome: "unavailable", qualifications };
  if (addedState === "uncertain") {
    return {
      outcome: "unknown",
      qualifications: [...qualifications, `Support begins at an imprecise version: ${added}`]
    };
  }
  if (added.startsWith("≤") || added.includes("-")) {
    qualifications.push(`BCD records an imprecise first version: ${added}`);
  }

  if (statement.version_removed) {
    const removedState = thresholdState(baseline, statement.version_removed);
    if (removedState === "met") {
      return {
        outcome: "removed",
        qualifications: [...qualifications, `Support was removed in ${statement.version_removed}`]
      };
    }
    if (removedState === "uncertain") {
      return {
        outcome: "unknown",
        qualifications: [
          ...qualifications,
          `The removal version cannot be compared: ${statement.version_removed}`
        ]
      };
    }
  }

  if (statement.version_last) {
    const relation = compareBrowserVersions(baseline, statement.version_last);
    if (relation === "after") {
      return {
        outcome: "removed",
        qualifications: [
          ...qualifications,
          `The last supported version is ${statement.version_last}`
        ]
      };
    }
    if (relation === "unknown") {
      return {
        outcome: "unknown",
        qualifications: [
          ...qualifications,
          `The last supported version cannot be compared: ${statement.version_last}`
        ]
      };
    }
  }

  return {
    outcome: qualifications.length === 0 ? "available_unqualified" : "available_with_qualification",
    qualifications
  };
}

const preference: readonly Outcome[] = [
  "available_unqualified",
  "available_with_qualification",
  "unknown",
  "removed",
  "unavailable",
  "source_inconsistent",
  "unsupported_mapping"
];

function selectBestOutcome(outcomes: readonly Outcome[]): Outcome {
  return preference.find((candidate) => outcomes.includes(candidate)) ?? "source_inconsistent";
}

export function evaluateFeature(
  feature: SelectedFeature,
  baseline: BrowserBaseline
): FeatureEvaluation {
  const statements = feature.support[baseline.browser];
  if (!statements || statements.length === 0) {
    return {
      path: feature.path,
      browser: baseline.browser,
      minimumVersion: baseline.minimumVersion,
      outcome: "unknown",
      qualifications: ["BCD has no support statement for this browser"],
      ...(feature.mdnUrl ? { sourceUrl: feature.mdnUrl } : {})
    };
  }

  const evaluated = statements.map((statement) =>
    evaluateStatement(baseline.minimumVersion, statement)
  );
  const outcome = selectBestOutcome(evaluated.map((item) => item.outcome));
  const qualifications = [
    ...new Set(
      evaluated.filter((item) => item.outcome === outcome).flatMap((item) => item.qualifications)
    )
  ].slice(0, 64);

  return {
    path: feature.path,
    browser: baseline.browser,
    minimumVersion: baseline.minimumVersion,
    outcome,
    statements,
    qualifications,
    ...(feature.mdnUrl ? { sourceUrl: feature.mdnUrl } : {})
  };
}

function combineFeatureOutcomes(
  control: SecurityControl,
  evaluations: readonly FeatureEvaluation[]
): Outcome {
  if (control.mappingState === "unsupported") return "unsupported_mapping";
  if (evaluations.length !== control.bcdPaths.length || evaluations.length === 0) {
    return "source_inconsistent";
  }

  const outcomes = evaluations.map((evaluation) => evaluation.outcome);
  if (control.combination === "any") {
    return selectBestOutcome(outcomes);
  }

  if (outcomes.includes("source_inconsistent")) return "source_inconsistent";
  if (outcomes.includes("unsupported_mapping")) return "unsupported_mapping";
  if (outcomes.includes("unknown")) return "unknown";
  if (outcomes.includes("removed")) return "removed";
  if (outcomes.includes("unavailable")) return "unavailable";
  if (outcomes.includes("available_with_qualification")) {
    return "available_with_qualification";
  }
  return "available_unqualified";
}

function explainOutcome(outcome: Outcome, control: SecurityControl): string {
  switch (outcome) {
    case "available_unqualified":
      return "Every required mapped BCD feature is available without a recorded qualification.";
    case "available_with_qualification":
      return "Every required mapped feature is available, but BCD records one or more qualifications.";
    case "unavailable":
      return "At least one required mapped feature is not available at this browser baseline.";
    case "removed":
      return "At least one required mapped feature was removed by this browser baseline.";
    case "unknown":
      return "BCD does not provide enough comparable support data for this browser baseline.";
    case "unsupported_mapping":
      return (
        control.mappingNote ??
        "The catalogue does not have sufficient BCD data to calculate this control."
      );
    case "source_inconsistent":
      return "The selected BCD subset is missing or inconsistent with the catalogue mapping.";
  }
}

export function evaluateControl(
  control: SecurityControl,
  snapshotInput: unknown,
  baseline: BrowserBaseline
): ControlEvaluation {
  const snapshot = selectedSnapshotSchema.parse(snapshotInput);
  const featureEvaluations =
    control.mappingState === "active"
      ? control.bcdPaths.flatMap((path) => {
          const feature = snapshot.features[path];
          return feature ? [evaluateFeature(feature, baseline)] : [];
        })
      : [];
  const outcome = combineFeatureOutcomes(control, featureEvaluations);
  return {
    controlId: control.id,
    browser: baseline.browser,
    minimumVersion: baseline.minimumVersion,
    outcome,
    featureEvaluations,
    explanation: explainOutcome(outcome, control)
  };
}

export function evaluateProfile(snapshotInput: unknown, profileInput: unknown): ProfileEvaluation {
  const snapshot = selectedSnapshotSchema.parse(snapshotInput);
  const profile = deploymentProfileSchema.parse(profileInput);
  const results = Object.fromEntries(
    SECURITY_CONTROLS.map((control) => [
      control.id,
      profile.baselines.map((baseline) => evaluateControl(control, snapshot, baseline))
    ])
  );

  return profileEvaluationSchema.parse({
    schemaVersion: 1,
    bcdVersion: snapshot.bcdVersion,
    bcdTimestamp: snapshot.bcdTimestamp,
    catalogueVersion: snapshot.catalogueVersion,
    profile,
    results
  });
}
