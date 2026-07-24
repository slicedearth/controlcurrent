import type { BrowserId, Outcome } from "./contracts";
import { BROWSER_NAMES } from "./browsers";

export const browserNames: Record<BrowserId, string> = BROWSER_NAMES;

export const outcomeLabels: Record<Outcome, string> = {
  available_unqualified: "Works",
  available_with_qualification: "Works with limits",
  unavailable: "Not supported",
  removed: "No longer supported",
  unknown: "Unknown",
  unsupported_mapping: "Not enough browser data",
  source_inconsistent: "Browser data problem"
};

export function formatDate(input: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(input));
}
