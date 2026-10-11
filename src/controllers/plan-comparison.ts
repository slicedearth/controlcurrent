import { requiredElement } from "./dom";
import { BROWSER_IDS } from "../browsers";
import { selectedSnapshot } from "../data";
import { SECURITY_CONTROLS } from "../catalogue";
import { browserNames, outcomeLabels } from "../format";
import type { DeploymentProfile, ProfileComparison } from "../contracts";
import { evaluateProfile } from "../evaluate";
import { compareProfileEvaluations } from "../profile-workflows";
import { suggestPlanUpgrade } from "../plan-comparison";
import { planFragment, validatePlan } from "../plan-transfer";
import { consumePlanTransfer } from "./plan-transfer";
import { readPlanLibrary } from "../plan-library";
import { guardedStorage } from "../local-state";
import { canonicalJson } from "../canonical";
import { downloadText } from "./download";

export function initialisePlanComparison(document: Document, baseUrl: string): void {
  const form = requiredElement(document, "#compare-plans-form", HTMLFormElement);
  const status = requiredElement(document, "#compare-plans-status", HTMLElement);
  const results = requiredElement(document, "#live-comparison", HTMLElement);
  const rows = requiredElement(document, "#live-comparison-rows", HTMLElement);
  const changesOnly = requiredElement(document, "#comparison-changes-only", HTMLInputElement);
  const upgradeStatus = requiredElement(document, "#upgrade-status", HTMLElement);
  const applyUpgrade = requiredElement(document, "#apply-upgrade", HTMLButtonElement);
  const storage = guardedStorage(() => window.localStorage);
  const base = baseUrl.replace(/\/$/u, "");
  let latest: ProfileComparison | undefined;
  let proposed: DeploymentProfile | undefined;
  const input = (name: string) => requiredElement(form, `[name="${name}"]`, HTMLInputElement);
  const version = (side: string, browser: string) =>
    requiredElement(form, `[name="${side}-version-${browser}"]`, HTMLSelectElement);
  function read(side: string): DeploymentProfile {
    return validatePlan(selectedSnapshot, {
      schemaVersion: 1,
      name: input(`${side}-name`).value,
      baselines: BROWSER_IDS.flatMap((browser) =>
        input(`${side}-include-${browser}`).checked
          ? [{ browser, minimumVersion: version(side, browser).value }]
          : []
      )
    });
  }
  function apply(side: string, profile: DeploymentProfile): void {
    validatePlan(selectedSnapshot, profile);
    input(`${side}-name`).value = profile.name;
    for (const browser of BROWSER_IDS) {
      const baseline = profile.baselines.find((item) => item.browser === browser);
      input(`${side}-include-${browser}`).checked = Boolean(baseline);
      version(side, browser).disabled = !baseline;
      if (baseline) version(side, browser).value = baseline.minimumVersion;
    }
  }
  function invalidateUpgrade(): void {
    proposed = undefined;
    applyUpgrade.disabled = true;
    upgradeStatus.textContent = "";
  }
  function filterRows(): void {
    const allRows = [...rows.querySelectorAll<HTMLElement>("tr")];
    for (const row of allRows)
      row.hidden = changesOnly.checked && row.dataset.materialChange !== "true";
    const visible = allRows.filter((row) => !row.hidden).length;
    requiredElement(document, "#comparison-visible-count", HTMLElement).textContent =
      `${String(visible)} of ${String(allRows.length)} browser-feature results shown. Complete totals above include hidden rows. No results are truncated.`;
  }
  function compare(): void {
    results.hidden = true;
    latest = undefined;
    try {
      const before = evaluateProfile(selectedSnapshot, read("before"));
      const after = evaluateProfile(selectedSnapshot, read("after"));
      const comparison = compareProfileEvaluations(before, after);
      const s = comparison.summary;
      requiredElement(document, "#live-comparison-totals", HTMLElement).textContent =
        `${String(s.gained)} gained · ${String(s.lost)} lost · ${String(s.newlyQualified)} newly limited · ${String(s.qualificationRemoved)} limitations removed · ${String(s.changed)} other outcome changes · ${String(s.baselineChanged)} minimum changes with the same outcome · ${String(s.scopeAdded)} scope additions · ${String(s.scopeRemoved)} scope removals · ${String(s.unchanged)} unchanged.`;
      requiredElement(document, "#comparison-context", HTMLElement).textContent =
        `${before.profile.name} → ${after.profile.name} · BCD ${comparison.bcdVersion} · catalogue ${comparison.catalogueVersion}`;
      rows.replaceChildren();
      for (const control of SECURITY_CONTROLS)
        for (const browser of BROWSER_IDS) {
          const a = before.results[control.id]?.find((item) => item.browser === browser);
          const b = after.results[control.id]?.find((item) => item.browser === browser);
          if (!a && !b) continue;
          const event = comparison.events.find(
            (item) => item.controlId === control.id && item.browser === browser
          );
          const row = document.createElement("tr");
          row.dataset.materialChange = String(Boolean(event && event.type !== "baseline_changed"));
          const label = (item: typeof a) =>
            item ? `${item.minimumVersion} · ${outcomeLabels[item.outcome]}` : "Outside this plan";
          for (const [index, value] of [
            control.shortName,
            browserNames[browser],
            label(a),
            label(b),
            event?.summary ?? "Unchanged"
          ].entries()) {
            const cell = document.createElement(index === 0 ? "th" : "td");
            if (index === 0) cell.setAttribute("scope", "row");
            cell.textContent = value;
            row.append(cell);
          }
          rows.append(row);
        }
      requiredElement(document, "#use-plan-a", HTMLAnchorElement).href =
        `${base}/planner/${planFragment(selectedSnapshot, before.profile)}`;
      requiredElement(document, "#use-plan-b", HTMLAnchorElement).href =
        `${base}/planner/${planFragment(selectedSnapshot, after.profile)}`;
      latest = comparison;
      results.hidden = false;
      filterRows();
      status.textContent = "Both plans evaluated locally against the same source snapshot.";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "The plans could not be compared.";
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    compare();
  });
  form.addEventListener("change", () => {
    for (const side of ["before", "after"])
      for (const browser of BROWSER_IDS)
        version(side, browser).disabled = !input(`${side}-include-${browser}`).checked;
    invalidateUpgrade();
    compare();
  });
  form.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "text") {
      latest = undefined;
      results.hidden = true;
      invalidateUpgrade();
      status.textContent = "Plan name changed. Compare plans to update the result.";
    }
  });
  const action = (id: string, run: () => void) =>
    requiredElement(document, id, HTMLButtonElement).addEventListener("click", () => {
      try {
        run();
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : "The plan could not be changed.";
      }
    });
  action("#copy-plan", () => {
    apply("after", { ...read("before"), name: "Proposed browser plan" });
    invalidateUpgrade();
    compare();
  });
  action("#swap-plans", () => {
    const a = read("before");
    const b = read("after");
    apply("before", b);
    apply("after", a);
    invalidateUpgrade();
    compare();
  });
  action("#export-plan-comparison", () => {
    if (!latest) throw new Error("Compare the current plans before exporting.");
    downloadText(canonicalJson(latest), "controlcurrent-plan-comparison.json", "application/json");
    status.textContent = "Complete comparison exported locally.";
  });
  requiredElement(document, "#find-upgrade", HTMLButtonElement).addEventListener("click", () => {
    invalidateUpgrade();
    try {
      const ids = [
        ...document.querySelectorAll<HTMLInputElement>('input[name="upgrade-control"]:checked')
      ].map((element) => element.value);
      const suggestion = suggestPlanUpgrade(
        selectedSnapshot,
        read("after"),
        ids,
        requiredElement(document, "#upgrade-qualified", HTMLInputElement).checked
      );
      proposed = suggestion.profile;
      applyUpgrade.disabled = !proposed;
      upgradeStatus.textContent = proposed
        ? proposed.baselines
            .map((baseline) => `${browserNames[baseline.browser]} ${baseline.minimumVersion}`)
            .join(" · ")
        : suggestion.minimums
            .filter((result) => result.status !== "found")
            .map(
              (result) =>
                `${browserNames[result.browser]}: ${result.blockers.map((id) => SECURITY_CONTROLS.find((control) => control.id === id)?.shortName ?? id).join(", ") || "no comparable releases"}`
            )
            .join(". ");
    } catch (error) {
      upgradeStatus.textContent =
        error instanceof Error ? error.message : "No minimums could be calculated.";
    }
  });
  for (const element of document.querySelectorAll<HTMLInputElement>(
    'input[name="upgrade-control"], #upgrade-qualified'
  ))
    element.addEventListener("change", invalidateUpgrade);
  action("#apply-upgrade", () => {
    if (!proposed) throw new Error("Calculate proposed minimums first.");
    apply("after", proposed);
    invalidateUpgrade();
    compare();
  });
  changesOnly.addEventListener("change", filterRows);
  for (const side of ["before", "after"]) {
    const select = requiredElement(document, `[data-saved-side="${side}"]`, HTMLSelectElement);
    const refresh = () => {
      try {
        const value = select.value;
        select.replaceChildren(
          new Option("Choose a saved plan", ""),
          ...readPlanLibrary(storage).plans.map((entry) => new Option(entry.profile.name, entry.id))
        );
        select.value = value;
      } catch {
        status.textContent = "Saved plans are unavailable. You can still edit both plans here.";
      }
    };
    refresh();
    select.addEventListener("focus", refresh);
    select.addEventListener("change", () => {
      try {
        const entry = readPlanLibrary(storage).plans.find((plan) => plan.id === select.value);
        if (entry) {
          apply(side, entry.profile);
          invalidateUpgrade();
          compare();
        }
      } catch (error) {
        results.hidden = true;
        latest = undefined;
        status.textContent =
          error instanceof Error ? error.message : "The saved plan could not be loaded.";
      }
    });
  }
  try {
    const transfer = consumePlanTransfer();
    if (transfer) {
      apply("before", transfer.profile);
      apply("after", { ...transfer.profile, name: "Proposed browser plan" });
    }
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "The transferred plan could not be read.";
    return;
  }
  compare();
}
