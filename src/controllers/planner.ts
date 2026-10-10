import { requiredElement, listenAsync } from "./dom";
import { SECURITY_CONTROLS } from "../catalogue";
import { selectedSnapshot } from "../data";
import {
  type DecisionPacketEvidence,
  profileEvaluationSchema,
  type BrowserId,
  type Outcome,
  type PolicyDecision,
  type PolicyException,
  type PolicyEvaluation,
  type PolicyFinding,
  type PolicyProfile,
  type ProfileComparison,
  type ProfileEvaluation
} from "../contracts";
import { BROWSER_IDS } from "../browsers";
import { evaluateProfile } from "../evaluate";
import { exportProfileEvaluation } from "../export";
import { clearProfile, loadProfile, saveProfile } from "../profile-storage";
import { browserNames, outcomeLabels } from "../format";
import {
  compareProfileEvaluations,
  exportEngineeringReport,
  importDeploymentProfile,
  MAX_PROFILE_IMPORT_BYTES
} from "../profile-workflows";
import { importBrowserConfiguration, MAX_BROWSER_CONFIG_BYTES } from "../browser-config";
import {
  clearEvaluation,
  loadEvaluation,
  saveEvaluation,
  summariseEvaluationUpdate
} from "../evaluation-storage";
import {
  buildPolicyProfile,
  exportPolicyProfile,
  importPolicyProfile,
  MAX_POLICY_IMPORT_BYTES
} from "../policy-builder";
import { evaluatePolicyProfile } from "../policy";
import { exportDecisionReport } from "../decision-report";
import { guardedStorage, OperationGeneration } from "../local-state";
import { downloadText as download } from "./download";
import {
  buildDecisionPacket,
  exportDecisionPacket,
  MAX_DECISION_PACKET_BYTES,
  validateDecisionPacketEvidence
} from "../decision-packet";

export function initialisePlanner(document: Document = window.document, baseUrl = "/"): void {
  const browsers: readonly BrowserId[] = BROWSER_IDS;
  const form = requiredElement(document, "#profile-form", HTMLFormElement);
  const message = requiredElement(document, "#profile-message", HTMLElement);
  const results = requiredElement(document, "#profile-results", HTMLElement);
  const resultsList = requiredElement(document, "#results-list", HTMLElement);
  const resultsSource = requiredElement(document, "#results-source", HTMLElement);
  const exportButton = requiredElement(document, "#export-profile", HTMLButtonElement);
  const reportButton = requiredElement(document, "#export-engineering-report", HTMLButtonElement);
  const importInput = requiredElement(document, "#import-profile", HTMLInputElement);
  const compareInput = requiredElement(document, "#compare-profile", HTMLInputElement);
  const browserConfigInput = requiredElement(document, "#import-browser-config", HTMLInputElement);
  const rememberResult = requiredElement(document, "#remember-result", HTMLInputElement);
  const comparisonSection = requiredElement(document, "#profile-comparison", HTMLElement);
  const comparisonSource = requiredElement(document, "#comparison-source", HTMLElement);
  const comparisonSummary = requiredElement(document, "#comparison-summary", HTMLElement);
  const comparisonEvents = requiredElement(document, "#comparison-events", HTMLElement);
  const updateNotice = requiredElement(document, "#profile-update", HTMLElement);
  const resultSearch = requiredElement(document, "#result-search", HTMLInputElement);
  const resultCategory = requiredElement(document, "#result-category", HTMLSelectElement);
  const resultOutcome = requiredElement(document, "#result-outcome", HTMLSelectElement);
  const resultBlockers = requiredElement(document, "#result-blockers", HTMLInputElement);
  const resultFilterStatus = requiredElement(document, "#result-filter-status", HTMLElement);
  const policyQualifications = requiredElement(
    document,
    "#policy-qualifications",
    HTMLSelectElement
  );
  const policyUnknown = requiredElement(document, "#policy-unknown", HTMLSelectElement);
  const policyUnsupported = requiredElement(document, "#policy-unsupported", HTMLSelectElement);
  const exceptionControl = requiredElement(document, "#exception-control", HTMLSelectElement);
  const exceptionBrowser = requiredElement(document, "#exception-browser", HTMLSelectElement);
  const exceptionOutcome = requiredElement(document, "#exception-outcome", HTMLSelectElement);
  const exceptionExpiry = requiredElement(document, "#exception-expiry", HTMLInputElement);
  const exceptionReason = requiredElement(document, "#exception-reason", HTMLInputElement);
  const exceptionList = requiredElement(document, "#policy-exceptions", HTMLElement);
  const exportPolicyButton = requiredElement(document, "#export-policy", HTMLButtonElement);
  const exportDecisionButton = requiredElement(
    document,
    "#export-decision-report",
    HTMLButtonElement
  );
  const importPolicyInput = requiredElement(document, "#import-policy", HTMLInputElement);
  const policyMessage = requiredElement(document, "#policy-message", HTMLElement);
  const policyPreview = requiredElement(document, "#policy-preview", HTMLElement);
  const policySummary = requiredElement(document, "#policy-summary", HTMLElement);
  const policySearch = requiredElement(document, "#policy-search", HTMLInputElement);
  const policyDecision = requiredElement(document, "#policy-decision", HTMLSelectElement);
  const policyExceptionsOnly = requiredElement(
    document,
    "#policy-exceptions-only",
    HTMLInputElement
  );
  const policyFilterStatus = requiredElement(document, "#policy-filter-status", HTMLElement);
  const policyFindings = requiredElement(document, "#policy-findings", HTMLElement);
  const policyJson = requiredElement(document, "#policy-json", HTMLElement);
  const policyCiContext = requiredElement(document, "#policy-ci-context", HTMLElement);
  const policyCiCommand = requiredElement(document, "#policy-ci-command", HTMLElement);
  const decisionEvidenceInput = requiredElement(document, "#decision-evidence", HTMLInputElement);
  const decisionEvidenceStatus = requiredElement(
    document,
    "#decision-evidence-status",
    HTMLElement
  );
  const exportDecisionPacketButton = requiredElement(
    document,
    "#export-decision-packet",
    HTMLButtonElement
  );
  let latestEvaluation: ProfileEvaluation | undefined;
  let comparisonBaseline: ProfileEvaluation | undefined;
  let latestComparison: ProfileComparison | undefined;
  let rememberedEvaluation: ProfileEvaluation | undefined;
  let policyExceptions: PolicyException[] = [];
  let latestPolicy: PolicyProfile | undefined;
  let latestPolicyEvaluation: PolicyEvaluation | undefined;
  let decisionEvidence: DecisionPacketEvidence | undefined;
  const operations = new OperationGeneration();
  const storage = guardedStorage(() => window.localStorage);
  const basePath = baseUrl.replace(/\/$/u, "");

  type ResultGroupId = "ready" | "limited" | "unsupported" | "unknown";

  const resultGroups: readonly {
    id: ResultGroupId;
    title: string;
    description: string;
  }[] = [
    {
      id: "ready",
      title: "Ready to use",
      description:
        "Every selected browser has an unqualified support record. Configuration and testing are still required."
    },
    {
      id: "limited",
      title: "Works with known limitations",
      description:
        "The feature is available, but at least one selected browser has a qualification to review."
    },
    {
      id: "unsupported",
      title: "Not supported",
      description: "At least one selected browser cannot provide a required part of this feature."
    },
    {
      id: "unknown",
      title: "Not enough information",
      description:
        "The published browser records do not support a dependable answer for this browser plan."
    }
  ];

  function browserCheckbox(browser: BrowserId): HTMLInputElement {
    const input = form.elements.namedItem(`include-${browser}`);
    if (!(input instanceof HTMLInputElement)) throw new Error(`Missing ${browser} toggle.`);
    return input;
  }

  function browserSelect(browser: BrowserId): HTMLSelectElement {
    const select = form.elements.namedItem(`version-${browser}`);
    if (!(select instanceof HTMLSelectElement)) throw new Error(`Missing ${browser} versions.`);
    return select;
  }

  function profileName(): HTMLInputElement {
    const input = form.elements.namedItem("profile-name");
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing profile name.");
    return input;
  }

  function readProfile() {
    return {
      schemaVersion: 1 as const,
      name: profileName().value.trim(),
      baselines: browsers.flatMap((browser) =>
        browserCheckbox(browser).checked
          ? [{ browser, minimumVersion: browserSelect(browser).value }]
          : []
      )
    };
  }

  function applyProfile(
    profile: ReturnType<typeof readProfile>,
    requireAvailableVersions = true
  ): void {
    if (requireAvailableVersions) {
      const unavailable = profile.baselines.filter(
        (baseline) =>
          ![...browserSelect(baseline.browser).options].some(
            (option) => option.value === baseline.minimumVersion
          )
      );
      if (unavailable.length > 0) {
        throw new Error(
          `This data snapshot cannot evaluate ${unavailable
            .map((baseline) => `${browserNames[baseline.browser]} ${baseline.minimumVersion}`)
            .join(", ")}. Choose a version shown in the planner.`
        );
      }
    }
    profileName().value = profile.name;
    for (const browser of browsers) {
      const baseline = profile.baselines.find((item) => item.browser === browser);
      const checkbox = browserCheckbox(browser);
      const select = browserSelect(browser);
      checkbox.checked = Boolean(baseline);
      select.disabled = !baseline;
      if (
        baseline &&
        [...select.options].some((option) => option.value === baseline.minimumVersion)
      ) {
        select.value = baseline.minimumVersion;
      }
    }
  }

  function resetPolicy(): void {
    operations.cancel();
    latestPolicy = undefined;
    latestPolicyEvaluation = undefined;
    exportPolicyButton.disabled = true;
    exportDecisionButton.disabled = true;
    exportDecisionPacketButton.disabled = true;
    policyPreview.hidden = true;
    policySummary.replaceChildren();
    policyFindings.replaceChildren();
    policyFilterStatus.textContent = "";
    policyJson.textContent = "";
    policyCiContext.textContent = "";
    policyCiCommand.textContent = "";
  }

  function resultClass(outcome: string): string {
    return `outcome outcome--${outcome}`;
  }

  function classifyResult(evaluations: ProfileEvaluation["results"][string]): ResultGroupId {
    if (evaluations.some((item) => ["unavailable", "removed"].includes(item.outcome))) {
      return "unsupported";
    }
    if (
      evaluations.some((item) =>
        ["unknown", "unsupported_mapping", "source_inconsistent"].includes(item.outcome)
      )
    ) {
      return "unknown";
    }
    if (evaluations.some((item) => item.outcome === "available_with_qualification")) {
      return "limited";
    }
    return "ready";
  }

  function nextStep(group: ResultGroupId, fallback: string): string {
    if (group === "ready") {
      return `Review the setup requirements, test the feature in your application, and keep the defence-in-depth fallback: ${fallback}`;
    }
    if (group === "limited") {
      return `Review the browser-specific limitation before rollout and keep this fallback: ${fallback}`;
    }
    if (group === "unsupported") {
      return `Keep the fallback or raise the oldest browser version before making this feature mandatory: ${fallback}`;
    }
    return `Treat support as unconfirmed, review the feature page and source links, and keep this fallback: ${fallback}`;
  }

  async function readFile(input: HTMLInputElement, maximumBytes: number): Promise<string> {
    const file = input.files?.[0];
    if (!file) throw new Error("Choose a file first.");
    if (file.size > maximumBytes) {
      throw new Error(`The selected file exceeds the ${String(maximumBytes)}-byte limit.`);
    }
    return file.text();
  }

  async function readJsonFile(input: HTMLInputElement): Promise<string> {
    return readFile(input, MAX_PROFILE_IMPORT_BYTES);
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

  function renderComparison(comparison: ProfileComparison): void {
    comparisonSummary.replaceChildren(
      stat(comparison.summary.gained, "gained outcomes"),
      stat(comparison.summary.lost, "lost outcomes"),
      stat(comparison.summary.newlyQualified, "newly qualified outcomes"),
      stat(comparison.summary.qualificationRemoved, "qualifications removed")
    );
    comparisonEvents.replaceChildren();
    for (const event of comparison.events) {
      const article = document.createElement("article");
      article.className = "result-card";
      const header = document.createElement("div");
      header.className = "result-card__header";
      const heading = document.createElement("h3");
      heading.textContent =
        SECURITY_CONTROLS.find((control) => control.id === event.controlId)?.name ??
        event.controlId;
      const category = document.createElement("span");
      category.className = "category";
      category.textContent = event.type.replaceAll("_", " ");
      header.append(heading, category);
      const context = document.createElement("p");
      context.textContent = `${browserNames[event.browser]} · ${event.beforeVersion ?? "not included"} to ${event.afterVersion ?? "not included"}`;
      const detail = document.createElement("p");
      detail.className = "assurance-evidence";
      detail.textContent = event.summary;
      article.append(header, context, detail);
      comparisonEvents.append(article);
    }
    comparisonSource.textContent = `${comparison.beforeProfile.name} to ${comparison.afterProfile.name} · BCD ${comparison.bcdVersion}`;
    comparisonSection.hidden = false;
    latestComparison = comparison;
  }

  function updateComparison(): void {
    if (!comparisonBaseline || !latestEvaluation) {
      comparisonSection.hidden = true;
      latestComparison = undefined;
      return;
    }
    renderComparison(compareProfileEvaluations(comparisonBaseline, latestEvaluation));
  }

  function applyResultFilters(): void {
    const query = resultSearch.value.trim().toLocaleLowerCase("en-AU");
    const category = resultCategory.value;
    const outcome = resultOutcome.value;
    const blockersOnly = resultBlockers.checked;
    const cards = [...resultsList.querySelectorAll<HTMLElement>("[data-result-card]")];
    let visible = 0;
    for (const card of cards) {
      const group = card.dataset.resultGroup ?? "";
      const matches =
        (query.length === 0 || (card.dataset.search ?? "").includes(query)) &&
        (category.length === 0 || card.dataset.category === category) &&
        (outcome.length === 0 || group === outcome) &&
        (!blockersOnly || group !== "ready");
      card.hidden = !matches;
      if (matches) visible += 1;
    }
    for (const section of resultsList.querySelectorAll<HTMLElement>("[data-result-section]")) {
      const visibleCards = section.querySelectorAll<HTMLElement>(
        "[data-result-card]:not([hidden])"
      ).length;
      section.hidden = visibleCards === 0;
      const heading = section.querySelector<HTMLElement>("[data-result-heading]");
      if (heading) {
        heading.textContent = `${section.dataset.resultTitle ?? "Results"} (${String(
          visibleCards
        )})`;
      }
    }
    resultFilterStatus.textContent =
      visible === cards.length
        ? `Showing all ${String(cards.length)} security features.`
        : visible === 0
          ? "No security features match these filters."
          : `Showing ${String(visible)} of ${String(cards.length)} security features.`;
  }

  function showRememberedUpdate(current: ProfileEvaluation): boolean {
    if (!rememberResult.checked) {
      updateNotice.hidden = true;
      return false;
    }
    if (rememberedEvaluation) {
      const update = summariseEvaluationUpdate(rememberedEvaluation, current);
      if (update.state === "source_updated") {
        updateNotice.textContent = `The bundled browser data changed from ${update.previousBcdVersion} to ${update.currentBcdVersion}. For this same plan, ${String(update.changed)} browser-feature results changed, ${String(update.added)} were added, and ${String(update.removed)} were removed. Review the affected features before changing a policy.`;
        updateNotice.hidden = false;
      } else if (update.state === "different_profile") {
        updateNotice.textContent =
          "The remembered result used a different browser plan, so it was not treated as a data-update comparison. This result is now the remembered baseline.";
        updateNotice.hidden = false;
      } else {
        updateNotice.textContent = `The remembered result already uses browser data ${update.bcdVersion} and catalogue ${update.catalogueVersion}; there is no source update to compare.`;
        updateNotice.hidden = false;
      }
    } else {
      updateNotice.textContent =
        "This result is now remembered on this device. A future version of the site can compare the same plan after its bundled browser data changes.";
      updateNotice.hidden = false;
    }
    try {
      saveEvaluation(storage, current);
      rememberedEvaluation = current;
      return true;
    } catch (error) {
      rememberResult.checked = Boolean(rememberedEvaluation);
      updateNotice.textContent =
        error instanceof Error ? error.message : "The result was not saved.";
      updateNotice.hidden = false;
      return false;
    }
  }

  function render(evaluation: ProfileEvaluation): void {
    resultsList.replaceChildren();
    const grouped = new Map<ResultGroupId, HTMLElement[]>(
      resultGroups.map((group) => [group.id, []])
    );
    for (const control of SECURITY_CONTROLS) {
      const article = document.createElement("article");
      article.className = "result-card";
      article.dataset.resultCard = "";
      const header = document.createElement("div");
      header.className = "result-card__header";
      const heading = document.createElement("h3");
      const link = document.createElement("a");
      link.href = `${basePath}/controls/${control.id}/`;
      link.textContent = control.name;
      heading.append(link);
      const category = document.createElement("span");
      category.className = "category";
      category.textContent = control.category;
      header.append(heading, category);
      article.append(header);

      const evaluations = evaluation.results[control.id] ?? [];
      const group = classifyResult(evaluations);
      article.dataset.resultGroup = group;
      article.dataset.category = control.category;
      article.dataset.search =
        `${control.name} ${control.shortName} ${control.category} ${control.summary}`.toLocaleLowerCase(
          "en-AU"
        );
      const why = document.createElement("details");
      why.className = "result-card__why";
      const whySummary = document.createElement("summary");
      whySummary.textContent = "Why?";
      const list = document.createElement("ul");
      for (const item of evaluations) {
        const row = document.createElement("li");
        const browser = document.createElement("strong");
        browser.textContent = `${browserNames[item.browser]} ${item.minimumVersion}`;
        const badge = document.createElement("span");
        badge.className = resultClass(item.outcome);
        const dot = document.createElement("span");
        dot.className = "outcome__dot";
        dot.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "outcome__label";
        label.textContent = outcomeLabels[item.outcome];
        badge.append(dot, label);
        const detail = document.createElement("p");
        detail.textContent = item.explanation;
        row.append(browser, badge, detail);
        list.append(row);
      }
      why.append(whySummary, list);
      const action = document.createElement("div");
      action.className = "result-card__next";
      const actionHeading = document.createElement("strong");
      actionHeading.textContent = "What should I do next?";
      const actionDetail = document.createElement("p");
      actionDetail.textContent = nextStep(group, control.fallback);
      action.append(actionHeading, actionDetail);
      article.append(why, action);
      grouped.get(group)?.push(article);
    }
    for (const group of resultGroups) {
      const cards = grouped.get(group.id) ?? [];
      if (cards.length === 0) continue;
      const section = document.createElement("section");
      section.className = `result-group result-group--${group.id}`;
      section.dataset.resultSection = "";
      section.dataset.resultTitle = group.title;
      section.setAttribute("aria-labelledby", `result-group-${group.id}`);
      const headingRow = document.createElement("div");
      headingRow.className = "result-group__heading";
      const heading = document.createElement("h3");
      heading.dataset.resultHeading = "";
      heading.id = `result-group-${group.id}`;
      heading.textContent = `${group.title} (${String(cards.length)})`;
      const description = document.createElement("p");
      description.textContent = group.description;
      headingRow.append(heading, description);
      const grid = document.createElement("div");
      grid.className = "results-list result-group__cards";
      grid.append(...cards);
      section.append(headingRow, grid);
      resultsList.append(section);
    }
    resultsSource.textContent = `BCD ${evaluation.bcdVersion} · catalogue ${evaluation.catalogueVersion}`;
    results.hidden = false;
    exportButton.disabled = false;
    reportButton.disabled = false;
    latestEvaluation = evaluation;
    resetPolicy();
    applyResultFilters();
    showRememberedUpdate(evaluation);
    updateComparison();
  }

  for (const browser of browsers) {
    browserCheckbox(browser).addEventListener("change", () => {
      browserSelect(browser).disabled = !browserCheckbox(browser).checked;
      invalidateEvaluation();
    });
    browserSelect(browser).addEventListener("change", () => invalidateEvaluation());
  }
  profileName().addEventListener("input", () => invalidateEvaluation());

  function invalidateEvaluation(preserveComparisonInput = false): void {
    results.hidden = true;
    comparisonSection.hidden = true;
    latestEvaluation = undefined;
    latestComparison = undefined;
    if (!preserveComparisonInput) comparisonBaseline = undefined;
    updateNotice.hidden = true;
    exportButton.disabled = true;
    reportButton.disabled = true;
    resetPolicy();
  }

  for (const input of [resultSearch, resultCategory, resultOutcome, resultBlockers]) {
    input.addEventListener("input", applyResultFilters);
    input.addEventListener("change", applyResultFilters);
  }

  document.querySelector("#clear-result-filters")?.addEventListener("click", () => {
    resultSearch.value = "";
    resultCategory.value = "";
    resultOutcome.value = "";
    resultBlockers.checked = false;
    applyResultFilters();
    resultSearch.focus();
  });

  rememberResult.addEventListener("change", () => {
    if (!rememberResult.checked) {
      try {
        clearEvaluation(storage);
      } catch (error) {
        rememberResult.checked = Boolean(rememberedEvaluation);
        message.textContent =
          error instanceof Error ? error.message : "Saved result could not be deleted.";
        return;
      }
      rememberedEvaluation = undefined;
      updateNotice.hidden = true;
      message.textContent = "Remembered support result cleared from this browser.";
      return;
    }
    if (latestEvaluation) {
      const saved = showRememberedUpdate(latestEvaluation);
      message.textContent = saved
        ? "The latest result is now remembered on this device."
        : "The current result was not saved; any earlier remembered result remains unchanged. Continue in this session.";
    } else {
      message.textContent =
        "Select Check support to create the first result remembered on this device.";
    }
  });

  function policyRule(select: HTMLSelectElement): "review" | "fail" {
    if (select.value === "review" || select.value === "fail") return select.value;
    throw new Error("Choose a valid policy decision rule.");
  }

  function checkedPolicyControls(): string[] {
    return [
      ...document.querySelectorAll<HTMLInputElement>('input[name="required-control"]:checked')
    ].map((input) => input.value);
  }

  function renderPolicyExceptions(): void {
    exceptionList.replaceChildren();
    if (policyExceptions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "form-message";
      empty.textContent = "No temporary exceptions recorded.";
      exceptionList.append(empty);
      return;
    }
    policyExceptions.forEach((exception, index) => {
      const article = document.createElement("article");
      article.className = "exception-card";
      const detail = document.createElement("p");
      const controlName =
        SECURITY_CONTROLS.find((control) => control.id === exception.controlId)?.name ??
        exception.controlId;
      const browserScope = exception.browsers
        ? exception.browsers.map((browser) => browserNames[browser]).join(", ")
        : "all selected browsers";
      detail.textContent = `${controlName} · ${browserScope} · ${outcomeLabels[exception.outcomes[0] ?? "unknown"]} · expires ${exception.expiresOn}. ${exception.reason}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove exception for ${controlName}`);
      remove.addEventListener("click", () => {
        policyExceptions = policyExceptions.filter(
          (_candidate, candidateIndex) => candidateIndex !== index
        );
        renderPolicyExceptions();
        resetPolicy();
      });
      article.append(detail, remove);
      exceptionList.append(article);
    });
  }

  function policyDecisionLabel(decision: PolicyDecision): string {
    if (decision === "review") return "Require review";
    return decision === "pass" ? "Pass" : "Fail";
  }

  function daysUntil(date: string, from = new Date()): number {
    const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    return Math.floor((Date.parse(`${date}T00:00:00Z`) - today) / (24 * 60 * 60 * 1_000));
  }

  function policyFindingCard(finding: PolicyFinding): HTMLElement {
    const article = document.createElement("article");
    article.className = "result-card policy-finding";
    article.dataset.policyFinding = "";
    article.dataset.decision = finding.decision;
    article.dataset.exception = finding.exceptionState ?? "";
    const control =
      SECURITY_CONTROLS.find((candidate) => candidate.id === finding.controlId) ?? undefined;
    article.dataset.search =
      `${control?.name ?? finding.controlId} ${browserNames[finding.browser]} ${finding.explanation} ${finding.exceptionReason ?? ""}`.toLocaleLowerCase(
        "en-AU"
      );

    const header = document.createElement("div");
    header.className = "result-card__header";
    const heading = document.createElement("h4");
    const link = document.createElement("a");
    link.href = `${basePath}/controls/${finding.controlId}/`;
    link.textContent = control?.name ?? finding.controlId;
    heading.append(link);
    const decision = document.createElement("span");
    decision.className = `policy-decision policy-decision--${finding.decision}`;
    decision.textContent = policyDecisionLabel(finding.decision);
    header.append(heading, decision);

    const context = document.createElement("p");
    context.textContent = `${browserNames[finding.browser]} ${finding.minimumVersion}`;
    const outcome = document.createElement("span");
    outcome.className = resultClass(finding.outcome);
    const dot = document.createElement("span");
    dot.className = "outcome__dot";
    dot.setAttribute("aria-hidden", "true");
    const outcomeLabel = document.createElement("span");
    outcomeLabel.className = "outcome__label";
    outcomeLabel.textContent = outcomeLabels[finding.outcome];
    outcome.append(dot, outcomeLabel);
    const explanation = document.createElement("p");
    explanation.className = "assurance-evidence";
    explanation.textContent = finding.explanation;
    article.append(header, context, outcome, explanation);

    if (finding.exceptionState) {
      const exception = document.createElement("p");
      exception.className = `policy-exception-state policy-exception-state--${finding.exceptionState}`;
      const remaining =
        finding.exceptionState === "active" && finding.exceptionExpiresOn
          ? daysUntil(finding.exceptionExpiresOn)
          : undefined;
      if (remaining !== undefined && remaining >= 0 && remaining <= 30) {
        exception.classList.add("policy-exception-state--expiring");
        article.dataset.expiringException = "";
      }
      exception.textContent =
        finding.exceptionState === "active"
          ? `${remaining !== undefined && remaining >= 0 && remaining <= 30 ? `Expires in ${String(remaining)} day${remaining === 1 ? "" : "s"}` : "Active exception"} until ${finding.exceptionExpiresOn ?? "unknown"}: ${finding.exceptionReason ?? "No reason supplied."}`
          : `Expired exception from ${finding.exceptionExpiresOn ?? "unknown"}: ${finding.exceptionReason ?? "No reason supplied."}`;
      article.append(exception);
    }
    return article;
  }

  function applyPolicyFilters(): void {
    const query = policySearch.value.trim().toLocaleLowerCase("en-AU");
    const decision = policyDecision.value;
    const exceptionsOnly = policyExceptionsOnly.checked;
    const cards = [...policyFindings.querySelectorAll<HTMLElement>("[data-policy-finding]")];
    let visible = 0;
    for (const card of cards) {
      const matches =
        (query.length === 0 || (card.dataset.search ?? "").includes(query)) &&
        (decision.length === 0 || card.dataset.decision === decision) &&
        (!exceptionsOnly || Boolean(card.dataset.exception));
      card.hidden = !matches;
      if (matches) visible += 1;
    }
    policyFilterStatus.textContent =
      visible === cards.length
        ? `Showing all ${String(cards.length)} policy findings.`
        : visible === 0
          ? "No policy findings match these filters."
          : `Showing ${String(visible)} of ${String(cards.length)} policy findings.`;
  }

  function renderPolicyFindings(decision: PolicyEvaluation): void {
    policyFindings.replaceChildren(...decision.findings.map(policyFindingCard));
    applyPolicyFilters();
  }

  function createPolicy(): PolicyProfile {
    if (!latestEvaluation) {
      throw new Error("Check browser support before creating a policy.");
    }
    if (JSON.stringify(latestEvaluation.profile) !== JSON.stringify(readProfile()))
      throw new Error("The browser plan changed. Check support again before creating a policy.");
    return buildPolicyProfile({
      profile: latestEvaluation.profile,
      requiredControls: checkedPolicyControls(),
      rules: {
        qualifications: policyRule(policyQualifications),
        unknown: policyRule(policyUnknown),
        unsupported: policyRule(policyUnsupported)
      },
      exceptions: policyExceptions
    });
  }

  function previewPolicy(): void {
    const policy = createPolicy();
    const decision = evaluatePolicyProfile(
      selectedSnapshot,
      policy,
      new Date().toISOString().slice(0, 10)
    );
    latestPolicy = policy;
    latestPolicyEvaluation = decision;
    policySummary.replaceChildren(
      stat(decision.summary.pass, "pass"),
      stat(decision.summary.review, "require review"),
      stat(decision.summary.fail, "fail")
    );
    renderPolicyFindings(decision);
    policyJson.textContent = exportPolicyProfile(policy);
    policyCiContext.textContent = `Run this check from a reviewed ControlCurrent checkout that bundles MDN browser data ${decision.bcdVersion} and catalogue ${decision.catalogueVersion}. A later source snapshot may produce a different result and should be reviewed.`;
    policyCiCommand.textContent = `npm run cli -- check path/to/controlcurrent-policy.json --as-of ${decision.evaluatedAsOf} --strict-review --format junit\nnpm run cli -- compare-policies path/to/previous-policy.json path/to/controlcurrent-policy.json --as-of ${decision.evaluatedAsOf} --warn-expiring-days 30 --fail-regression --format markdown`;
    policyPreview.hidden = false;
    exportPolicyButton.disabled = false;
    exportDecisionButton.disabled = false;
    exportDecisionPacketButton.disabled = !decisionEvidence;
    const expiringExceptions = decision.findings.filter(
      (finding) =>
        finding.exceptionState === "active" &&
        finding.exceptionExpiresOn &&
        daysUntil(finding.exceptionExpiresOn) >= 0 &&
        daysUntil(finding.exceptionExpiresOn) <= 30
    ).length;
    const baseMessage =
      decision.summary.fail > 0
        ? "The policy has failing browser-feature decisions. Review them before adoption."
        : decision.summary.review > 0
          ? "The policy has decisions that require a human review."
          : "Every required browser-feature decision passes the selected rules.";
    policyMessage.textContent =
      expiringExceptions > 0
        ? `${baseMessage} ${String(expiringExceptions)} exception finding${expiringExceptions === 1 ? "" : "s"} expire within 30 days.`
        : baseMessage;
  }

  for (const input of [policySearch, policyDecision, policyExceptionsOnly]) {
    input.addEventListener("input", applyPolicyFilters);
    input.addEventListener("change", applyPolicyFilters);
  }

  document.querySelector("#clear-policy-filters")?.addEventListener("click", () => {
    policySearch.value = "";
    policyDecision.value = "";
    policyExceptionsOnly.checked = false;
    applyPolicyFilters();
    policySearch.focus();
  });

  document.querySelector("#select-policy-controls")?.addEventListener("click", () => {
    for (const input of document.querySelectorAll<HTMLInputElement>(
      'input[name="required-control"]'
    )) {
      input.checked = true;
    }
    resetPolicy();
  });

  document.querySelector("#clear-policy-controls")?.addEventListener("click", () => {
    for (const input of document.querySelectorAll<HTMLInputElement>(
      'input[name="required-control"]'
    )) {
      input.checked = false;
    }
    resetPolicy();
  });

  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    'input[name="required-control"], #policy-qualifications, #policy-unknown, #policy-unsupported'
  )) {
    input.addEventListener("change", resetPolicy);
  }

  document.querySelector("#add-policy-exception")?.addEventListener("click", () => {
    try {
      const selectedBrowser = exceptionBrowser.value;
      const outcome = exceptionOutcome.value as Outcome;
      const candidate: PolicyException = {
        controlId: exceptionControl.value,
        ...(selectedBrowser ? { browsers: [selectedBrowser as BrowserId] } : {}),
        outcomes: [outcome],
        reason: exceptionReason.value,
        expiresOn: exceptionExpiry.value
      };
      buildPolicyProfile({
        profile: latestEvaluation?.profile ?? readProfile(),
        requiredControls: checkedPolicyControls(),
        rules: {
          qualifications: policyRule(policyQualifications),
          unknown: policyRule(policyUnknown),
          unsupported: policyRule(policyUnsupported)
        },
        exceptions: [...policyExceptions, candidate]
      });
      policyExceptions = [...policyExceptions, candidate];
      exceptionReason.value = "";
      renderPolicyExceptions();
      resetPolicy();
      policyMessage.textContent = "Temporary exception added locally.";
    } catch (error) {
      policyMessage.textContent =
        error instanceof Error ? error.message : "The exception could not be added.";
    }
  });

  document.querySelector("#preview-policy")?.addEventListener("click", () => {
    try {
      previewPolicy();
    } catch (error) {
      resetPolicy();
      policyMessage.textContent =
        error instanceof Error ? error.message : "The policy could not be evaluated.";
    }
  });

  exportPolicyButton.addEventListener("click", () => {
    if (!latestPolicy) return;
    try {
      download(exportPolicyProfile(latestPolicy), "controlcurrent-policy.json", "application/json");
      policyMessage.textContent = "Policy JSON generated locally.";
    } catch (error) {
      policyMessage.textContent = error instanceof Error ? error.message : "Export failed locally.";
    }
  });

  listenAsync(exportDecisionButton, "click", message, async () => {
    if (!latestEvaluation || !latestPolicyEvaluation) return;
    const token = operations.begin();
    const evaluation = latestEvaluation;
    const policy = latestPolicyEvaluation;
    try {
      const exported = await exportDecisionReport(evaluation, policy);
      if (!operations.current(token)) return;
      download(exported, "controlcurrent-decision-report.html", "text/html");
      policyMessage.textContent = "Printable decision report generated locally.";
    } catch (error) {
      if (!operations.current(token)) return;
      policyMessage.textContent =
        error instanceof Error ? error.message : "The decision report could not be generated.";
    }
  });

  listenAsync(decisionEvidenceInput, "change", message, async () => {
    const token = operations.begin();
    const file = decisionEvidenceInput.files?.[0];
    decisionEvidence = undefined;
    exportDecisionPacketButton.disabled = true;
    decisionEvidenceStatus.textContent = "Reading and validating the attachment locally…";
    try {
      const parsed = JSON.parse(
        await readFile(decisionEvidenceInput, MAX_DECISION_PACKET_BYTES)
      ) as unknown;
      const evidence = await validateDecisionPacketEvidence(parsed);
      if (!operations.current(token)) return;
      decisionEvidence = evidence;
      decisionEvidenceStatus.textContent =
        decisionEvidence.kind === "reduced_evidence_report"
          ? `Reduced evidence report attached locally · ${decisionEvidence.report.name} · fingerprint ${decisionEvidence.fingerprint.slice(0, 12)}…`
          : `Evidence-policy result attached locally · ${decisionEvidence.evaluation.profile.name} · ${String(decisionEvidence.evaluation.summary.fail)} fail, ${String(decisionEvidence.evaluation.summary.review)} review.`;
      exportDecisionPacketButton.disabled = !latestPolicyEvaluation;
    } catch (error) {
      if (!operations.current(token)) return;
      decisionEvidence = undefined;
      exportDecisionPacketButton.disabled = true;
      decisionEvidenceStatus.textContent =
        error instanceof Error
          ? error.message
          : "The supplied evidence result could not be attached.";
    } finally {
      if (decisionEvidenceInput.files?.[0] === file) decisionEvidenceInput.value = "";
    }
  });

  listenAsync(exportDecisionPacketButton, "click", message, async () => {
    if (!latestPolicyEvaluation || !decisionEvidence) return;
    const token = operations.begin();
    const policy = latestPolicyEvaluation;
    const attachment = decisionEvidence;
    try {
      const evidence =
        attachment.kind === "reduced_evidence_report" ? attachment.report : attachment.evaluation;
      const packet = await buildDecisionPacket(
        policy,
        evidence,
        new Date().toISOString().slice(0, 10)
      );
      const exported = await exportDecisionPacket(packet);
      if (!operations.current(token)) return;
      download(exported, "controlcurrent-decision-packet.json", "application/json");
      decisionEvidenceStatus.textContent =
        "Two-part decision packet generated locally. Browser availability and supplied evidence remain separate.";
    } catch (error) {
      if (!operations.current(token)) return;
      decisionEvidenceStatus.textContent =
        error instanceof Error ? error.message : "The decision packet could not be generated.";
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    invalidateEvaluation(true);
    try {
      const evaluation = evaluateProfile(selectedSnapshot, readProfile());
      render(evaluation);
      message.textContent = "Support checked on this device. No data was sent anywhere.";
    } catch (error) {
      message.textContent =
        error instanceof Error ? error.message : "The profile could not be evaluated.";
    }
  });

  document.querySelector("#load-example")?.addEventListener("click", () => {
    invalidateEvaluation();
    applyProfile({
      schemaVersion: 1,
      name: "Example browser baseline",
      baselines: [
        { browser: "chrome", minimumVersion: "120" },
        { browser: "firefox", minimumVersion: "115" },
        { browser: "safari", minimumVersion: "17" }
      ]
    });
    message.textContent = "Example values loaded. Select Check support to see the results.";
  });

  document.querySelector("#save-profile")?.addEventListener("click", () => {
    try {
      saveProfile(storage, readProfile());
      message.textContent = "Profile saved in this browser only.";
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : "Profile was not saved.";
    }
  });

  document.querySelector("#clear-profile")?.addEventListener("click", () => {
    operations.cancel();
    const failures: string[] = [];
    try {
      clearProfile(storage);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Profile deletion failed.");
    }
    try {
      clearEvaluation(storage);
      rememberedEvaluation = undefined;
      rememberResult.checked = false;
      updateNotice.hidden = true;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Result deletion failed.");
    }
    if (failures.length > 0) {
      message.textContent = failures.join(" ");
      return;
    }
    rememberedEvaluation = undefined;
    rememberResult.checked = false;
    updateNotice.hidden = true;
    message.textContent = "Saved browser plan and remembered result cleared.";
  });

  exportButton.addEventListener("click", () => {
    if (!latestEvaluation) return;
    try {
      download(
        exportProfileEvaluation(latestEvaluation),
        "controlcurrent-profile.json",
        "application/json"
      );
      message.textContent = "Profile JSON generated locally.";
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : "Export failed locally.";
    }
  });

  reportButton.addEventListener("click", () => {
    if (!latestEvaluation) return;
    try {
      download(
        exportEngineeringReport(latestEvaluation, latestComparison),
        "controlcurrent-engineering-report.md",
        "text/markdown"
      );
      message.textContent = "Engineering report generated locally.";
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : "Export failed locally.";
    }
  });

  listenAsync(importInput, "change", message, async () => {
    invalidateEvaluation();
    const token = operations.begin();
    const file = importInput.files?.[0];
    try {
      const imported = importDeploymentProfile(await readJsonFile(importInput));
      if (!operations.current(token)) return;
      applyProfile(imported);
      invalidateEvaluation();
      message.textContent =
        "Plan imported on this device. Select Check support to see the current results.";
    } catch (error) {
      if (!operations.current(token)) return;
      message.textContent =
        error instanceof Error ? error.message : "The profile could not be imported.";
    } finally {
      if (importInput.files?.[0] === file) importInput.value = "";
    }
  });

  listenAsync(importPolicyInput, "change", message, async () => {
    invalidateEvaluation();
    const token = operations.begin();
    const file = importPolicyInput.files?.[0];
    let applying = false;
    try {
      const policy = importPolicyProfile(
        await readFile(importPolicyInput, MAX_POLICY_IMPORT_BYTES)
      );
      if (!operations.current(token)) return;
      applying = true;
      applyProfile(
        {
          schemaVersion: 1,
          name: policy.name,
          baselines: policy.baselines
        },
        true
      );
      const requiredControls = new Set(policy.requiredControls);
      for (const input of document.querySelectorAll<HTMLInputElement>(
        'input[name="required-control"]'
      )) {
        input.checked = requiredControls.has(input.value);
      }
      policyQualifications.value = policy.rules.qualifications;
      policyUnknown.value = policy.rules.unknown;
      policyUnsupported.value = policy.rules.unsupported;
      policyExceptions = [...policy.exceptions];
      renderPolicyExceptions();
      render(evaluateProfile(selectedSnapshot, readProfile()));
      previewPolicy();
      policyMessage.textContent =
        "Policy imported and checked locally against this version's browser data.";
    } catch (error) {
      // Rendering deliberately starts a new generation. Synchronous failures
      // after the current import is accepted must still be announced.
      if (!applying && !operations.current(token)) return;
      policyMessage.textContent =
        error instanceof Error ? error.message : "The policy could not be imported.";
    } finally {
      if (importPolicyInput.files?.[0] === file) importPolicyInput.value = "";
    }
  });

  listenAsync(browserConfigInput, "change", message, async () => {
    invalidateEvaluation();
    const token = operations.begin();
    const selectedFile = browserConfigInput.files?.[0];
    try {
      const file = browserConfigInput.files?.[0];
      if (!file) throw new Error("Choose a .browserslistrc or package.json file first.");
      const imported = importBrowserConfiguration(
        await readFile(browserConfigInput, MAX_BROWSER_CONFIG_BYTES),
        file.name === "package.json"
          ? "Imported package browser minimums"
          : "Imported browser minimums"
      );
      if (!operations.current(token)) return;
      applyProfile(imported, true);
      invalidateEvaluation();
      message.textContent = `${String(imported.baselines.length)} explicit browser minimums imported locally. Select Check support to review them.`;
    } catch (error) {
      if (!operations.current(token)) return;
      message.textContent =
        error instanceof Error ? error.message : "The browser configuration could not be imported.";
    } finally {
      if (browserConfigInput.files?.[0] === selectedFile) browserConfigInput.value = "";
    }
  });

  listenAsync(compareInput, "change", message, async () => {
    const token = operations.begin();
    const file = compareInput.files?.[0];
    comparisonBaseline = undefined;
    latestComparison = undefined;
    comparisonSection.hidden = true;
    message.textContent = "Reading the earlier evaluation on this device…";
    try {
      const imported = profileEvaluationSchema.parse(
        JSON.parse(await readJsonFile(compareInput)) as unknown
      );
      if (!operations.current(token)) return;
      // Validate selectable releases before retaining comparison inputs, without changing the form.
      for (const baseline of imported.profile.baselines) {
        if (
          ![...browserSelect(baseline.browser).options].some(
            (option) => option.value === baseline.minimumVersion
          )
        )
          throw new Error(
            "Imported comparison contains a browser version unavailable in this snapshot."
          );
      }
      comparisonBaseline = imported;
      updateComparison();
      message.textContent = latestEvaluation
        ? "Earlier evaluation compared locally."
        : "Earlier evaluation loaded. Evaluate the current profile to compare it.";
    } catch (error) {
      if (!operations.current(token)) return;
      comparisonBaseline = undefined;
      comparisonSection.hidden = true;
      latestComparison = undefined;
      message.textContent =
        error instanceof Error ? error.message : "The comparison could not be loaded.";
    } finally {
      if (compareInput.files?.[0] === file) compareInput.value = "";
    }
  });

  const stored = loadProfile(storage);
  if (stored.state === "loaded") {
    try {
      applyProfile(stored.profile);
      message.textContent = "A saved local profile was loaded. Nothing was sent to a server.";
    } catch (error) {
      message.textContent =
        error instanceof Error ? error.message : "Saved browser versions are unavailable.";
    }
  } else if (stored.state === "future_version") {
    message.textContent =
      "A newer saved profile was left untouched because this version cannot read it.";
  } else if (stored.state === "invalid") {
    message.textContent = "The saved local profile is invalid and was not loaded.";
  } else if (stored.state === "unavailable") {
    message.textContent =
      "Local storage is unavailable. Continue in this session and export files.";
  }

  const storedEvaluation = loadEvaluation(storage);
  if (storedEvaluation.state === "loaded") {
    const supported = storedEvaluation.evaluation.profile.baselines.every((baseline) =>
      [...browserSelect(baseline.browser).options].some(
        (option) => option.value === baseline.minimumVersion
      )
    );
    if (supported) {
      rememberedEvaluation = storedEvaluation.evaluation;
      rememberResult.checked = true;
    }
    message.textContent =
      `${message.textContent} ${supported ? "A previous support result is remembered for an update comparison." : "Saved results use unavailable versions and were left untouched."}`.trim();
  } else if (storedEvaluation.state === "future_version") {
    message.textContent =
      `${message.textContent} A result from a newer version was left untouched and will not be overwritten automatically.`.trim();
  } else if (storedEvaluation.state === "invalid") {
    message.textContent = `${message.textContent} An invalid remembered result was ignored.`.trim();
  }

  const defaultExceptionExpiry = new Date();
  defaultExceptionExpiry.setUTCDate(defaultExceptionExpiry.getUTCDate() + 30);
  exceptionExpiry.value = defaultExceptionExpiry.toISOString().slice(0, 10);
  renderPolicyExceptions();
}
