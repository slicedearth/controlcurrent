import { SECURITY_CONTROLS } from "./catalogue";
import {
  type EvidencePolicyException,
  type EvidencePolicyFinding,
  type EvidencePolicyEvaluation,
  type EvidencePolicyOutcome,
  type PolicyDecision,
  evidencePolicyEvaluationSchema,
  evidencePolicyProfileSchema
} from "./contracts";
import { EVIDENCE_COMPOSITE_IDS } from "./evidence-model";
import { validateEvidenceReport } from "./evidence-report";

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(value));
}

function matchingException(
  exceptions: readonly EvidencePolicyException[],
  surfaceId: string,
  targetKind: EvidencePolicyException["targetKind"],
  targetId: string,
  outcome: EvidencePolicyOutcome
): EvidencePolicyException | undefined {
  return exceptions.find(
    (candidate) =>
      candidate.surfaceId === surfaceId &&
      candidate.targetKind === targetKind &&
      candidate.targetId === targetId &&
      candidate.outcomes.includes(outcome)
  );
}

function withException(
  finding: Omit<EvidencePolicyFinding, "decision">,
  baseDecision: PolicyDecision,
  exceptions: readonly EvidencePolicyException[],
  evaluatedAsOf: string
): EvidencePolicyFinding {
  const exception =
    finding.surfaceId && ["evidence", "control", "composite"].includes(finding.targetKind)
      ? matchingException(
          exceptions,
          finding.surfaceId,
          finding.targetKind as EvidencePolicyException["targetKind"],
          finding.targetId,
          finding.outcome
        )
      : undefined;
  const exceptionState = exception
    ? exception.expiresOn >= evaluatedAsOf
      ? "active"
      : "expired"
    : undefined;
  return {
    ...finding,
    decision: exceptionState === "active" && baseDecision !== "pass" ? "review" : baseDecision,
    ...(exceptionState ? { exceptionState } : {}),
    ...(exception
      ? {
          exceptionReason: exception.reason,
          exceptionExpiresOn: exception.expiresOn
        }
      : {})
  };
}

export async function evaluateEvidencePolicy(
  reportInput: unknown,
  profileInput: unknown,
  evaluatedAsOf: string
): Promise<EvidencePolicyEvaluation> {
  const report = await validateEvidenceReport(reportInput);
  const profile = evidencePolicyProfileSchema.parse(profileInput);
  if (!validDate(evaluatedAsOf)) {
    throw new Error(`Invalid evaluation date: ${evaluatedAsOf}`);
  }

  const knownControls = new Set<string>(SECURITY_CONTROLS.map((control) => control.id));
  const knownComposites = new Set<string>(EVIDENCE_COMPOSITE_IDS);
  for (const surface of profile.surfaces) {
    for (const controlId of surface.requiredControls) {
      if (!knownControls.has(controlId)) {
        throw new Error(`Unknown required control on policy surface ${surface.id}: ${controlId}`);
      }
    }
    for (const compositeId of surface.requiredComposites) {
      if (!knownComposites.has(compositeId)) {
        throw new Error(
          `Unknown required composite on policy surface ${surface.id}: ${compositeId}`
        );
      }
    }
  }

  const findings: EvidencePolicyFinding[] = [];
  const modelChecks = [
    {
      targetId: "analysis-version",
      expected: profile.expectedAnalyserVersion,
      observed: report.provenance.analyserVersion,
      explanation: "Evidence analyser version"
    },
    {
      targetId: "catalogue-version",
      expected: profile.expectedCatalogueVersion,
      observed: report.provenance.catalogueVersion,
      explanation: "Control catalogue version"
    },
    ...(profile.expectedBcdVersion
      ? [
          {
            targetId: "bcd-version",
            expected: profile.expectedBcdVersion,
            observed: report.provenance.bcdVersion,
            explanation: "BCD source version"
          }
        ]
      : [])
  ];
  for (const check of modelChecks) {
    const matches = check.expected === check.observed;
    findings.push({
      targetKind: "model",
      targetId: check.targetId,
      outcome: matches ? "observed" : "model_mismatch",
      decision: matches ? "pass" : "fail",
      explanation: matches
        ? `${check.explanation} matches ${check.expected}.`
        : `${check.explanation} expected ${check.expected} but the report uses ${check.observed}.`
    });
  }

  const coverageBySurface = new Map(
    report.surfaceCoverage.map((surface) => [surface.surfaceId, surface])
  );
  const assessmentsBySurface = new Map(
    report.surfaceAssessments.map((surface) => [surface.surfaceId, surface])
  );
  for (const expected of profile.surfaces) {
    const coverage = coverageBySurface.get(expected.id);
    const assessment = assessmentsBySurface.get(expected.id);
    if (!coverage || !assessment) {
      findings.push({
        surfaceId: expected.id,
        targetKind: "surface",
        targetId: expected.id,
        outcome: "absent",
        decision: "fail",
        explanation: "The required surface is absent from the reduced evidence report."
      });
      continue;
    }
    findings.push({
      surfaceId: expected.id,
      targetKind: "surface",
      targetId: expected.id,
      outcome:
        coverage.role === expected.role && assessment.role === expected.role
          ? "observed"
          : "role_mismatch",
      decision:
        coverage.role === expected.role && assessment.role === expected.role ? "pass" : "fail",
      explanation:
        coverage.role === expected.role && assessment.role === expected.role
          ? `Surface role matches ${expected.role}.`
          : `Expected role ${expected.role}; report roles are ${coverage.role} and ${assessment.role}.`
    });

    for (const evidenceKind of expected.requiredEvidence) {
      const present = coverage.observedEvidence.includes(evidenceKind);
      findings.push(
        withException(
          {
            surfaceId: expected.id,
            targetKind: "evidence",
            targetId: evidenceKind,
            outcome: present ? "complete" : "missing",
            explanation: present
              ? `Required ${evidenceKind} evidence is present.`
              : `Required ${evidenceKind} evidence is missing.`
          },
          present ? "pass" : "fail",
          profile.exceptions,
          evaluatedAsOf
        )
      );
    }

    for (const controlId of expected.requiredControls) {
      const finding = assessment.findings.find((candidate) => candidate.controlId === controlId);
      const outcome = finding?.state ?? "not_applicable";
      const decision: PolicyDecision =
        outcome === "observed"
          ? "pass"
          : outcome === "missing"
            ? profile.rules.missing
            : outcome === "report_only"
              ? profile.rules.reportOnly
              : outcome === "inconclusive"
                ? profile.rules.inconclusive
                : outcome === "not_evaluated"
                  ? profile.rules.notEvaluated
                  : "fail";
      findings.push(
        withException(
          {
            surfaceId: expected.id,
            targetKind: "control",
            targetId: controlId,
            outcome,
            explanation:
              finding?.summary ?? "The report did not evaluate this required surface control."
          },
          decision,
          profile.exceptions,
          evaluatedAsOf
        )
      );
    }

    for (const compositeId of expected.requiredComposites) {
      const composite = assessment.composites.find((candidate) => candidate.id === compositeId);
      const outcome = composite?.state ?? "not_applicable";
      const decision: PolicyDecision =
        outcome === "satisfied"
          ? "pass"
          : outcome === "review"
            ? profile.rules.compositeReview
            : "fail";
      findings.push(
        withException(
          {
            surfaceId: expected.id,
            targetKind: "composite",
            targetId: compositeId,
            outcome,
            explanation:
              composite?.summary ?? "The report did not evaluate this required surface composite."
          },
          decision,
          profile.exceptions,
          evaluatedAsOf
        )
      );
    }
  }

  return evidencePolicyEvaluationSchema.parse({
    schemaVersion: 1,
    evaluatedAsOf,
    reportFingerprint: report.reportFingerprint,
    reportProvenance: report.provenance,
    profile,
    summary: {
      pass: findings.filter((finding) => finding.decision === "pass").length,
      review: findings.filter((finding) => finding.decision === "review").length,
      fail: findings.filter((finding) => finding.decision === "fail").length
    },
    findings
  });
}
