import type { BrowserId, Outcome } from "./contracts";

export const browserNames: Record<BrowserId, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  safari: "Safari"
};

export const outcomeLabels: Record<Outcome, string> = {
  available_unqualified: "Available",
  available_with_qualification: "Qualified",
  unavailable: "Unavailable",
  removed: "Removed",
  unknown: "Unknown",
  unsupported_mapping: "Not mapped",
  source_inconsistent: "Source issue"
};

export function formatDate(input: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(input));
}
