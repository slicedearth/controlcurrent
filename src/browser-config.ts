import { BROWSER_IDS } from "./browsers";
import { deploymentProfileSchema, type BrowserId, type DeploymentProfile } from "./contracts";

export const MAX_BROWSER_CONFIG_BYTES = 64 * 1_024;

const aliases: Readonly<Record<string, BrowserId>> = {
  chrome: "chrome",
  edge: "edge",
  firefox: "firefox",
  safari: "safari",
  and_chr: "chrome_android",
  chrome_android: "chrome_android",
  and_ff: "firefox_android",
  firefox_android: "firefox_android",
  ios_saf: "safari_ios",
  safari_ios: "safari_ios",
  android: "webview_android",
  webview_android: "webview_android",
  samsung: "samsunginternet_android",
  samsunginternet_android: "samsunginternet_android"
};

function browserQueries(input: unknown): string[] {
  if (typeof input === "string") return [input];
  if (Array.isArray(input) && input.every((item) => typeof item === "string")) return input;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    throw new Error(
      "The package uses named Browserslist environments. Export one explicit environment as a simple list before importing it."
    );
  }
  throw new Error("The package.json browserslist field must be a string or a list of strings.");
}

function extractQueries(contents: string): string[] {
  const trimmed = contents.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== "object" || parsed === null || !("browserslist" in parsed)) {
      throw new Error("The package.json file has no browserslist field.");
    }
    return browserQueries(parsed.browserslist);
  }
  return trimmed.split(/\r?\n/gu);
}

function parseQuery(query: string): { browser: BrowserId; minimumVersion: string } | undefined {
  const stripped = query.replace(/#.*$/u, "").trim();
  if (stripped.length === 0) return undefined;
  const match =
    /^(chrome|edge|firefox|safari|and_chr|chrome_android|and_ff|firefox_android|ios_saf|safari_ios|android|webview_android|samsung|samsunginternet_android)\s*(?:>=|=)?\s*(\d+(?:\.\d+)*)$/iu.exec(
      stripped
    );
  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Unsupported browser query: ${stripped}. Use explicit minimums such as "chrome >= 120".`
    );
  }
  const browser = aliases[match[1].toLocaleLowerCase("en-AU")];
  if (!browser || !BROWSER_IDS.includes(browser)) {
    throw new Error(`Unsupported browser name: ${match[1]}.`);
  }
  return { browser, minimumVersion: match[2] };
}

export function importBrowserConfiguration(
  contents: string,
  profileName = "Imported browser configuration"
): DeploymentProfile {
  if (new TextEncoder().encode(contents).byteLength > MAX_BROWSER_CONFIG_BYTES) {
    throw new Error(
      `Browser configuration exceeds the ${String(MAX_BROWSER_CONFIG_BYTES)}-byte limit.`
    );
  }
  const baselines = extractQueries(contents).flatMap((query) => {
    const parsed = parseQuery(query);
    return parsed ? [parsed] : [];
  });
  if (baselines.length === 0) {
    throw new Error("The browser configuration contains no explicit supported browser minimums.");
  }
  return deploymentProfileSchema.parse({
    schemaVersion: 1,
    name: profileName,
    baselines
  });
}
