import { createHash } from "node:crypto";
import {
  type BrowserId,
  type ChangeEvent,
  changeEventSchema,
  type SelectedSnapshot,
  selectedSnapshotSchema
} from "./contracts";
import { canonicalJson } from "./canonical";

type ChangeType = ChangeEvent["type"];
const BROWSERS: readonly BrowserId[] = ["chrome", "edge", "firefox", "safari"];

function eventId(payload: Omit<ChangeEvent, "id">): string {
  return createHash("sha256").update(canonicalJson(payload, 0)).digest("hex").slice(0, 24);
}

function makeEvent(payload: Omit<ChangeEvent, "id">): ChangeEvent {
  return changeEventSchema.parse({ ...payload, id: eventId(payload) });
}

function summariseValue(value: unknown): string {
  if (value === undefined) return "not recorded";
  const serialised = JSON.stringify(value);
  return serialised.length > 120 ? `${serialised.slice(0, 117)}…` : serialised;
}

function supportChangeType(before: unknown, after: unknown): ChangeType {
  const beforeObject =
    typeof before === "object" && before !== null ? (before as Record<string, unknown>) : {};
  const afterObject =
    typeof after === "object" && after !== null ? (after as Record<string, unknown>) : {};

  if (beforeObject.partial_implementation !== afterObject.partial_implementation) {
    return afterObject.partial_implementation ? "partial_support_added" : "partial_support_removed";
  }
  if (JSON.stringify(beforeObject.flags) !== JSON.stringify(afterObject.flags)) {
    return afterObject.flags ? "flag_requirement_added" : "flag_requirement_removed";
  }
  if (beforeObject.prefix !== afterObject.prefix) return "prefix_changed";
  if (beforeObject.alternative_name !== afterObject.alternative_name) {
    return "alternative_name_changed";
  }
  if (JSON.stringify(beforeObject.notes) !== JSON.stringify(afterObject.notes)) {
    return "note_changed";
  }
  if (beforeObject.version_removed !== afterObject.version_removed) {
    return afterObject.version_removed ? "support_removed" : "support_version_corrected";
  }
  if (beforeObject.version_added !== afterObject.version_added) {
    return beforeObject.version_added === false || beforeObject.version_added === null
      ? "support_version_added"
      : "support_version_corrected";
  }
  return "support_version_corrected";
}

function comparableSupport(snapshot: SelectedSnapshot, path: string, browser: BrowserId) {
  return snapshot.features[path]?.support[browser];
}

export function compareSnapshots(beforeInput: unknown, afterInput: unknown): ChangeEvent[] {
  const before = selectedSnapshotSchema.parse(beforeInput);
  const after = selectedSnapshotSchema.parse(afterInput);
  const base = {
    schemaVersion: 1 as const,
    observedInBcdVersion: after.bcdVersion,
    sourceTimestamp: after.bcdTimestamp
  };
  const events: ChangeEvent[] = [];
  const beforePaths = new Set(Object.keys(before.features));
  const afterPaths = new Set(Object.keys(after.features));

  for (const path of [...afterPaths].filter((item) => !beforePaths.has(item)).sort()) {
    events.push(
      makeEvent({
        ...base,
        type: "selected_path_added",
        path,
        after: after.features[path],
        summary: `The selected BCD path ${path} was added.`
      })
    );
  }
  for (const path of [...beforePaths].filter((item) => !afterPaths.has(item)).sort()) {
    events.push(
      makeEvent({
        ...base,
        type: "selected_path_removed",
        path,
        before: before.features[path],
        summary: `The selected BCD path ${path} was removed.`
      })
    );
  }

  for (const path of [...afterPaths].filter((item) => beforePaths.has(item)).sort()) {
    for (const browser of BROWSERS) {
      const previous = comparableSupport(before, path, browser);
      const current = comparableSupport(after, path, browser);
      if (JSON.stringify(previous) === JSON.stringify(current)) continue;
      if (!previous || !current) {
        events.push(
          makeEvent({
            ...base,
            type: "source_became_incomparable",
            path,
            browser,
            ...(previous ? { before: previous } : {}),
            ...(current ? { after: current } : {}),
            summary: `${path} became incomparable for ${browser}.`
          })
        );
        continue;
      }

      const maximum = Math.max(previous.length, current.length);
      for (let index = 0; index < maximum; index += 1) {
        const previousStatement = previous[index];
        const currentStatement = current[index];
        if (JSON.stringify(previousStatement) === JSON.stringify(currentStatement)) continue;
        const type = supportChangeType(previousStatement, currentStatement);
        events.push(
          makeEvent({
            ...base,
            type,
            path,
            browser,
            ...(previousStatement ? { before: previousStatement } : {}),
            ...(currentStatement ? { after: currentStatement } : {}),
            summary: `${path} changed for ${browser}: ${summariseValue(previousStatement)} to ${summariseValue(currentStatement)}.`
          })
        );
      }
    }
  }

  if (JSON.stringify(before.controlMappings) !== JSON.stringify(after.controlMappings)) {
    events.push(
      makeEvent({
        ...base,
        type: "control_mapping_changed",
        before: before.controlMappings,
        after: after.controlMappings,
        summary: `The control catalogue mapping changed from ${before.catalogueVersion} to ${after.catalogueVersion}.`
      })
    );
  }

  for (const browser of BROWSERS) {
    const known = new Set(before.browsers[browser].releases.map((release) => release.version));
    for (const release of after.browsers[browser].releases) {
      if (!known.has(release.version)) {
        events.push(
          makeEvent({
            ...base,
            type: "browser_release_added",
            browser,
            after: release,
            summary: `${after.browsers[browser].name} ${release.version} was added to the selected BCD release metadata.`
          })
        );
      }
    }
  }

  return events.sort(
    (left, right) =>
      left.type.localeCompare(right.type) ||
      (left.path ?? "").localeCompare(right.path ?? "") ||
      (left.browser ?? "").localeCompare(right.browser ?? "") ||
      left.id.localeCompare(right.id)
  );
}

export function baselineEvent(snapshotInput: unknown): ChangeEvent {
  const snapshot = selectedSnapshotSchema.parse(snapshotInput);
  const payload: Omit<ChangeEvent, "id"> = {
    schemaVersion: 1,
    type: "baseline_established",
    observedInBcdVersion: snapshot.bcdVersion,
    sourceTimestamp: snapshot.bcdTimestamp,
    summary: `ControlCurrent established its first selected BCD baseline at version ${snapshot.bcdVersion}.`
  };
  return makeEvent(payload);
}
