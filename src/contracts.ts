import { z } from "zod";
import { BROWSER_IDS } from "./browsers";

export const browserIdSchema = z.enum(BROWSER_IDS);
export type BrowserId = z.infer<typeof browserIdSchema>;

export const outcomeSchema = z.enum([
  "available_unqualified",
  "available_with_qualification",
  "unavailable",
  "removed",
  "unknown",
  "unsupported_mapping",
  "source_inconsistent"
]);
export type Outcome = z.infer<typeof outcomeSchema>;

const boundedText = z.string().max(2_048);
const boundedUrl = z.url().max(2_048);

export const flagSchema = z
  .object({
    type: z.enum(["preference", "runtime_flag"]),
    name: z.string().min(1).max(256),
    value_to_set: z.string().max(256).optional()
  })
  .strict();

export const supportStatementSchema = z
  .object({
    version_added: z.union([z.string().max(64), z.boolean(), z.null()]),
    version_removed: z.string().max(64).optional(),
    version_last: z.string().max(64).optional(),
    prefix: z.string().max(64).optional(),
    alternative_name: z.string().max(128).optional(),
    flags: z.array(flagSchema).max(16).optional(),
    impl_url: z.union([boundedUrl, z.array(boundedUrl).min(2).max(16)]).optional(),
    partial_implementation: z.literal(true).optional(),
    notes: z.union([boundedText, z.array(boundedText).min(2).max(32)]).optional()
  })
  .strict();
export type SupportStatement = z.infer<typeof supportStatementSchema>;

export const supportStatementsSchema = z.array(supportStatementSchema).min(1).max(32);

export const selectedFeatureSchema = z
  .object({
    path: z.string().min(1).max(256),
    sourceFile: z.string().min(1).max(512),
    description: boundedText.optional(),
    mdnUrl: boundedUrl.optional(),
    specUrls: z.array(boundedUrl).max(16),
    status: z
      .object({
        deprecated: z.boolean(),
        experimental: z.boolean(),
        standardTrack: z.boolean()
      })
      .strict()
      .optional(),
    baseline: z
      .array(
        z
          .object({
            featureId: z.string().min(1).max(128),
            name: z.string().min(1).max(256),
            status: z.union([z.literal(false), z.enum(["low", "high"])]),
            lowDate: z.iso.date().optional(),
            highDate: z.iso.date().optional()
          })
          .strict()
      )
      .max(8),
    support: z.partialRecord(browserIdSchema, supportStatementsSchema)
  })
  .strict();
export type SelectedFeature = z.infer<typeof selectedFeatureSchema>;

export const browserReleaseSchema = z
  .object({
    version: z.string().min(1).max(64),
    status: z.enum(["retired", "current", "beta", "nightly", "esr", "planned"]),
    releaseDate: z.iso.date().optional()
  })
  .strict();

export const selectedBrowserSchema = z
  .object({
    id: browserIdSchema,
    name: z.string().min(1).max(64),
    upstream: z.string().max(64).optional(),
    releases: z.array(browserReleaseSchema).max(500)
  })
  .strict();

export const controlMappingSchema = z
  .object({
    controlId: z.string().min(1).max(80),
    mappingState: z.enum(["active", "unsupported"]),
    combination: z.enum(["all", "any"]),
    paths: z.array(z.string().min(1).max(256)).max(8)
  })
  .strict();

export const selectedSnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    bcdVersion: z.string().min(1).max(64),
    bcdTimestamp: z.iso.datetime(),
    webFeaturesVersion: z.string().min(1).max(64),
    catalogueVersion: z.string().min(1).max(64),
    schemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    browsers: z.record(browserIdSchema, selectedBrowserSchema),
    controlMappings: z.array(controlMappingSchema).max(64),
    features: z.record(z.string(), selectedFeatureSchema)
  })
  .strict();
export type SelectedSnapshot = z.infer<typeof selectedSnapshotSchema>;

export const browserBaselineSchema = z
  .object({
    browser: browserIdSchema,
    minimumVersion: z.string().min(1).max(64)
  })
  .strict();
export type BrowserBaseline = z.infer<typeof browserBaselineSchema>;

export const deploymentProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    baselines: z.array(browserBaselineSchema).min(1).max(BROWSER_IDS.length)
  })
  .strict()
  .superRefine((profile, context) => {
    const seen = new Set<string>();
    for (const [index, baseline] of profile.baselines.entries()) {
      if (seen.has(baseline.browser)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate browser baseline: ${baseline.browser}`,
          path: ["baselines", index, "browser"]
        });
      }
      seen.add(baseline.browser);
    }
  });
export type DeploymentProfile = z.infer<typeof deploymentProfileSchema>;

export const featureEvaluationSchema = z
  .object({
    path: z.string().min(1).max(256),
    browser: browserIdSchema,
    minimumVersion: z.string().min(1).max(64),
    outcome: outcomeSchema,
    statements: supportStatementsSchema.optional(),
    qualifications: z.array(z.string().max(512)).max(64),
    sourceUrl: boundedUrl.optional()
  })
  .strict();
export type FeatureEvaluation = z.infer<typeof featureEvaluationSchema>;

export const controlEvaluationSchema = z
  .object({
    controlId: z.string().min(1).max(80),
    browser: browserIdSchema,
    minimumVersion: z.string().min(1).max(64),
    outcome: outcomeSchema,
    featureEvaluations: z.array(featureEvaluationSchema).max(8),
    explanation: z.string().min(1).max(1_024)
  })
  .strict();
export type ControlEvaluation = z.infer<typeof controlEvaluationSchema>;

export const profileEvaluationSchema = z
  .object({
    schemaVersion: z.literal(1),
    bcdVersion: z.string().min(1).max(64),
    bcdTimestamp: z.iso.datetime(),
    catalogueVersion: z.string().min(1).max(64),
    profile: deploymentProfileSchema,
    results: z.record(z.string(), z.array(controlEvaluationSchema).max(BROWSER_IDS.length))
  })
  .strict();
export type ProfileEvaluation = z.infer<typeof profileEvaluationSchema>;

export const policyDecisionSchema = z.enum(["pass", "review", "fail"]);
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;

export const policyRuleSchema = z.enum(["review", "fail"]);

export const policyExceptionSchema = z
  .object({
    controlId: z.string().min(1).max(80),
    browsers: z.array(browserIdSchema).min(1).max(BROWSER_IDS.length).optional(),
    outcomes: z.array(outcomeSchema).min(1).max(7),
    reason: z.string().trim().min(8).max(512),
    expiresOn: z.iso.date()
  })
  .strict();
export type PolicyException = z.infer<typeof policyExceptionSchema>;

export const policyProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    baselines: z.array(browserBaselineSchema).min(1).max(BROWSER_IDS.length),
    requiredControls: z.array(z.string().min(1).max(80)).min(1).max(64),
    rules: z
      .object({
        qualifications: policyRuleSchema,
        unknown: policyRuleSchema,
        unsupported: policyRuleSchema
      })
      .strict(),
    exceptions: z.array(policyExceptionSchema).max(64).default([])
  })
  .strict()
  .superRefine((profile, context) => {
    const browsers = new Set<string>();
    for (const [index, baseline] of profile.baselines.entries()) {
      if (browsers.has(baseline.browser)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate browser baseline: ${baseline.browser}`,
          path: ["baselines", index, "browser"]
        });
      }
      browsers.add(baseline.browser);
    }

    const controls = new Set<string>();
    for (const [index, controlId] of profile.requiredControls.entries()) {
      if (controls.has(controlId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate required control: ${controlId}`,
          path: ["requiredControls", index]
        });
      }
      controls.add(controlId);
    }
  });
export type PolicyProfile = z.infer<typeof policyProfileSchema>;

export const policyFindingSchema = z
  .object({
    controlId: z.string().min(1).max(80),
    browser: browserIdSchema,
    minimumVersion: z.string().min(1).max(64),
    outcome: outcomeSchema,
    decision: policyDecisionSchema,
    explanation: z.string().min(1).max(1_024),
    exceptionState: z.enum(["active", "expired"]).optional(),
    exceptionReason: z.string().max(512).optional(),
    exceptionExpiresOn: z.iso.date().optional()
  })
  .strict();
export type PolicyFinding = z.infer<typeof policyFindingSchema>;

export const policyEvaluationSchema = z
  .object({
    schemaVersion: z.literal(1),
    evaluatedAsOf: z.iso.date(),
    bcdVersion: z.string().min(1).max(64),
    bcdTimestamp: z.iso.datetime(),
    catalogueVersion: z.string().min(1).max(64),
    profile: policyProfileSchema,
    summary: z
      .object({
        pass: z.number().int().min(0).max(1_024),
        review: z.number().int().min(0).max(1_024),
        fail: z.number().int().min(0).max(1_024)
      })
      .strict(),
    findings: z.array(policyFindingSchema).max(1_024)
  })
  .strict();
export type PolicyEvaluation = z.infer<typeof policyEvaluationSchema>;

export const minimumBaselineRequestSchema = z
  .object({
    controlIds: z.array(z.string().min(1).max(80)).min(1).max(64),
    browsers: z.array(browserIdSchema).min(1).max(BROWSER_IDS.length),
    allowQualified: z.boolean()
  })
  .strict();
export type MinimumBaselineRequest = z.infer<typeof minimumBaselineRequestSchema>;

export const minimumBaselineResultSchema = z
  .object({
    browser: browserIdSchema,
    status: z.enum(["found", "unavailable", "unsupported_mapping", "source_inconsistent"]),
    minimumVersion: z.string().min(1).max(64).optional(),
    releaseDate: z.iso.date().optional(),
    blockers: z.array(z.string().min(1).max(80)).max(64)
  })
  .strict();
export type MinimumBaselineResult = z.infer<typeof minimumBaselineResultSchema>;

export const changeEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-f0-9]{24}$/u),
    type: z.enum([
      "baseline_established",
      "support_version_added",
      "support_version_corrected",
      "support_removed",
      "partial_support_added",
      "partial_support_removed",
      "flag_requirement_added",
      "flag_requirement_removed",
      "prefix_changed",
      "alternative_name_changed",
      "note_changed",
      "baseline_metadata_changed",
      "selected_path_added",
      "selected_path_removed",
      "browser_release_added",
      "control_mapping_changed",
      "source_became_incomparable"
    ]),
    observedInBcdVersion: z.string().min(1).max(64),
    observedInWebFeaturesVersion: z.string().min(1).max(64).optional(),
    sourceTimestamp: z.iso.datetime(),
    path: z.string().max(256).optional(),
    browser: browserIdSchema.optional(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    summary: z.string().min(1).max(512)
  })
  .strict();
export type ChangeEvent = z.infer<typeof changeEventSchema>;

export const sourceHistoryEntrySchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/u),
    bcdVersion: z.string().min(1).max(64),
    bcdTimestamp: z.iso.datetime(),
    webFeaturesVersion: z.string().min(1).max(64),
    catalogueVersion: z.string().min(1).max(64),
    schemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    browserCount: z.number().int().min(1).max(BROWSER_IDS.length),
    controlCount: z.number().int().min(0).max(64),
    pathCount: z.number().int().min(0).max(64),
    baselineAssociationCount: z.number().int().min(0).max(512),
    associatedEventCount: z.number().int().min(0).max(10_000)
  })
  .strict();
export type SourceHistoryEntry = z.infer<typeof sourceHistoryEntrySchema>;

export const sourceHistorySchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(sourceHistoryEntrySchema).max(512)
  })
  .strict();
export type SourceHistory = z.infer<typeof sourceHistorySchema>;

const headerValueSchema = z.union([
  z.string().max(8_192),
  z.array(z.string().max(8_192)).min(1).max(8)
]);

export const headerSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    headers: z.record(z.string().min(1).max(128), headerValueSchema)
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (Object.keys(snapshot.headers).length > 64) {
      context.addIssue({
        code: "custom",
        message: "A header snapshot may contain at most 64 header names.",
        path: ["headers"]
      });
    }
    for (const name of Object.keys(snapshot.headers)) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name)) {
        context.addIssue({
          code: "custom",
          message: `Invalid HTTP header name: ${name}`,
          path: ["headers", name]
        });
      }
    }
  });
export type HeaderSnapshot = z.infer<typeof headerSnapshotSchema>;

export const assuranceStateSchema = z.enum([
  "observed",
  "missing",
  "invalid",
  "not_evaluated",
  "report_only",
  "inconclusive"
]);
export type AssuranceState = z.infer<typeof assuranceStateSchema>;

export const assuranceFindingSchema = z
  .object({
    controlId: z.string().min(1).max(80),
    state: assuranceStateSchema,
    sourceHeaders: z.array(z.string().min(1).max(128)).max(4),
    summary: z.string().min(1).max(1_024),
    evidence: z.string().min(1).max(512).optional()
  })
  .strict();
export type AssuranceFinding = z.infer<typeof assuranceFindingSchema>;

export const assuranceReportSchema = z
  .object({
    schemaVersion: z.literal(2),
    name: z.string().min(1).max(80),
    inputHeaderCount: z.number().int().min(0).max(64),
    recognisedHeaderCount: z.number().int().min(0).max(64),
    summary: z
      .object({
        observed: z.number().int().min(0).max(64),
        missing: z.number().int().min(0).max(64),
        invalid: z.number().int().min(0).max(64),
        notEvaluated: z.number().int().min(0).max(64),
        reportOnly: z.number().int().min(0).max(64),
        inconclusive: z.number().int().min(0).max(64)
      })
      .strict(),
    findings: z.array(assuranceFindingSchema).max(64)
  })
  .strict();
export type AssuranceReport = z.infer<typeof assuranceReportSchema>;

export const htmlDocumentInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    html: z.string().max(128 * 1_024)
  })
  .strict();
export type HtmlDocumentInput = z.infer<typeof htmlDocumentInputSchema>;

export const htmlResourceReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(80),
    inputBytes: z
      .number()
      .int()
      .min(0)
      .max(128 * 1_024),
    elementCount: z.number().int().min(0).max(8_192),
    parseErrorCount: z.number().int().min(0).max(64),
    eligibleResourceCount: z.number().int().min(0).max(512),
    protectedResourceCount: z.number().int().min(0).max(512),
    unprotectedResourceCount: z.number().int().min(0).max(512),
    invalidIntegrityCount: z.number().int().min(0).max(512),
    scriptCount: z.number().int().min(0).max(512),
    styleCount: z.number().int().min(0).max(512),
    preloadCount: z.number().int().min(0).max(512),
    relativeReferenceCount: z.number().int().min(0).max(512),
    absoluteReferenceCount: z.number().int().min(0).max(512),
    otherReferenceCount: z.number().int().min(0).max(512),
    algorithms: z.array(z.enum(["sha256", "sha384", "sha512"])).max(3),
    finding: assuranceFindingSchema
  })
  .strict();
export type HtmlResourceReport = z.infer<typeof htmlResourceReportSchema>;

export const fetchMetadataReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(80),
    inputHeaderCount: z.number().int().min(0).max(64),
    recognisedHeaderCount: z.number().int().min(0).max(4),
    finding: assuranceFindingSchema
  })
  .strict();
export type FetchMetadataReport = z.infer<typeof fetchMetadataReportSchema>;

export const webauthnConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    operation: z.enum(["create", "get"]),
    authenticatorAttachment: z.enum(["platform", "cross-platform", "unspecified"]),
    userVerification: z.enum(["required", "preferred", "discouraged", "unspecified"]),
    residentKey: z.enum(["required", "preferred", "discouraged", "unspecified"]),
    attestation: z.enum(["none", "indirect", "direct", "enterprise", "unspecified"]),
    mediation: z.enum(["conditional", "optional", "required", "silent", "unspecified"]),
    prfRequested: z.boolean().optional()
  })
  .strict();
export type WebauthnConfiguration = z.infer<typeof webauthnConfigurationSchema>;

export const webauthnReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(80),
    operation: z.enum(["create", "get"]),
    configuration: z
      .object({
        authenticatorAttachment: z.enum(["platform", "cross-platform", "unspecified"]),
        userVerification: z.enum(["required", "preferred", "discouraged", "unspecified"]),
        residentKey: z.enum(["required", "preferred", "discouraged", "unspecified"]),
        attestation: z.enum(["none", "indirect", "direct", "enterprise", "unspecified"]),
        mediation: z.enum(["conditional", "optional", "required", "silent", "unspecified"]),
        prfRequested: z.boolean().optional()
      })
      .strict(),
    findings: z.array(assuranceFindingSchema).length(3)
  })
  .strict();
export type WebauthnReport = z.infer<typeof webauthnReportSchema>;

export const evidenceBundleInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    responses: z.array(headerSnapshotSchema).max(16).default([]),
    htmlDocuments: z.array(htmlDocumentInputSchema).max(16).default([]),
    requests: z.array(headerSnapshotSchema).max(32).default([]),
    webauthn: z.array(webauthnConfigurationSchema).max(16).default([])
  })
  .strict()
  .superRefine((bundle, context) => {
    if (
      bundle.responses.length +
        bundle.htmlDocuments.length +
        bundle.requests.length +
        bundle.webauthn.length ===
      0
    ) {
      context.addIssue({
        code: "custom",
        message: "An evidence bundle must contain at least one observation."
      });
    }
  });
export type EvidenceBundleInput = z.infer<typeof evidenceBundleInputSchema>;

export const compositeAssessmentSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    state: z.enum(["satisfied", "review", "gap", "not_evaluated"]),
    summary: z.string().min(1).max(1_024),
    requirements: z.array(z.string().min(1).max(256)).max(8)
  })
  .strict();
export type CompositeAssessment = z.infer<typeof compositeAssessmentSchema>;

export const evidenceBundleReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(80),
    coverage: z
      .object({
        responses: z.number().int().min(0).max(16),
        htmlDocuments: z.number().int().min(0).max(16),
        requests: z.number().int().min(0).max(32),
        webauthn: z.number().int().min(0).max(16)
      })
      .strict(),
    summary: z
      .object({
        observed: z.number().int().min(0).max(64),
        missing: z.number().int().min(0).max(64),
        invalid: z.number().int().min(0).max(64),
        notEvaluated: z.number().int().min(0).max(64),
        reportOnly: z.number().int().min(0).max(64),
        inconclusive: z.number().int().min(0).max(64)
      })
      .strict(),
    findings: z.array(assuranceFindingSchema).max(64),
    composites: z.array(compositeAssessmentSchema).max(8),
    responseReports: z.array(assuranceReportSchema).max(16),
    htmlReports: z.array(htmlResourceReportSchema).max(16),
    requestReports: z.array(fetchMetadataReportSchema).max(32),
    webauthnReports: z.array(webauthnReportSchema).max(16)
  })
  .strict();
export type EvidenceBundleReport = z.infer<typeof evidenceBundleReportSchema>;
