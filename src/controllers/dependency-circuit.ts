import { requiredElement } from "./dom";
import { evaluateCircuit } from "../dependency-circuits";
import { browserIdSchema } from "../contracts";
import { selectedSnapshot } from "../data";
import { browserNames, outcomeLabels } from "../format";
import { planFragment } from "../plan-transfer";

export function initialiseDependencyCircuit(document: Document, baseUrl: string): void {
  const form = requiredElement(document, "#dependency-form", HTMLFormElement);
  const goal = requiredElement(document, "#circuit-goal", HTMLSelectElement);
  const browser = requiredElement(document, "#dependency-browser", HTMLSelectElement);
  const alternative = requiredElement(document, "#circuit-alternative", HTMLSelectElement);
  const result = requiredElement(document, "#dependency-result", HTMLElement);
  const nodes = requiredElement(document, "#dependency-nodes", HTMLElement);
  const reviews = requiredElement(document, "#dependency-reviews", HTMLElement);
  const status = requiredElement(document, "#dependency-status", HTMLElement);
  const base = baseUrl.replace(/\/$/u, "");
  function reviewStatus(): void {
    const all = [...reviews.querySelectorAll<HTMLInputElement>("input")];
    requiredElement(document, "#dependency-review-status", HTMLElement).textContent =
      `${String(all.filter((input) => input.checked).length)} of ${String(all.length)} checks marked reviewed by you. Runtime behaviour remains unverified.`;
  }
  function trace(): void {
    result.hidden = true;
    try {
      const browserId = browserIdSchema.parse(browser.value);
      for (const label of document.querySelectorAll<HTMLElement>("[data-circuit-versions]"))
        label.hidden = label.dataset.circuitVersions !== browserId;
      const minimumVersion = requiredElement(
        document,
        `[data-version-for="${browserId}"]`,
        HTMLSelectElement
      ).value;
      const baseline = { browser: browserId, minimumVersion };
      const circuit = evaluateCircuit(
        selectedSnapshot,
        goal.value,
        baseline,
        alternative.value === "alternative" ? "alternative" : "primary"
      );
      requiredElement(document, "#dependency-title", HTMLElement).textContent = circuit.goal.name;
      requiredElement(document, "#dependency-baseline", HTMLElement).textContent =
        `${browserNames[browserId]} ${minimumVersion} and later recorded releases`;
      requiredElement(document, "#dependency-caveat", HTMLElement).textContent =
        circuit.goal.caveat;
      requiredElement(document, "#dependency-source", HTMLAnchorElement).href =
        circuit.goal.reference;
      requiredElement(document, "#dependency-plan", HTMLAnchorElement).href =
        `${base}/planner/${planFragment(
          selectedSnapshot,
          { schemaVersion: 1, name: circuit.goal.name, baselines: [baseline] },
          circuit.nodes.map((node) => node.control.id)
        )}`;
      nodes.replaceChildren();
      reviews.replaceChildren();
      const selectNode = (index: number) => {
        const node = circuit.nodes[index];
        if (!node) return;
        for (const [buttonIndex, button] of [...nodes.querySelectorAll("button")].entries())
          button.setAttribute("aria-pressed", String(buttonIndex === index));
        requiredElement(document, "#dependency-detail-title", HTMLElement).textContent =
          node.control.name;
        requiredElement(document, "#dependency-explanation", HTMLElement).textContent =
          node.evaluation.explanation;
        const notes = requiredElement(document, "#dependency-qualifications", HTMLElement);
        notes.replaceChildren();
        for (const note of [
          ...new Set(
            node.evaluation.featureEvaluations.flatMap((feature) => feature.qualifications)
          )
        ]) {
          const li = document.createElement("li");
          li.textContent = note;
          notes.append(li);
        }
        requiredElement(document, "#dependency-feature-link", HTMLAnchorElement).href =
          `${base}/controls/${node.control.id}/`;
      };
      for (const [index, node] of circuit.nodes.entries()) {
        const li = document.createElement("li");
        const relationship = document.createElement("span");
        relationship.className = "dependency-relationship";
        relationship.textContent = node.relationship;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dependency-terminal";
        button.dataset.outcome = node.evaluation.outcome;
        const name = document.createElement("strong");
        name.textContent = node.control.shortName;
        const reading = document.createElement("span");
        reading.textContent = outcomeLabels[node.evaluation.outcome];
        button.append(name, reading);
        button.addEventListener("click", () => selectNode(index));
        li.append(relationship, button);
        nodes.append(li);
      }
      for (const review of circuit.goal.reviews) {
        const label = document.createElement("label");
        label.className = "choice-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        const text = document.createElement("span");
        text.textContent = review;
        label.append(input, text);
        reviews.append(label);
      }
      const supported = circuit.nodes.filter(
        (node) => node.evaluation.outcome === "available_unqualified"
      ).length;
      const qualified = circuit.nodes.filter(
        (node) => node.evaluation.outcome === "available_with_qualification"
      ).length;
      requiredElement(document, "#dependency-reading", HTMLElement).textContent =
        `${String(supported)} supported without qualification · ${String(qualified)} with limits · ${String(circuit.nodes.length - supported - qualified)} unavailable or unresolved`;
      reviewStatus();
      selectNode(0);
      result.hidden = false;
      status.textContent =
        "Trace updated from the bundled browser data. Application review checks reset.";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "This circuit could not be evaluated.";
    }
  }
  goal.addEventListener("change", () => {
    requiredElement(document, "#circuit-alternative-label", HTMLElement).hidden =
      goal.value === "logout";
    alternative.replaceChildren(
      ...(goal.value === "script-loading"
        ? [new Option("Nonce source", "primary"), new Option("Hash source", "alternative")]
        : [
            new Option("COEP require-corp", "primary"),
            new Option("COEP credentialless", "alternative")
          ])
    );
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    trace();
  });
  form.addEventListener("change", trace);
  reviews.addEventListener("change", reviewStatus);
  trace();
}
