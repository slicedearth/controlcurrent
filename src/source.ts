import { createHash } from "node:crypto";
import type {
  BrowserName as BcdBrowserName,
  CompatData,
  CompatStatement,
  Identifier,
  SimpleSupportStatement as BcdSupportStatement,
  SupportStatement as BcdSupportStatementGroup
} from "@mdn/browser-compat-data";
import { features as importedWebFeatures } from "web-features";
import { BROWSER_IDS } from "./browsers";
import {
  type BrowserId,
  browserIdSchema,
  selectedSnapshotSchema,
  type SelectedSnapshot,
  supportStatementSchema
} from "./contracts";
import { CATALOGUE_VERSION, SECURITY_CONTROLS } from "./catalogue";
import { canonicalJson, canonicalize } from "./canonical";

const BROWSERS: readonly BrowserId[] = BROWSER_IDS;
const MAX_FEATURE_PATH_SEGMENTS = 12;
const MAX_SELECTED_FEATURES = 64;

export function resolveIdentifier(
  data: CompatData,
  path: string
): Identifier & { __compat: CompatStatement } {
  const parts = path.split(".");
  if (
    parts.length === 0 ||
    parts.length > MAX_FEATURE_PATH_SEGMENTS ||
    parts.some((part) => part === "" || part === "__proto__" || part === "constructor")
  ) {
    throw new Error(`Invalid BCD feature path: ${path}`);
  }

  let current: unknown = data;
  for (const part of parts) {
    if (
      typeof current !== "object" ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      throw new Error(`BCD feature path is missing: ${path}`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "object" || current === null) {
    throw new Error(`BCD feature path does not resolve to an identifier: ${path}`);
  }
  const identifier = current as Identifier;
  if (!identifier.__compat) {
    throw new Error(`BCD feature path has no __compat statement: ${path}`);
  }
  return identifier as Identifier & { __compat: CompatStatement };
}

function normaliseSupportStatement(statement: BcdSupportStatement): unknown {
  return {
    version_added: statement.version_added,
    ...(statement.version_removed ? { version_removed: statement.version_removed } : {}),
    ...(statement.version_last ? { version_last: statement.version_last } : {}),
    ...(statement.prefix ? { prefix: statement.prefix } : {}),
    ...(statement.alternative_name ? { alternative_name: statement.alternative_name } : {}),
    ...(statement.flags ? { flags: statement.flags } : {}),
    ...(statement.impl_url ? { impl_url: statement.impl_url } : {}),
    ...(statement.partial_implementation
      ? { partial_implementation: statement.partial_implementation }
      : {}),
    ...(statement.notes ? { notes: statement.notes } : {})
  };
}

function normaliseSupportGroup(
  support: BcdSupportStatementGroup | undefined,
  path: string,
  browser: BrowserId
) {
  if (!support) {
    throw new Error(`BCD path ${path} has no ${browser} support statement.`);
  }
  const statements = Array.isArray(support) ? support : [support];
  return statements.map((statement) =>
    supportStatementSchema.parse(normaliseSupportStatement(statement))
  );
}

type BaselineStatus = {
  baseline: false | "low" | "high";
  baseline_low_date?: string;
  baseline_high_date?: string;
};

type WebFeatureEntry =
  | {
      kind: "feature";
      name: string;
      compat_features?: string[];
      status: BaselineStatus & {
        by_compat_key?: Record<string, BaselineStatus>;
      };
    }
  | {
      kind: "moved" | "split";
    };

type WebFeatures = Record<string, WebFeatureEntry>;
const defaultWebFeatures = importedWebFeatures as unknown as WebFeatures;

function baselineForPath(path: string, webFeatures: WebFeatures) {
  return Object.entries(webFeatures)
    .flatMap(([featureId, entry]) => {
      if (entry.kind !== "feature" || !entry.compat_features?.includes(path)) return [];
      const status = entry.status.by_compat_key?.[path] ?? entry.status;
      return [
        {
          featureId,
          name: entry.name,
          status: status.baseline,
          ...(status.baseline_low_date ? { lowDate: status.baseline_low_date } : {}),
          ...(status.baseline_high_date ? { highDate: status.baseline_high_date } : {})
        }
      ];
    })
    .sort((left, right) => left.featureId.localeCompare(right.featureId))
    .slice(0, 8);
}

function normaliseFeature(path: string, compat: CompatStatement, webFeatures: WebFeatures) {
  const specUrls = compat.spec_url
    ? Array.isArray(compat.spec_url)
      ? compat.spec_url
      : [compat.spec_url]
    : [];
  const sourceStatus = compat.status as
    | {
        deprecated: boolean;
        experimental: boolean;
        standard_track: boolean;
      }
    | undefined;

  return {
    path,
    sourceFile: compat.source_file,
    ...(compat.description ? { description: compat.description } : {}),
    ...(compat.mdn_url ? { mdnUrl: compat.mdn_url } : {}),
    specUrls,
    ...(sourceStatus
      ? {
          status: {
            deprecated: sourceStatus.deprecated,
            experimental: sourceStatus.experimental,
            standardTrack: sourceStatus.standard_track
          }
        }
      : {}),
    baseline: baselineForPath(path, webFeatures),
    support: Object.fromEntries(
      BROWSERS.map((browser) => [
        browser,
        normaliseSupportGroup(compat.support[browser as BcdBrowserName], path, browser)
      ])
    )
  };
}

function schemaShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length === 0 ? ["empty"] : [schemaShape(value[0])];
  }
  if (value === null) return "null";
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, schemaShape(child)])
    );
  }
  return typeof value;
}

export function schemaFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(schemaShape(value), 0))
    .digest("hex");
}

export function buildSelectedSnapshot(
  data: CompatData,
  options: {
    webFeaturesVersion: string;
    webFeatures?: WebFeatures;
  }
): SelectedSnapshot {
  const webFeatures = options.webFeatures ?? defaultWebFeatures;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(data.__meta.version)) {
    throw new Error(`Unsupported BCD package version: ${data.__meta.version}`);
  }
  if (Number.isNaN(Date.parse(data.__meta.timestamp))) {
    throw new Error(`Invalid BCD package timestamp: ${data.__meta.timestamp}`);
  }

  const paths = [
    ...new Set(
      SECURITY_CONTROLS.flatMap((control) =>
        control.mappingState === "active" ? [...control.bcdPaths] : []
      )
    )
  ].sort();
  if (paths.length > MAX_SELECTED_FEATURES) {
    throw new Error(`Selected feature count exceeds ${String(MAX_SELECTED_FEATURES)}.`);
  }

  const features = Object.fromEntries(
    paths.map((path) => {
      const identifier = resolveIdentifier(data, path);
      return [path, normaliseFeature(path, identifier.__compat, webFeatures)];
    })
  );

  const browsers = Object.fromEntries(
    BROWSERS.map((browser) => {
      const source = data.browsers[browser];
      const releases = Object.entries(source.releases)
        .map(([version, release]) => ({
          version,
          status: release.status,
          ...(release.release_date ? { releaseDate: release.release_date } : {})
        }))
        .sort((left, right) => {
          const leftDate = left.releaseDate ?? "9999-12-31";
          const rightDate = right.releaseDate ?? "9999-12-31";
          return leftDate.localeCompare(rightDate) || left.version.localeCompare(right.version);
        });
      return [
        browser,
        {
          id: browserIdSchema.parse(browser),
          name: source.name,
          ...(source.upstream ? { upstream: source.upstream } : {}),
          releases
        }
      ];
    })
  );

  const controlMappings = SECURITY_CONTROLS.map((control) => ({
    controlId: control.id,
    mappingState: control.mappingState,
    combination: control.combination,
    paths: [...control.bcdPaths]
  }));

  const payload = {
    schemaVersion: 2 as const,
    bcdVersion: data.__meta.version,
    bcdTimestamp: data.__meta.timestamp,
    webFeaturesVersion: options.webFeaturesVersion,
    catalogueVersion: CATALOGUE_VERSION,
    schemaFingerprint: schemaFingerprint({ browsers, controlMappings, features }),
    browsers,
    controlMappings,
    features
  };

  return selectedSnapshotSchema.parse(canonicalize(payload));
}
