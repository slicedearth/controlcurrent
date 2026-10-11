import { getControl } from "./catalogue";
import type { BrowserBaseline, SelectedSnapshot } from "./contracts";
import { evaluateControl } from "./evaluate";
import { validatePlan } from "./plan-transfer";

export const DEPENDENCY_CIRCUITS = [
  {
    id: "isolation",
    name: "Isolate a document",
    description: "Trace the browser features involved in cross-origin isolation.",
    controlIds: ["cross-origin-opener-policy", "cross-origin-embedder-policy"],
    relationships: ["Separate opener relationships", "Choose a resource opt-in route"],
    reviews: [
      "HTTPS delivery is configured.",
      "The cross-origin-isolated permissions policy does not block access.",
      "Cross-origin resources and frames satisfy the chosen embedding policy.",
      "Sign-in, payment and other popup integrations have been tested."
    ],
    caveat:
      "Header declarations and compatibility do not establish runtime isolation. Check crossOriginIsolated in the deployed application and test its integrations.",
    reference: "https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated"
  },
  {
    id: "script-loading",
    name: "Restrict script loading",
    description: "Follow authorisation from a CSP declaration into trusted script loading.",
    controlIds: ["content-security-policy", "csp-nonces", "strict-dynamic"],
    relationships: [
      "Declare the script policy",
      "Authorise the initial script",
      "Review trust propagation"
    ],
    reviews: [
      "Nonces are unpredictable and generated for each response, or hashes match the intended content.",
      "Trusted loaders and scripts have been reviewed.",
      "Inline event handlers and legacy fallback behaviour have been tested.",
      "The effective policy includes all enforced policies and applicable source-list overrides."
    ],
    caveat:
      "Nonce and hash compatibility remain unmapped in the retained BCD data. A connected diagram is not a strict-CSP verdict or proof of script safety.",
    reference: "https://www.w3.org/TR/CSP3/"
  },
  {
    id: "logout",
    name: "Clear browser state at logout",
    description: "Inspect the separate data-clearing instructions used by a logout response.",
    controlIds: ["clear-site-data-cookies", "clear-site-data-storage", "clear-site-data-cache"],
    relationships: ["Clear cookies", "Clear persistent storage", "Clear cached responses"],
    reviews: [
      "Server-side sessions and refresh credentials are invalidated separately.",
      "The clearing response is delivered in a secure context.",
      "The scope and effect on related applications have been reviewed.",
      "The application has a fallback where a clearing directive is unsupported."
    ],
    caveat:
      "These are separate clearing instructions, not prerequisites for one another. A response cannot prove that browser data was removed or that a server session ended.",
    reference: "https://www.w3.org/TR/clear-site-data/"
  }
] as const;

export function evaluateCircuit(
  snapshot: SelectedSnapshot,
  goalId: string,
  baseline: BrowserBaseline,
  alternative: "primary" | "alternative" = "primary"
) {
  const goal = DEPENDENCY_CIRCUITS.find((item) => item.id === goalId);
  if (!goal) throw new Error("Unknown deployment circuit.");
  validatePlan(snapshot, { schemaVersion: 1, name: "Circuit browser plan", baselines: [baseline] });
  const ids: string[] = [...goal.controlIds];
  if (alternative === "alternative" && goal.id === "isolation") ids[1] = "coep-credentialless";
  if (alternative === "alternative" && goal.id === "script-loading") ids[1] = "csp-hashes";
  return {
    goal,
    nodes: ids.map((id, index) => {
      const control = getControl(id);
      if (!control) throw new Error("A circuit feature is missing from the catalogue.");
      return {
        control,
        relationship: goal.relationships[index] ?? "Review this feature",
        evaluation: evaluateControl(control, snapshot, baseline)
      };
    })
  };
}
