import { z } from "zod";
import { compareSnapshots } from "./changes";
import { selectedSnapshotSchema } from "./contracts";

const sourceUpdatePreviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    current: z
      .object({
        bcdVersion: z.string().min(1).max(64),
        webFeaturesVersion: z.string().min(1).max(64),
        catalogueVersion: z.string().min(1).max(64),
        pathCount: z.number().int().min(0).max(64)
      })
      .strict(),
    candidate: z
      .object({
        bcdVersion: z.string().min(1).max(64),
        webFeaturesVersion: z.string().min(1).max(64),
        catalogueVersion: z.string().min(1).max(64),
        pathCount: z.number().int().min(0).max(64)
      })
      .strict(),
    summary: z
      .object({
        totalEvents: z.number().int().min(0).max(10_000),
        emittedEvents: z.number().int().min(0).max(512),
        truncated: z.boolean(),
        byType: z.record(z.string().min(1).max(80), z.number().int().min(0).max(10_000))
      })
      .strict(),
    events: z
      .array(
        z
          .object({
            type: z.string().min(1).max(80),
            summary: z.string().min(1).max(1_024),
            path: z.string().min(1).max(512).optional()
          })
          .strict()
      )
      .max(512)
  })
  .strict();
export type SourceUpdatePreview = z.infer<typeof sourceUpdatePreviewSchema>;

function snapshotIdentity(input: z.infer<typeof selectedSnapshotSchema>) {
  return {
    bcdVersion: input.bcdVersion,
    webFeaturesVersion: input.webFeaturesVersion,
    catalogueVersion: input.catalogueVersion,
    pathCount: Object.keys(input.features).length
  };
}

export function createSourceUpdatePreview(
  currentInput: unknown,
  candidateInput: unknown
): SourceUpdatePreview {
  const current = selectedSnapshotSchema.parse(currentInput);
  const candidate = selectedSnapshotSchema.parse(candidateInput);
  const allEvents = compareSnapshots(current, candidate);
  const events = allEvents.slice(0, 512).map(({ type, summary, path }) => ({
    type,
    summary,
    ...(path ? { path } : {})
  }));
  const byType = Object.fromEntries(
    [...new Set(allEvents.map((item) => item.type))]
      .sort()
      .map((type) => [type, allEvents.filter((item) => item.type === type).length])
  );
  return sourceUpdatePreviewSchema.parse({
    schemaVersion: 1,
    current: snapshotIdentity(current),
    candidate: snapshotIdentity(candidate),
    summary: {
      totalEvents: allEvents.length,
      emittedEvents: events.length,
      truncated: events.length < allEvents.length,
      byType
    },
    events
  });
}

function markdown(value: string): string {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127) ? " " : character;
    })
    .join("")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .trim();
}

export function renderSourceUpdatePreview(input: unknown): string {
  const preview = sourceUpdatePreviewSchema.parse(input);
  const typeRows = Object.entries(preview.summary.byType).map(
    ([type, count]) => `| ${markdown(type.replaceAll("_", " "))} | ${String(count)} |`
  );
  const eventRows = preview.events.map(
    (item) =>
      `| ${markdown(item.type.replaceAll("_", " "))} | ${markdown(item.path ?? "—")} | ${markdown(item.summary)} |`
  );
  return [
    "## Semantic browser-source preview",
    "",
    `Current: BCD \`${preview.current.bcdVersion}\`, Web Platform Features \`${preview.current.webFeaturesVersion}\`, catalogue \`${preview.current.catalogueVersion}\`.`,
    "",
    `Candidate: BCD \`${preview.candidate.bcdVersion}\`, Web Platform Features \`${preview.candidate.webFeaturesVersion}\`, catalogue \`${preview.candidate.catalogueVersion}\`.`,
    "",
    `Detected ${String(preview.summary.totalEvents)} bounded semantic change event${preview.summary.totalEvents === 1 ? "" : "s"}.`,
    "",
    ...(typeRows.length
      ? ["| Change type | Count |", "| --- | ---: |", ...typeRows]
      : ["No selected browser-source changes were detected."]),
    "",
    ...(eventRows.length
      ? [
          "### Reviewable events",
          "",
          "| Change type | Selected path | Summary |",
          "| --- | --- | --- |",
          ...eventRows
        ]
      : []),
    ...(preview.summary.truncated
      ? [
          "",
          `Only the first ${String(preview.summary.emittedEvents)} events are shown; the complete count remains ${String(preview.summary.totalEvents)}.`
        ]
      : []),
    "",
    "This preview uses candidate packages as hostile data with lifecycle scripts disabled. It does not edit the lockfile, selected dataset, source history, or deployment.",
    ""
  ].join("\n");
}
