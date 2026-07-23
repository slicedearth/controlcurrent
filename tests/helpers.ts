import type {
  BrowserId,
  SelectedFeature,
  SelectedSnapshot,
  SupportStatement
} from "../src/contracts";
import { BROWSER_IDS } from "../src/browsers";

const browserIds: readonly BrowserId[] = BROWSER_IDS;

export const evidenceSourceContext = {
  bcdVersion: "1.0.0",
  bcdTimestamp: "2026-01-01T00:00:00.000Z",
  webFeaturesVersion: "1.0.0",
  selectedSchemaFingerprint: "a".repeat(64)
} as const;

export function feature(
  path: string,
  statements: Partial<Record<BrowserId, SupportStatement[]>>
): SelectedFeature {
  return {
    path,
    sourceFile: "test.json",
    mdnUrl: `https://developer.mozilla.org/docs/${encodeURIComponent(path)}`,
    specUrls: ["https://example.invalid/spec"],
    baseline: [],
    support: Object.fromEntries(
      browserIds.map((browser) => [browser, statements[browser] ?? [{ version_added: false }]])
    )
  };
}

export function snapshot(
  features: Record<string, SelectedFeature>,
  overrides: Partial<SelectedSnapshot> = {}
): SelectedSnapshot {
  const browsers = Object.fromEntries(
    browserIds.map((browser) => [
      browser,
      {
        id: browser,
        name: browser,
        releases: [
          { version: "100", status: "retired" as const, releaseDate: "2022-01-01" },
          { version: "120", status: "current" as const, releaseDate: "2024-01-01" }
        ]
      }
    ])
  ) as SelectedSnapshot["browsers"];

  return {
    schemaVersion: 2,
    bcdVersion: "1.0.0",
    bcdTimestamp: "2026-01-01T00:00:00.000Z",
    webFeaturesVersion: "1.0.0",
    catalogueVersion: "1.0.0",
    schemaFingerprint: "a".repeat(64),
    browsers,
    controlMappings: [],
    features,
    ...overrides
  };
}
