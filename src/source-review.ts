import { z } from "zod";

const reviewedPackages = ["@mdn/browser-compat-data", "web-features"] as const;

const versionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z.+-]+$/u);

const outdatedEntrySchema = z
  .object({
    current: versionSchema,
    wanted: versionSchema,
    latest: versionSchema
  })
  .loose();

export function summariseSourceReview(
  input: unknown,
  installedVersions: Readonly<Record<string, string>> = {}
): string {
  const root = z.record(z.string(), z.unknown()).parse(input);
  const rows = reviewedPackages.map((name) => {
    const raw = root[name];
    if (raw === undefined) {
      const installed = installedVersions[name];
      return {
        name,
        current: installed ? versionSchema.parse(installed) : "locked version",
        wanted: "—",
        latest: "—",
        state: "No update reported"
      };
    }
    const entry = outdatedEntrySchema.parse(raw);
    return {
      name,
      current: entry.current,
      wanted: entry.wanted,
      latest: entry.latest,
      state:
        entry.current === entry.latest
          ? "Current"
          : entry.current === entry.wanted
            ? "Review newer release"
            : "Review compatible update"
    };
  });

  return `## Browser source review

| Source package | Installed | Wanted | Latest | Review state |
| --- | --- | --- | --- | --- |
${rows
  .map(
    (row) =>
      `| \`${row.name}\` | \`${row.current}\` | \`${row.wanted}\` | \`${row.latest}\` | ${row.state} |`
  )
  .join("\n")}

This scheduled review is read-only. It does not edit the lockfile or selected data, create a pull request, or publish a deployment.
`;
}
