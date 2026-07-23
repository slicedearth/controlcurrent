import { SECURITY_CONTROLS } from "./catalogue";
import {
  type EvidenceAttestationVerification,
  type EvidencePolicyException,
  type EvidencePolicyFinding,
  type EvidencePolicyEvaluation,
  type EvidencePolicyOutcome,
  type PolicyDecision,
  evidenceAttestationVerificationSchema,
  evidencePolicyEvaluationSchema,
  evidencePolicyProfileSchema
} from "./contracts";
import { absentEvidenceAttestation } from "./evidence-attestation";
import { EVIDENCE_COMPOSITE_IDS } from "./evidence-model";
import { validateEvidenceReport } from "./evidence-report";

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(value));
}

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

function dayIndex(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`) / DAY_MILLISECONDS;
}

function utcDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return new Date((dayIndex(value) + days) * DAY_MILLISECONDS).toISOString().slice(0, 10);
}

function attestationOutcome(attestation: EvidenceAttestationVerification): EvidencePolicyOutcome {
  switch (attestation.state) {
    case "verified":
      return "verified";
    case "absent":
      return "absent";
    case "signer_mismatch":
      return "signer_mismatch";
    case "digest_mismatch":
      return "digest_mismatch";
    case "identity_mismatch":
      return "identity_mismatch";
    case "statement_invalid":
      return "statement_invalid";
    case "trust_unavailable":
      return "trust_unavailable";
    case "unsupported":
      return "unsupported";
    case "invalid_bundle":
    case "verification_failed":
      return "invalid";
  }
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
  evaluatedAsOf: string,
  attestationInput?: unknown
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
  const suppliedAttestation = evidenceAttestationVerificationSchema.parse(
    attestationInput ?? absentEvidenceAttestation(report.reportFingerprint)
  );
  const fingerprintMatches = suppliedAttestation.reportFingerprint === report.reportFingerprint;
  const signerMatches =
    suppliedAttestation.state !== "verified" ||
    (suppliedAttestation.signer?.issuer === profile.attestation.certificateIssuer &&
      suppliedAttestation.signer.identity === profile.attestation.certificateIdentity);
  const attestation = !fingerprintMatches
    ? evidenceAttestationVerificationSchema.parse({
        ...suppliedAttestation,
        state: "digest_mismatch",
        reportFingerprint: report.reportFingerprint,
        explanation:
          "The attestation verification result describes a different reduced report fingerprint."
      })
    : !signerMatches
      ? evidenceAttestationVerificationSchema.parse({
          ...suppliedAttestation,
          state: "signer_mismatch",
          explanation:
            "The verified signer does not match the exact issuer and certificate identity required by policy."
        })
      : suppliedAttestation;
  const attestationDecision =
    attestation.state === "verified" ||
    (!profile.attestation.required && attestation.state === "absent")
      ? "pass"
      : "fail";
  findings.push({
    targetKind: "attestation",
    targetId: "sigstore-bundle",
    outcome: attestationOutcome(attestation),
    decision: attestationDecision,
    explanation:
      attestation.state === "absent" && !profile.attestation.required
        ? "The policy permits an unsigned reduced evidence report."
        : attestation.explanation
  });

  const inventory = report.scopeInventory;
  const inventoryPresent = inventory.state === "present";
  findings.push({
    targetKind: "inventory",
    targetId: "scope-inventory",
    outcome: inventoryPresent ? "observed" : "absent",
    decision: inventoryPresent || !profile.scopeInventory.required ? "pass" : "fail",
    explanation: inventoryPresent
      ? "The reduced report is bound to a supplied opaque scope inventory."
      : profile.scopeInventory.required
        ? "The policy requires a scope inventory, but the report does not contain one."
        : "The policy permits a report without a scope inventory."
  });

  if (inventory.state === "present") {
    const kindAllowed = profile.scopeInventory.allowedKinds.includes(inventory.kind);
    findings.push({
      targetKind: "inventory",
      targetId: "scope-kind",
      outcome: kindAllowed ? "observed" : "unsupported",
      decision: kindAllowed ? "pass" : "fail",
      explanation: kindAllowed
        ? `Scope inventory kind ${inventory.kind} is allowed.`
        : `Scope inventory kind ${inventory.kind} is not one of ${profile.scopeInventory.allowedKinds.join(", ")}.`
    });

    const completenessAllowed =
      !profile.scopeInventory.requireComplete || inventory.completeness === "complete";
    findings.push({
      targetKind: "inventory",
      targetId: "scope-completeness",
      outcome:
        inventory.completeness === "complete"
          ? "complete"
          : inventory.completeness === "partial"
            ? "partial"
            : "unknown",
      decision: completenessAllowed ? "pass" : "fail",
      explanation: completenessAllowed
        ? `Scope inventory completeness is ${inventory.completeness}.`
        : `The policy requires a complete scope inventory, but this inventory is ${inventory.completeness}.`
    });

    const exclusionCountAllowed =
      inventory.excludedEntries <= profile.scopeInventory.maxExcludedEntries;
    findings.push({
      targetKind: "inventory",
      targetId: "scope-exclusions",
      outcome: exclusionCountAllowed ? "observed" : "too_many_exclusions",
      decision: exclusionCountAllowed ? "pass" : "fail",
      explanation: exclusionCountAllowed
        ? `${String(inventory.excludedEntries)} excluded scope entries are within the ${String(profile.scopeInventory.maxExcludedEntries)}-entry limit.`
        : `${String(inventory.excludedEntries)} excluded scope entries exceed the ${String(profile.scopeInventory.maxExcludedEntries)}-entry limit.`
    });

    if (profile.scopeInventory.expectedFingerprint) {
      const inventoryMatches = inventory.fingerprint === profile.scopeInventory.expectedFingerprint;
      findings.push({
        targetKind: "inventory",
        targetId: "scope-fingerprint",
        outcome: inventoryMatches ? "observed" : "scope_mismatch",
        decision: inventoryMatches ? "pass" : "fail",
        explanation: inventoryMatches
          ? "Scope inventory fingerprint matches policy."
          : "Scope inventory fingerprint does not match the independently configured policy value."
      });
    }

    const generatedOn = utcDate(inventory.generatedAt);
    const inventoryAgeDays = dayIndex(evaluatedAsOf) - dayIndex(generatedOn);
    const inventoryFreshness =
      inventoryAgeDays < 0
        ? "future"
        : inventoryAgeDays > profile.scopeInventory.maxAgeDays
          ? "stale"
          : "observed";
    findings.push({
      targetKind: "inventory",
      targetId: "scope-age",
      outcome: inventoryFreshness,
      decision: inventoryFreshness === "observed" ? "pass" : "fail",
      explanation:
        inventoryFreshness === "future"
          ? `Scope inventory was generated on ${generatedOn}, after the ${evaluatedAsOf} evaluation date.`
          : inventoryFreshness === "stale"
            ? `Scope inventory was generated on ${generatedOn} and expired after ${addDays(generatedOn, profile.scopeInventory.maxAgeDays)} under the ${String(profile.scopeInventory.maxAgeDays)}-day policy.`
            : `Scope inventory was generated on ${generatedOn}, is ${String(inventoryAgeDays)} day${inventoryAgeDays === 1 ? "" : "s"} old, and remains within the ${String(profile.scopeInventory.maxAgeDays)}-day policy.`
    });
  }

  const applicationMatches =
    report.identity.subject.applicationId === profile.identity.applicationId;
  findings.push({
    targetKind: "identity",
    targetId: "application-id",
    outcome: applicationMatches ? "observed" : "identity_mismatch",
    decision: applicationMatches ? "pass" : "fail",
    explanation: applicationMatches
      ? `Application identity matches ${profile.identity.applicationId}.`
      : `Expected application ${profile.identity.applicationId} but the report describes ${report.identity.subject.applicationId}.`
  });

  const environmentAllowed = profile.identity.allowedEnvironments.includes(
    report.identity.subject.environment
  );
  findings.push({
    targetKind: "identity",
    targetId: "environment",
    outcome: environmentAllowed ? "observed" : "identity_mismatch",
    decision: environmentAllowed ? "pass" : "fail",
    explanation: environmentAllowed
      ? `Environment ${report.identity.subject.environment} is allowed.`
      : `Environment ${report.identity.subject.environment} is not one of ${profile.identity.allowedEnvironments.join(", ")}.`
  });

  if (profile.identity.expectedRevision) {
    const revisionMatches = report.identity.subject.revision === profile.identity.expectedRevision;
    findings.push({
      targetKind: "identity",
      targetId: "revision",
      outcome: revisionMatches ? "observed" : "identity_mismatch",
      decision: revisionMatches ? "pass" : "fail",
      explanation: revisionMatches
        ? `Revision matches ${profile.identity.expectedRevision}.`
        : `Expected revision ${profile.identity.expectedRevision} but the report describes ${report.identity.subject.revision}.`
    });
  }

  const producerAllowed = profile.identity.allowedProducerKinds.includes(
    report.identity.capture.producer.kind
  );
  findings.push({
    targetKind: "identity",
    targetId: "producer-kind",
    outcome: producerAllowed ? "observed" : "identity_mismatch",
    decision: producerAllowed ? "pass" : "fail",
    explanation: producerAllowed
      ? `Producer kind ${report.identity.capture.producer.kind} is allowed.`
      : `Producer kind ${report.identity.capture.producer.kind} is not one of ${profile.identity.allowedProducerKinds.join(", ")}.`
  });

  if (profile.identity.requireBuildId) {
    const buildIdPresent = report.identity.subject.buildId !== undefined;
    findings.push({
      targetKind: "identity",
      targetId: "build-id",
      outcome: buildIdPresent ? "observed" : "missing",
      decision: buildIdPresent ? "pass" : "fail",
      explanation: buildIdPresent
        ? "A bounded build identifier is present."
        : "The policy requires a build identifier, but the report does not contain one."
    });
  }

  const captureDurationMilliseconds =
    Date.parse(report.identity.capture.completedAt) - Date.parse(report.identity.capture.startedAt);
  const captureDurationMinutes = Math.ceil(captureDurationMilliseconds / (60 * 1_000));
  const captureWindowAllowed =
    captureDurationMilliseconds <= profile.identity.maxCaptureDurationMinutes * 60 * 1_000;
  findings.push({
    targetKind: "freshness",
    targetId: "capture-window",
    outcome: captureWindowAllowed ? "observed" : "window_too_long",
    decision: captureWindowAllowed ? "pass" : "fail",
    explanation: captureWindowAllowed
      ? `The ${String(captureDurationMinutes)}-minute capture window is within the ${String(profile.identity.maxCaptureDurationMinutes)}-minute limit.`
      : `The ${String(captureDurationMinutes)}-minute capture window exceeds the ${String(profile.identity.maxCaptureDurationMinutes)}-minute limit.`
  });

  const capturedOn = utcDate(report.identity.capture.completedAt);
  const evidenceAgeDays = dayIndex(evaluatedAsOf) - dayIndex(capturedOn);
  const freshnessOutcome =
    evidenceAgeDays < 0
      ? "future"
      : evidenceAgeDays > profile.identity.maxAgeDays
        ? "stale"
        : "observed";
  findings.push({
    targetKind: "freshness",
    targetId: "capture-age",
    outcome: freshnessOutcome,
    decision: freshnessOutcome === "observed" ? "pass" : "fail",
    explanation:
      freshnessOutcome === "future"
        ? `Evidence completed on ${capturedOn}, after the ${evaluatedAsOf} evaluation date.`
        : freshnessOutcome === "stale"
          ? `Evidence completed on ${capturedOn} and expired after ${addDays(capturedOn, profile.identity.maxAgeDays)} under the ${String(profile.identity.maxAgeDays)}-day policy.`
          : `Evidence completed on ${capturedOn}, is ${String(evidenceAgeDays)} day${evidenceAgeDays === 1 ? "" : "s"} old, and remains within the ${String(profile.identity.maxAgeDays)}-day policy.`
  });

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
    schemaVersion: 4,
    evaluatedAsOf,
    reportFingerprint: report.reportFingerprint,
    reportIdentity: report.identity,
    reportScopeInventory: report.scopeInventory,
    reportProvenance: report.provenance,
    attestation,
    profile,
    summary: {
      pass: findings.filter((finding) => finding.decision === "pass").length,
      review: findings.filter((finding) => finding.decision === "review").length,
      fail: findings.filter((finding) => finding.decision === "fail").length
    },
    findings
  });
}
