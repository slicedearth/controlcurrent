import { requiredElement } from "./dom";
import type { DeploymentProfile } from "../contracts";
import { guardedStorage } from "../local-state";
import {
  addPlan,
  readPlanLibrary,
  removePlan,
  renamePlan,
  writePlanLibrary
} from "../plan-library";
import { selectedSnapshot } from "../data";
import { validatePlan } from "../plan-transfer";
import { downloadText } from "./download";
import { canonicalJson } from "../canonical";

export function initialisePlanLibrary(
  document: Document,
  current: () => DeploymentProfile,
  load: (profile: DeploymentProfile) => void
): void {
  const select = requiredElement(document, "#saved-plan", HTMLSelectElement);
  const name = requiredElement(document, "#saved-plan-name", HTMLInputElement);
  const status = requiredElement(document, "#library-status", HTMLElement);
  const storage = guardedStorage(() => window.localStorage);
  function refresh(chosen = select.value): void {
    const library = readPlanLibrary(storage);
    select.replaceChildren(
      new Option("Choose a saved plan", ""),
      ...library.plans.map((entry) => new Option(entry.profile.name, entry.id))
    );
    select.value = library.plans.some((entry) => entry.id === chosen) ? chosen : "";
    name.value = library.plans.find((entry) => entry.id === select.value)?.profile.name ?? "";
    for (const id of ["load", "duplicate", "rename", "export", "delete"])
      requiredElement(document, `#library-${id}`, HTMLButtonElement).disabled = !select.value;
  }
  const action = (id: string, run: () => void) =>
    requiredElement(document, `#library-${id}`, HTMLButtonElement).addEventListener("click", () => {
      try {
        run();
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : "The saved plan could not be changed.";
      }
    });
  const chosen = () => {
    const entry = readPlanLibrary(storage).plans.find((plan) => plan.id === select.value);
    if (!entry) throw new Error("Choose a saved plan.");
    return entry;
  };
  action("save", () => {
    const id = crypto.randomUUID();
    writePlanLibrary(
      storage,
      addPlan(readPlanLibrary(storage), id, validatePlan(selectedSnapshot, current()))
    );
    refresh(id);
    status.textContent = "Named plan saved on this device.";
  });
  action("load", () => {
    load(validatePlan(selectedSnapshot, chosen().profile));
    status.textContent = "Saved plan loaded. Select Check support to evaluate it.";
  });
  action("duplicate", () => {
    const profile = chosen().profile;
    const id = crypto.randomUUID();
    writePlanLibrary(
      storage,
      addPlan(readPlanLibrary(storage), id, {
        ...profile,
        name: `${profile.name.slice(0, 73)} (copy)`
      })
    );
    refresh(id);
    status.textContent = "A separate copy was saved.";
  });
  action("rename", () => {
    writePlanLibrary(storage, renamePlan(readPlanLibrary(storage), select.value, name.value));
    refresh();
    status.textContent = "Saved plan renamed.";
  });
  action("delete", () => {
    writePlanLibrary(storage, removePlan(readPlanLibrary(storage), select.value));
    refresh();
    status.textContent = "Selected plan deleted from this device.";
  });
  action("export", () => {
    downloadText(
      canonicalJson(chosen().profile),
      "controlcurrent-profile.json",
      "application/json"
    );
    status.textContent = "Selected plan exported locally.";
  });
  select.addEventListener("change", () => {
    try {
      refresh();
    } catch (error) {
      status.textContent = String(error);
    }
  });
  window.addEventListener("storage", () => {
    try {
      refresh();
    } catch {
      status.textContent =
        "Saved plans changed but could not be read. Existing data was left untouched.";
    }
  });
  try {
    refresh();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Saved plans are unavailable.";
  }
}
