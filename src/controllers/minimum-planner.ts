import { requiredElement } from "./dom";
import { BROWSER_IDS } from "../browsers";
import { SECURITY_CONTROLS } from "../catalogue";
import type { BrowserId, MinimumBaselineResult } from "../contracts";
import { selectedSnapshot } from "../data";
import { browserNames } from "../format";
import { findMinimumBaselines } from "../minimums";

export function initialiseMinimumPlanner(document: Document = window.document): void {
  const form = requiredElement(document, "#minimum-form", HTMLFormElement);
  const message = requiredElement(document, "#minimum-message", HTMLElement);
  const results = requiredElement(document, "#minimum-results", HTMLElement);
  const source = requiredElement(document, "#minimum-source", HTMLElement);
  const list = requiredElement(document, "#minimum-result-list", HTMLElement);

  const controlNames = new Map<string, string>(
    SECURITY_CONTROLS.map((control) => [control.id, control.shortName] as const)
  );
  const browserIds = new Set<string>(BROWSER_IDS);

  function checkedValues(name: string): string[] {
    return [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map(
      (input) => input.value
    );
  }

  function statusLabel(result: MinimumBaselineResult): string {
    switch (result.status) {
      case "found":
        return "Version found";
      case "unavailable":
        return "No matching version";
      case "unsupported_mapping":
        return "Not enough browser data";
      case "source_inconsistent":
        return "Browser data problem";
    }
  }

  function render(calculated: MinimumBaselineResult[]): void {
    list.replaceChildren();
    for (const result of calculated) {
      const article = document.createElement("article");
      article.className = "result-card";
      const header = document.createElement("div");
      header.className = "result-card__header";
      const heading = document.createElement("h3");
      heading.textContent = browserNames[result.browser];
      const state = document.createElement("span");
      state.className = "category";
      state.textContent = statusLabel(result);
      header.append(heading, state);

      const summary = document.createElement("p");
      summary.textContent =
        result.status === "found"
          ? `Version ${result.minimumVersion ?? "unknown"} · released ${result.releaseDate ?? "date unavailable"}`
          : result.blockers.length === 0
            ? "No comparable retained release was available."
            : `Blocked by ${result.blockers.map((id) => controlNames.get(id) ?? id).join(", ")}.`;
      article.append(header, summary);
      list.append(article);
    }
    source.textContent = `BCD ${selectedSnapshot.bcdVersion} · catalogue ${selectedSnapshot.catalogueVersion}`;
    results.hidden = false;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const controlIds = checkedValues("minimum-control");
      const browserValues = checkedValues("minimum-browser");
      if (controlIds.length === 0) throw new Error("Select at least one required control.");
      if (browserValues.length === 0) throw new Error("Select at least one browser family.");
      const browsers = browserValues.map((value) => {
        if (!browserIds.has(value)) throw new Error(`Unknown browser: ${value}`);
        return value as BrowserId;
      });
      render(
        findMinimumBaselines(selectedSnapshot, {
          controlIds,
          browsers,
          allowQualified:
            document.querySelector<HTMLInputElement>("#allow-qualified")?.checked ?? false
        })
      );
      message.textContent = "Minimums calculated locally from the reviewed source snapshot.";
    } catch (error) {
      results.hidden = true;
      message.textContent =
        error instanceof Error ? error.message : "Minimums could not be calculated.";
    }
  });
}
