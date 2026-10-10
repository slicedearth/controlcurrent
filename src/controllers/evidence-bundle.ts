import { requiredElement, listenAsync } from "./dom";
import { OperationGeneration } from "../local-state";
import { SECURITY_CONTROLS } from "../catalogue";
import type {
  AssuranceReport,
  AssuranceState,
  CompositeAssessment,
  CspMarkupReport,
  EvidenceBundleReport,
  EvidenceReportComparison,
  FetchMetadataReport,
  HtmlResourceReport,
  ResourceVerificationReport,
  WebauthnReport
} from "../contracts";
import { compareEvidenceReports } from "../evidence-comparison";
import { inspectEvidenceBundle } from "../evidence-bundle";
import { exportEvidenceBundleReport, exportEvidenceReportComparison } from "../export";
import { downloadText } from "./download";

export function initialiseEvidenceBundleInspector(document: Document = window.document): void {
  const example = {
    schemaVersion: 4,
    name: "Release candidate",
    identity: {
      subject: {
        applicationId: "example-app",
        environment: "staging",
        revision: "0123456789abcdef0123456789abcdef01234567",
        buildId: "build-42"
      },
      capture: {
        startedAt: "2026-07-20T09:00:00.000Z",
        completedAt: "2026-07-20T09:05:00.000Z",
        producer: {
          kind: "application_ci",
          id: "example-ci",
          version: "1.0.0"
        }
      }
    },
    scopeInventory: {
      schemaVersion: 1,
      name: "Reviewed application route manifest",
      kind: "framework_manifest",
      generatedAt: "2026-07-20T08:55:00.000Z",
      completeness: "complete",
      entries: [
        {
          id: "sign-in",
          disposition: "included"
        }
      ]
    },
    surfaces: [
      {
        id: "sign-in",
        role: "authentication",
        requiredEvidence: ["response", "html", "request", "webauthn"],
        requiredControls: [
          "content-security-policy",
          "csp-nonces",
          "csp-base-uri",
          "csp-frame-ancestors",
          "csp-form-action",
          "subresource-integrity",
          "integrity-policy",
          "cross-origin-opener-policy",
          "cross-origin-embedder-policy",
          "strict-transport-security",
          "x-content-type-options",
          "referrer-policy",
          "samesite-cookies",
          "httponly-cookies",
          "secure-cookie-prefixes",
          "fetch-metadata",
          "webauthn-platform-authenticator",
          "webauthn-prf",
          "webauthn-conditional-mediation"
        ],
        requiredComposites: [
          "strict-csp-candidate",
          "cross-origin-isolation-candidate",
          "cookie-attribute-coverage"
        ]
      }
    ],
    responses: [
      {
        schemaVersion: 2,
        name: "Document response",
        surfaceId: "sign-in",
        context: {
          schemaVersion: 1,
          variantId: "anonymous-html",
          sequence: 0,
          outcome: "final",
          status: 200,
          contentType: "html",
          authentication: "anonymous",
          cache: "miss"
        },
        headers: {
          "Content-Security-Policy":
            "default-src 'self'; script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAA=='; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
          "Integrity-Policy": "blocked-destinations=(script style), endpoints=(integrity-endpoint)",
          "Reporting-Endpoints": 'integrity-endpoint="https://reports.example.invalid/integrity"',
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "credentialless",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Set-Cookie": "__Host-session=REDACTED; Path=/; Secure; HttpOnly; SameSite=Lax",
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
          "X-Content-Type-Options": "nosniff"
        }
      }
    ],
    htmlDocuments: [
      {
        schemaVersion: 1,
        name: "Document HTML",
        surfaceId: "sign-in",
        html:
          '<script nonce="AAAAAAAAAAAAAAAAAAAAAA==">console.log("local example")</scr' +
          'ipt><link rel="stylesheet" href="/assets/app.css" integrity="sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA">'
      }
    ],
    resourceBytes: [],
    requests: [
      {
        schemaVersion: 1,
        name: "Navigation request",
        surfaceId: "sign-in",
        headers: {
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-User": "?1"
        }
      }
    ],
    webauthn: [
      {
        schemaVersion: 1,
        name: "Passkey retrieval",
        surfaceId: "sign-in",
        operation: "get",
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "unspecified",
        attestation: "unspecified",
        mediation: "conditional",
        prfRequested: true
      }
    ]
  } as const;

  const form = requiredElement(document, "#bundle-form", HTMLFormElement);
  const reviewButton = requiredElement(form, 'button[type="submit"]', HTMLButtonElement);
  const panel = requiredElement(document, "#evidence-bundle-panel", HTMLElement);
  const input = requiredElement(document, "#bundle-block", HTMLTextAreaElement);
  const fileInput = requiredElement(document, "#bundle-file", HTMLInputElement);
  const dropTarget = requiredElement(document, "#bundle-drop", HTMLElement);
  const pasteDetails = requiredElement(document, ".bundle-paste", HTMLDetailsElement);
  const message = requiredElement(document, "#bundle-message", HTMLElement);
  const results = requiredElement(document, "#bundle-results", HTMLElement);
  const source = requiredElement(document, "#bundle-source", HTMLElement);
  const coverage = requiredElement(document, "#bundle-coverage", HTMLElement);
  const summary = requiredElement(document, "#bundle-summary", HTMLElement);
  const composites = requiredElement(document, "#bundle-composites", HTMLElement);
  const findings = requiredElement(document, "#bundle-findings", HTMLElement);
  const inventory = requiredElement(document, "#bundle-inventory", HTMLElement);
  const exportButton = requiredElement(document, "#export-bundle", HTMLButtonElement);
  const previousReportInput = requiredElement(document, "#previous-report", HTMLTextAreaElement);
  const compareButton = requiredElement(document, "#compare-report", HTMLButtonElement);
  const comparisonExportButton = requiredElement(document, "#export-comparison", HTMLButtonElement);
  const comparisonMessage = requiredElement(document, "#comparison-message", HTMLElement);
  const comparisonResults = requiredElement(document, "#comparison-results", HTMLElement);
  const comparisonSummary = requiredElement(document, "#comparison-summary", HTMLElement);
  const comparisonEvents = requiredElement(document, "#comparison-events", HTMLElement);

  const controlNames = new Map<string, string>(
    SECURITY_CONTROLS.map((control) => [control.id, control.name] as const)
  );
  const stateLabels: Record<AssuranceState, string> = {
    observed: "Found",
    missing: "Not found",
    invalid: "Invalid or unclear",
    not_evaluated: "Not checked",
    not_applicable: "Not relevant",
    report_only: "Reporting only",
    inconclusive: "Needs review"
  };
  const compositeLabels: Record<CompositeAssessment["state"], string> = {
    satisfied: "Requirements found",
    review: "Needs review",
    gap: "Missing requirement",
    not_evaluated: "Not checked",
    not_applicable: "Not relevant"
  };
  const compositeNames = new Map<string, string>([
    ["Strict CSP candidate", "Script CSP declaration candidate"],
    ["Cross-origin isolation header candidate", "Cross-origin isolation headers"],
    ["Cookie attribute coverage", "Cookie protection settings"],
    ["Expected surface coverage", "Expected page coverage"]
  ]);
  const sourceContext = {
    bcdVersion: panel.dataset.bcdVersion ?? "",
    bcdTimestamp: panel.dataset.bcdTimestamp ?? "",
    webFeaturesVersion: panel.dataset.webFeaturesVersion ?? "",
    selectedSchemaFingerprint: panel.dataset.selectedSchemaFingerprint ?? ""
  };
  let latestReport: EvidenceBundleReport | undefined;
  let latestComparison: EvidenceReportComparison | undefined;
  let loadingEvidence = false;
  const operations = new OperationGeneration();
  function supersede(): number {
    const token = operations.begin();
    latestReport = undefined;
    latestComparison = undefined;
    exportButton.disabled = true;
    comparisonExportButton.disabled = true;
    results.hidden = true;
    comparisonResults.hidden = true;
    form.setAttribute("aria-busy", "false");
    loadingEvidence = false;
    reviewButton.disabled = false;
    return token;
  }
  const MAX_BUNDLE_BYTES = 2_097_152;

  function friendlyError(error: unknown): string {
    if (error instanceof SyntaxError) {
      return "The evidence file is not valid JSON.";
    }
    if (typeof error === "object" && error !== null && "issues" in error) {
      const issues = (error as { issues?: { path?: PropertyKey[]; message?: string }[] }).issues;
      const first = issues?.[0];
      if (first?.message) {
        const path = first.path?.map(String).join(".");
        return path
          ? `Evidence file problem at ${path}: ${first.message}`
          : `Evidence file problem: ${first.message}`;
      }
    }
    return error instanceof Error ? error.message : "The evidence bundle could not be assessed.";
  }

  async function loadEvidenceFile(file: File): Promise<void> {
    const token = supersede();
    message.textContent = "Reading evidence on this device…";
    if (file.size > MAX_BUNDLE_BYTES) {
      throw new Error("The evidence file exceeds the 2 MiB limit.");
    }
    if (!file.name.toLocaleLowerCase("en-AU").endsWith(".json")) {
      throw new Error("Choose a JSON evidence file.");
    }
    let text: string;
    loadingEvidence = true;
    reviewButton.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      text = await file.text();
    } catch (error) {
      if (operations.current(token)) message.textContent = friendlyError(error);
      return;
    } finally {
      if (operations.current(token)) {
        loadingEvidence = false;
        reviewButton.disabled = false;
        form.setAttribute("aria-busy", "false");
      }
    }
    if (!operations.current(token)) return;
    input.value = text;
    message.textContent =
      "Evidence file loaded on this device. Select Review evidence file to analyse it.";
  }

  function stat(value: number, label: string): HTMLElement {
    const card = document.createElement("div");
    card.className = "stat-card";
    const count = document.createElement("strong");
    count.textContent = String(value);
    const description = document.createElement("span");
    description.textContent = label;
    card.append(count, description);
    return card;
  }

  function assuranceCard(
    controlId: string,
    state: AssuranceState,
    explanation: string,
    evidence?: string
  ): HTMLElement {
    const article = document.createElement("article");
    article.className = "result-card assurance-card";
    const header = document.createElement("div");
    header.className = "result-card__header";
    const heading = document.createElement("h3");
    heading.textContent = controlNames.get(controlId) ?? controlId;
    const badge = document.createElement("span");
    badge.className = `assurance assurance--${state}`;
    badge.textContent = stateLabels[state];
    header.append(heading, badge);
    const detail = document.createElement("p");
    detail.textContent = explanation;
    article.append(header, detail);
    if (evidence) {
      const evidenceNode = document.createElement("p");
      evidenceNode.className = "assurance-evidence";
      evidenceNode.textContent = evidence;
      article.append(evidenceNode);
    }
    return article;
  }

  function compositeCard(composite: CompositeAssessment): HTMLElement {
    const article = document.createElement("article");
    article.className = "result-card assurance-card";
    const header = document.createElement("div");
    header.className = "result-card__header";
    const heading = document.createElement("h3");
    heading.textContent = compositeNames.get(composite.name) ?? composite.name;
    const badge = document.createElement("span");
    badge.className = `composite composite--${composite.state}`;
    badge.textContent = compositeLabels[composite.state];
    header.append(heading, badge);
    const detail = document.createElement("p");
    detail.textContent = composite.summary;
    const requirements = document.createElement("ul");
    for (const requirement of composite.requirements) {
      const item = document.createElement("li");
      item.textContent = requirement;
      requirements.append(item);
    }
    article.append(header, detail, requirements);
    return article;
  }

  function inventoryCard(title: string, description: string, detail: string): HTMLElement {
    const article = document.createElement("article");
    article.className = "result-card assurance-card";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const explanation = document.createElement("p");
    explanation.textContent = description;
    const evidence = document.createElement("p");
    evidence.className = "assurance-evidence";
    evidence.textContent = detail;
    article.append(heading, explanation, evidence);
    return article;
  }

  function responseInventory(report: AssuranceReport): HTMLElement {
    return inventoryCard(
      report.name,
      "Response headers included in the supplied file",
      `${String(report.recognisedHeaderCount)} recognised of ${String(report.inputHeaderCount)} header names`
    );
  }

  function responseContextInventory(
    report: EvidenceBundleReport["responseContexts"][number]
  ): HTMLElement {
    return inventoryCard(
      `Response check · ${report.surfaceId}`,
      `Variation ${report.variantId} · access ${report.authentication} · content ${report.contentType}`,
      `Result ${report.outcome} · status ${report.statusClass}${report.status ? ` ${String(report.status)}` : ""} · cache ${report.cache}${report.redirectTarget ? ` · redirect ${report.redirectTarget}` : ""}${report.errorKind ? ` · ${report.errorKind}` : ""}`
    );
  }

  function htmlInventory(report: HtmlResourceReport): HTMLElement {
    return inventoryCard(
      report.name,
      "Page resources found in supplied HTML without running the page",
      `${String(report.protectedResourceCount)} protected of ${String(report.eligibleResourceCount)} eligible resources · algorithms ${report.algorithms.join(", ") || "none"} · ${String(report.parseErrorCount)} parse errors`
    );
  }

  function resourceVerificationInventory(report: ResourceVerificationReport): HTMLElement {
    return inventoryCard(
      "Local resource hash check",
      "Supplied resource files are hashed in memory and left out of this reduced report",
      `${String(report.verifiedResourceCount)} verified · ${String(report.mismatchedResourceCount)} mismatched · ${String(report.invalidMetadataCount)} invalid metadata · ${String(report.unmatchedResourceCount)} unmatched`
    );
  }

  function cspMarkupInventory(report: CspMarkupReport): HTMLElement {
    return inventoryCard(
      `Content Security Policy and page markup · ${report.surfaceId}`,
      "Inline content is matched without retaining nonces, hashes, or source text",
      `${String(report.matchedNonceCount)} nonce · ${String(report.matchedHashCount)} hash · ${String(report.matchedMixedCount)} mixed · ${String(report.unmatchedInlineCount)} unmatched · ${String(report.broadSourceExpressionCount)} broad sources`
    );
  }

  function surfaceInventory(report: EvidenceBundleReport["surfaceCoverage"][number]): HTMLElement {
    return inventoryCard(
      `Expected page · ${report.surfaceId}`,
      `Role ${report.role} · evidence ${report.state}`,
      report.missingEvidence.length === 0
        ? `Complete: ${report.observedEvidence.join(", ")}`
        : `Missing: ${report.missingEvidence.join(", ")}`
    );
  }

  function scopeInventoryCard(report: EvidenceBundleReport["scopeInventory"]): HTMLElement {
    if (report.state === "absent") {
      return inventoryCard(
        "Supplied page list",
        "No independently produced page-list fingerprint was supplied",
        "The pages in the evidence file were chosen by its operator, so missing routes cannot be discovered"
      );
    }
    return inventoryCard(
      `Supplied page list · ${report.name}`,
      `Source ${report.kind} · ${report.completeness} · created ${report.generatedAt}`,
      `${String(report.includedEntries)} included · ${String(report.excludedEntries)} excluded · ${String(report.totalEntries)} total · fingerprint ${report.fingerprint}`
    );
  }

  function surfaceAssessmentInventory(
    report: EvidenceBundleReport["surfaceAssessments"][number]
  ): HTMLElement {
    const observed = report.findings.filter((finding) => finding.state === "observed").length;
    const satisfied = report.composites.filter(
      (composite) => composite.state === "satisfied"
    ).length;
    return inventoryCard(
      `Requirements for page · ${report.surfaceId}`,
      `Role ${report.role} · requirements set explicitly`,
      `${String(observed)} of ${String(report.requiredControls.length)} required features found · ${String(satisfied)} of ${String(report.requiredComposites.length)} combined checks met`
    );
  }

  function comparisonEventCard(event: EvidenceReportComparison["events"][number]): HTMLElement {
    return inventoryCard(
      event.type.replaceAll("_", " "),
      event.key,
      `${event.beforeState} → ${event.afterState} · ${event.summary}`
    );
  }

  function requestInventory(report: FetchMetadataReport): HTMLElement {
    return inventoryCard(
      report.name,
      "Request-origin check using Fetch Metadata headers",
      `${String(report.recognisedHeaderCount)} recognised request-context headers · ${stateLabels[report.finding.state]}`
    );
  }

  function webauthnInventory(report: WebauthnReport): HTMLElement {
    return inventoryCard(
      report.name,
      `Passkey settings for ${report.operation}`,
      `Device type ${report.configuration.authenticatorAttachment} · user verification ${report.configuration.userVerification} · discoverable credential ${report.configuration.residentKey} · browser mediation ${report.configuration.mediation} · attestation ${report.configuration.attestation}`
    );
  }

  function render(report: EvidenceBundleReport): void {
    latestReport = report;
    coverage.replaceChildren(
      stat(report.coverage.responses, "supplied responses"),
      stat(report.coverage.contextualisedResponses, "responses linked to a page"),
      stat(report.coverage.responseVariants, "response variations"),
      stat(report.coverage.redirectResponses, "redirect responses"),
      stat(report.coverage.errorResponses, "error responses"),
      stat(report.coverage.authenticatedResponses, "authenticated responses"),
      stat(report.coverage.htmlDocuments, "supplied HTML pages"),
      stat(report.coverage.resourceBytes, "local resource files"),
      stat(report.coverage.requests, "supplied requests"),
      stat(report.coverage.webauthn, "passkey settings"),
      stat(report.coverage.completeSurfaces, "expected pages with complete evidence"),
      stat(report.coverage.surfaceGaps, "expected pages with missing evidence")
    );
    summary.replaceChildren(
      stat(report.summary.observed, "features found consistently"),
      stat(report.summary.missing, "features not found"),
      stat(report.summary.invalid, "invalid or unclear settings"),
      stat(report.summary.reportOnly, "features that only report problems"),
      stat(report.summary.inconclusive, "features that need human review"),
      stat(report.summary.notEvaluated, "required features not checked"),
      stat(report.summary.notApplicable, "features not required for these pages")
    );
    composites.replaceChildren(...report.composites.map(compositeCard));
    findings.replaceChildren(
      ...report.findings.map((finding) =>
        assuranceCard(finding.controlId, finding.state, finding.summary, finding.evidence)
      )
    );
    inventory.replaceChildren(
      scopeInventoryCard(report.scopeInventory),
      ...report.responseReports.map(responseInventory),
      ...report.responseContexts.map(responseContextInventory),
      ...report.htmlReports.map(htmlInventory),
      resourceVerificationInventory(report.resourceVerificationReport),
      ...report.cspMarkupReports.map(cspMarkupInventory),
      ...report.surfaceCoverage.map(surfaceInventory),
      ...report.surfaceAssessments.map(surfaceAssessmentInventory),
      ...report.requestReports.map(requestInventory),
      ...report.webauthnReports.map(webauthnInventory)
    );
    source.textContent = `${report.name} · ${report.identity.subject.applicationId} · ${report.identity.subject.environment} · revision ${report.identity.subject.revision} · captured ${report.identity.capture.completedAt} by ${report.identity.capture.producer.id} (${report.identity.capture.producer.kind}) · analyser ${report.provenance.analyserVersion} · catalogue ${report.provenance.catalogueVersion} · BCD ${report.provenance.bcdVersion}`;
    exportButton.disabled = false;
    latestComparison = undefined;
    comparisonExportButton.disabled = true;
    comparisonResults.hidden = true;
    comparisonSummary.replaceChildren();
    comparisonEvents.replaceChildren();
    comparisonMessage.textContent = "";
    results.hidden = false;
  }

  listenAsync(fileInput, "change", message, async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      await loadEvidenceFile(file);
    } catch (error) {
      input.value = "";
      message.textContent = friendlyError(error);
    } finally {
      if (fileInput.files?.[0] === file) fileInput.value = "";
    }
  });

  for (const eventName of ["dragenter", "dragover"]) {
    dropTarget.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropTarget.dataset.active = "true";
    });
  }

  dropTarget.addEventListener("dragleave", (event) => {
    if (!dropTarget.contains(event.relatedTarget as Node | null)) {
      delete dropTarget.dataset.active;
    }
  });

  listenAsync(dropTarget, "drop", message, async (event) => {
    event.preventDefault();
    delete dropTarget.dataset.active;
    const file = event.dataTransfer?.files[0];
    if (!file) {
      message.textContent = "Drop one JSON evidence file.";
      return;
    }
    try {
      await loadEvidenceFile(file);
    } catch (error) {
      input.value = "";
      message.textContent = friendlyError(error);
    }
  });

  listenAsync(form, "submit", message, async (event) => {
    event.preventDefault();
    if (loadingEvidence) return;
    const token = supersede();
    const supplied = input.value;
    form.setAttribute("aria-busy", "true");
    message.textContent = "Reviewing evidence on this device…";
    try {
      const report = await inspectEvidenceBundle(JSON.parse(supplied) as unknown, sourceContext);
      if (!operations.current(token)) return;
      render(report);
      message.textContent =
        "Evidence reviewed on this device. The report excludes the page list, raw HTML, resource locations and bytes, cookies, credentials, and passkey identifiers.";
    } catch (error) {
      if (!operations.current(token)) return;
      latestReport = undefined;
      exportButton.disabled = true;
      results.hidden = true;
      message.textContent = friendlyError(error);
    } finally {
      if (operations.current(token)) form.setAttribute("aria-busy", "false");
    }
  });

  input.addEventListener("input", () => {
    supersede();
    message.textContent = "Evidence changed. Review it again before exporting.";
  });
  previousReportInput.addEventListener("input", () => {
    operations.cancel();
    form.setAttribute("aria-busy", "false");
    latestComparison = undefined;
    comparisonExportButton.disabled = true;
    comparisonResults.hidden = true;
    comparisonMessage.textContent = "Previous report changed. Compare again.";
  });

  document.querySelector("#load-bundle-example")?.addEventListener("click", () => {
    supersede();
    input.value = JSON.stringify(example, null, 2);
    pasteDetails.open = true;
    message.textContent = "Redacted example loaded. Select Review evidence file to check it.";
  });

  exportButton.addEventListener("click", () => {
    if (!latestReport) return;
    try {
      downloadText(
        exportEvidenceBundleReport(latestReport),
        "controlcurrent-evidence-report.json",
        "application/json"
      );
      message.textContent = "Privacy-reduced evidence report created on this device.";
    } catch (error) {
      message.textContent = friendlyError(error);
    }
  });

  listenAsync(compareButton, "click", message, async () => {
    if (!latestReport) return;
    const token = operations.begin();
    const current = latestReport;
    const previous = previousReportInput.value;
    latestComparison = undefined;
    comparisonExportButton.disabled = true;
    comparisonResults.hidden = true;
    comparisonMessage.textContent = "Comparing reports on this device…";
    form.setAttribute("aria-busy", "true");
    try {
      const comparison = await compareEvidenceReports(JSON.parse(previous) as unknown, current);
      if (!operations.current(token)) return;
      latestComparison = comparison;
      comparisonSummary.replaceChildren(
        stat(latestComparison.summary.regressions, "regressions"),
        stat(latestComparison.summary.resolutions, "resolutions"),
        stat(latestComparison.summary.changed, "other changes"),
        stat(latestComparison.summary.incomparable, "incomparable changes"),
        stat(latestComparison.summary.totalEvents, "total changes")
      );
      comparisonEvents.replaceChildren(...latestComparison.events.map(comparisonEventCard));
      comparisonExportButton.disabled = false;
      comparisonResults.hidden = false;
      comparisonMessage.textContent = !latestComparison.compatible
        ? latestComparison.compatibilityReasons.join(" ")
        : latestComparison.events.length === 0
          ? "No evidence changes were detected."
          : `${String(latestComparison.summary.totalEvents)} evidence changes detected${latestComparison.summary.truncated ? `; showing the first ${String(latestComparison.summary.emittedEvents)}` : ""}.`;
    } catch (error) {
      if (!operations.current(token)) return;
      latestComparison = undefined;
      comparisonExportButton.disabled = true;
      comparisonResults.hidden = true;
      comparisonMessage.textContent =
        error instanceof Error ? error.message : "The reports could not be compared.";
    } finally {
      if (operations.current(token)) form.setAttribute("aria-busy", "false");
    }
  });

  comparisonExportButton.addEventListener("click", () => {
    if (!latestComparison) return;
    try {
      downloadText(
        exportEvidenceReportComparison(latestComparison),
        "controlcurrent-evidence-comparison.json",
        "application/json"
      );
      comparisonMessage.textContent = "Report comparison created on this device.";
    } catch (error) {
      comparisonMessage.textContent = friendlyError(error);
    }
  });

  document.querySelector("#clear-bundle")?.addEventListener("click", () => {
    supersede();
    input.value = "";
    fileInput.value = "";
    delete dropTarget.dataset.active;
    latestReport = undefined;
    latestComparison = undefined;
    exportButton.disabled = true;
    results.hidden = true;
    coverage.replaceChildren();
    summary.replaceChildren();
    composites.replaceChildren();
    findings.replaceChildren();
    inventory.replaceChildren();
    previousReportInput.value = "";
    comparisonExportButton.disabled = true;
    comparisonResults.hidden = true;
    comparisonSummary.replaceChildren();
    comparisonEvents.replaceChildren();
    comparisonMessage.textContent = "";
    message.textContent = "Evidence input and report cleared.";
    fileInput.focus();
  });
}
