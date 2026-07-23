import { SECURITY_CONTROLS } from "./catalogue";
import {
  type AssuranceFinding,
  type AssuranceReport,
  type HeaderSnapshot,
  assuranceReportSchema,
  headerSnapshotSchema
} from "./contracts";
import { parseCspHashSource, parseCspNonceSource } from "./integrity";

export const MAX_HEADER_BLOCK_BYTES = 64 * 1_024;

const RECOGNIZED_HEADERS = new Set([
  "clear-site-data",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "origin-agent-cluster",
  "permissions-policy",
  "referrer-policy",
  "set-cookie",
  "strict-transport-security",
  "x-content-type-options"
]);

const SENSITIVE_REQUEST_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "proxy-authenticate"
]);

type NormalisedHeaders = Map<string, string[]>;
type CspPolicy = Map<string, string[]>;
type CspParseResult =
  | { state: "missing" }
  | { state: "invalid"; summary: string }
  | { state: "present"; policies: CspPolicy[]; directiveCount: number };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function hasAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return true;
  }
  return false;
}

function appendHeader(headers: Record<string, string[]>, name: string, value: string): void {
  const current = headers[name] ?? [];
  if (current.length >= 8) throw new Error(`Header ${name} exceeds the eight-value bound.`);
  current.push(value);
  headers[name] = current;
}

export function parseHeaderBlock(input: string, name = "Pasted response headers"): HeaderSnapshot {
  if (byteLength(input) > MAX_HEADER_BLOCK_BYTES) {
    throw new Error(`Header block exceeds ${String(MAX_HEADER_BLOCK_BYTES)} bytes.`);
  }
  const lines = input.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  if (lines.length > 256) throw new Error("Header block exceeds 256 lines.");
  let headers: Record<string, string[]> = {};

  for (const [index, line] of lines.entries()) {
    if (line.length > 8_320) throw new Error(`Header line ${String(index + 1)} is too long.`);
    if (line.trim() === "") continue;
    if (/^HTTP\/\d(?:\.\d)?\s+\d{3}(?:\s|$)/iu.test(line)) {
      headers = {};
      continue;
    }
    if (/^[\t ]/u.test(line)) {
      throw new Error(`Obsolete folded header at line ${String(index + 1)} is not accepted.`);
    }
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error(`Invalid header line ${String(index + 1)}.`);
    const headerName = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(headerName)) {
      throw new Error(`Invalid header name at line ${String(index + 1)}.`);
    }
    if (SENSITIVE_REQUEST_HEADERS.has(headerName)) {
      throw new Error(`Sensitive request header ${headerName} is not accepted.`);
    }
    appendHeader(headers, headerName, value);
  }

  return headerSnapshotSchema.parse({
    schemaVersion: 1,
    name,
    headers
  });
}

function normalisedHeaders(snapshotInput: unknown): {
  snapshot: HeaderSnapshot;
  headers: NormalisedHeaders;
} {
  const snapshot = headerSnapshotSchema.parse(snapshotInput);
  const headers: NormalisedHeaders = new Map();
  for (const [rawName, rawValues] of Object.entries(snapshot.headers)) {
    const name = rawName.toLowerCase();
    if (SENSITIVE_REQUEST_HEADERS.has(name)) {
      throw new Error(`Sensitive request header ${name} is not accepted.`);
    }
    const values = Array.isArray(rawValues) ? rawValues : [rawValues];
    const existing = headers.get(name) ?? [];
    if (existing.length + values.length > 8) {
      throw new Error(`Header ${name} exceeds the eight-value bound.`);
    }
    headers.set(name, [...existing, ...values]);
  }
  return { snapshot, headers };
}

function finding(
  controlId: string,
  state: AssuranceFinding["state"],
  sourceHeaders: string[],
  summary: string,
  evidence?: string
): AssuranceFinding {
  return {
    controlId,
    state,
    sourceHeaders,
    summary,
    ...(evidence ? { evidence } : {})
  };
}

function singleton(headers: NormalisedHeaders, name: string) {
  const values = headers.get(name);
  if (!values) return { state: "missing" as const };
  if (values.length !== 1) {
    return {
      state: "invalid" as const,
      summary: `${name} appeared ${String(values.length)} times; this check requires one value.`
    };
  }
  return { state: "present" as const, value: values[0] ?? "" };
}

function parseCsp(headers: NormalisedHeaders, headerName: string): CspParseResult {
  const values = headers.get(headerName);
  if (!values) return { state: "missing" };
  const policies: CspPolicy[] = [];
  let directiveCount = 0;

  for (const value of values) {
    const policy: CspPolicy = new Map();
    for (const part of value.split(";")) {
      const normalised = part.trim();
      if (!normalised) continue;
      const [rawName, ...tokens] = normalised.split(/\s+/u);
      const name = rawName?.toLowerCase() ?? "";
      if (!/^[a-z][a-z0-9-]*$/u.test(name)) {
        return { state: "invalid", summary: "CSP contains an invalid directive name." };
      }
      if (policy.has(name)) {
        return { state: "invalid", summary: `CSP repeats the ${name} directive in one policy.` };
      }
      policy.set(name, tokens);
      directiveCount += 1;
    }
    if (policy.size === 0) return { state: "invalid", summary: "CSP contains no directives." };
    policies.push(policy);
  }
  return { state: "present", policies, directiveCount };
}

function cspDirectiveFinding(
  enforced: CspParseResult,
  reportOnly: CspParseResult,
  controlId: string,
  directive: string
): AssuranceFinding {
  if (enforced.state === "invalid") {
    return finding(controlId, "invalid", ["content-security-policy"], enforced.summary);
  }
  if (reportOnly.state === "invalid") {
    return finding(
      controlId,
      "invalid",
      ["content-security-policy-report-only"],
      reportOnly.summary
    );
  }
  const present =
    enforced.state === "present" && enforced.policies.some((policy) => policy.has(directive));
  const reported =
    reportOnly.state === "present" && reportOnly.policies.some((policy) => policy.has(directive));
  return finding(
    controlId,
    present ? "observed" : reported ? "report_only" : "missing",
    present
      ? ["content-security-policy"]
      : reported
        ? ["content-security-policy-report-only"]
        : ["content-security-policy"],
    present
      ? `CSP declares the ${directive} directive.`
      : reported
        ? `Report-only CSP declares ${directive}, but it is not enforced.`
        : `CSP does not declare the ${directive} directive.`,
    present ? `${directive} present` : undefined
  );
}

const SCRIPT_SOURCE_CHAINS = [
  ["script-src-elem", "script-src", "default-src"],
  ["script-src", "default-src"]
] as const;
const STYLE_SOURCE_CHAINS = [
  ["style-src-elem", "style-src", "default-src"],
  ["style-src", "default-src"]
] as const;

function effectiveDirectiveTokens(
  policy: CspPolicy,
  chains: readonly (readonly string[])[]
): string[][] {
  return chains.flatMap((chain) => {
    const directive = chain.find((candidate) => policy.has(candidate));
    return directive ? [policy.get(directive) ?? []] : [];
  });
}

function cspHasToken(
  result: CspParseResult,
  chains: readonly (readonly string[])[],
  predicate: (token: string) => boolean
): boolean {
  return (
    result.state === "present" &&
    result.policies.some((policy) =>
      effectiveDirectiveTokens(policy, chains).some((tokens) => tokens.some(predicate))
    )
  );
}

function cspTokenFinding(
  enforced: CspParseResult,
  reportOnly: CspParseResult,
  controlId: string,
  chains: readonly (readonly string[])[],
  predicate: (token: string) => boolean,
  label: string
): AssuranceFinding {
  if (enforced.state === "invalid") {
    return finding(controlId, "invalid", ["content-security-policy"], enforced.summary);
  }
  if (reportOnly.state === "invalid") {
    return finding(
      controlId,
      "invalid",
      ["content-security-policy-report-only"],
      reportOnly.summary
    );
  }
  const present = cspHasToken(enforced, chains, predicate);
  const reported = cspHasToken(reportOnly, chains, predicate);
  const multiplePolicies = enforced.state === "present" && enforced.policies.length > 1;
  return finding(
    controlId,
    present && multiplePolicies
      ? "inconclusive"
      : present
        ? "observed"
        : reported
          ? "report_only"
          : "missing",
    present
      ? ["content-security-policy"]
      : reported
        ? ["content-security-policy-report-only"]
        : ["content-security-policy"],
    present && multiplePolicies
      ? `${label} is declared, but effective authorisation depends on the intersection of ${String(enforced.policies.length)} enforced policies.`
      : present
        ? `${label} was declared in an applicable CSP source list.`
        : reported
          ? `${label} appears only in report-only CSP and is not enforced.`
          : `${label} was not declared in an applicable CSP source list.`
  );
}

function cspNonceFinding(enforced: CspParseResult, reportOnly: CspParseResult): AssuranceFinding {
  if (enforced.state === "invalid") {
    return finding("csp-nonces", "invalid", ["content-security-policy"], enforced.summary);
  }
  if (reportOnly.state === "invalid") {
    return finding(
      "csp-nonces",
      "invalid",
      ["content-security-policy-report-only"],
      reportOnly.summary
    );
  }
  const states = (result: CspParseResult) =>
    result.state === "present"
      ? result.policies.flatMap((policy) =>
          effectiveDirectiveTokens(policy, [...SCRIPT_SOURCE_CHAINS, ...STYLE_SOURCE_CHAINS])
            .flat()
            .map(parseCspNonceSource)
            .filter((item) => item.state !== "not_nonce")
        )
      : [];
  const enforcedStates = states(enforced);
  const reportOnlyStates = states(reportOnly);
  const malformed = enforcedStates.filter((item) => item.state === "invalid").length;
  const short = enforcedStates.filter((item) => item.state === "short").length;
  const valid = enforcedStates.filter((item) => item.state === "valid").length;
  const reportOnlyValid = reportOnlyStates.some((item) => item.state === "valid");
  const multiplePolicies = enforced.state === "present" && enforced.policies.length > 1;

  if (malformed > 0) {
    return finding(
      "csp-nonces",
      "invalid",
      ["content-security-policy"],
      "CSP contains a malformed nonce source expression.",
      `${String(malformed)} malformed nonce source${malformed === 1 ? "" : "s"}`
    );
  }
  if (short > 0) {
    return finding(
      "csp-nonces",
      "inconclusive",
      ["content-security-policy"],
      "A nonce source decodes to fewer than 128 bits; syntax alone cannot establish unpredictability or per-response generation.",
      `${String(valid)} nonce sources at least 128 bits; ${String(short)} shorter`
    );
  }
  if (valid > 0 && multiplePolicies) {
    return finding(
      "csp-nonces",
      "inconclusive",
      ["content-security-policy"],
      `A nonce source is declared, but effective authorisation depends on the intersection of ${String(enforced.policies.length)} enforced policies.`,
      `${String(valid)} nonce source${valid === 1 ? "" : "s"} at least 128 bits`
    );
  }
  if (valid > 0) {
    return finding(
      "csp-nonces",
      "observed",
      ["content-security-policy"],
      "A CSP nonce source of at least 128 bits was declared; unpredictability, reuse, and source matching remain unverified.",
      `${String(valid)} nonce source${valid === 1 ? "" : "s"} at least 128 bits`
    );
  }
  if (reportOnlyValid) {
    return finding(
      "csp-nonces",
      "report_only",
      ["content-security-policy-report-only"],
      "A nonce source appears only in report-only CSP and is not enforced."
    );
  }
  return finding(
    "csp-nonces",
    "missing",
    ["content-security-policy"],
    "A CSP nonce source was not declared in an applicable source list."
  );
}

function cspHashFinding(enforced: CspParseResult, reportOnly: CspParseResult): AssuranceFinding {
  if (enforced.state === "invalid") {
    return finding("csp-hashes", "invalid", ["content-security-policy"], enforced.summary);
  }
  if (reportOnly.state === "invalid") {
    return finding(
      "csp-hashes",
      "invalid",
      ["content-security-policy-report-only"],
      reportOnly.summary
    );
  }
  const analyses = (result: CspParseResult) =>
    result.state === "present"
      ? result.policies.flatMap((policy) =>
          effectiveDirectiveTokens(policy, [...SCRIPT_SOURCE_CHAINS, ...STYLE_SOURCE_CHAINS])
            .flat()
            .filter((token) => /^'(?:sha256|sha384|sha512)-/iu.test(token))
            .map(parseCspHashSource)
        )
      : [];
  const enforcedAnalyses = analyses(enforced);
  const reportOnlyAnalyses = analyses(reportOnly);
  const invalid = enforcedAnalyses.reduce(
    (total, item) => total + item.invalidSupportedTokenCount,
    0
  );
  const valid = enforcedAnalyses.reduce((total, item) => total + item.metadata.length, 0);
  const reportOnlyValid = reportOnlyAnalyses.some((item) => item.metadata.length > 0);
  const multiplePolicies = enforced.state === "present" && enforced.policies.length > 1;

  if (invalid > 0) {
    return finding(
      "csp-hashes",
      "invalid",
      ["content-security-policy"],
      "CSP contains a SHA-2 hash source whose decoded digest length does not match its algorithm.",
      `${String(valid)} valid hash sources; ${String(invalid)} invalid`
    );
  }
  if (valid > 0 && multiplePolicies) {
    return finding(
      "csp-hashes",
      "inconclusive",
      ["content-security-policy"],
      `A valid hash source is declared, but effective authorisation depends on the intersection of ${String(enforced.policies.length)} enforced policies.`,
      `${String(valid)} valid hash source${valid === 1 ? "" : "s"}`
    );
  }
  if (valid > 0) {
    return finding(
      "csp-hashes",
      "observed",
      ["content-security-policy"],
      "A CSP hash source has a recognised algorithm and matching decoded digest length; content matching remains unverified.",
      `${String(valid)} valid hash source${valid === 1 ? "" : "s"}`
    );
  }
  if (reportOnlyValid) {
    return finding(
      "csp-hashes",
      "report_only",
      ["content-security-policy-report-only"],
      "A valid hash source appears only in report-only CSP and is not enforced."
    );
  }
  return finding(
    "csp-hashes",
    "missing",
    ["content-security-policy"],
    "A valid CSP hash source was not declared in an applicable source list."
  );
}

function cspDirectiveTokenFinding(
  enforced: CspParseResult,
  reportOnly: CspParseResult,
  controlId: string,
  directive: string,
  predicate: (token: string) => boolean,
  label: string
): AssuranceFinding {
  if (enforced.state === "invalid") {
    return finding(controlId, "invalid", ["content-security-policy"], enforced.summary);
  }
  if (reportOnly.state === "invalid") {
    return finding(
      controlId,
      "invalid",
      ["content-security-policy-report-only"],
      reportOnly.summary
    );
  }
  const present =
    enforced.state === "present" &&
    enforced.policies.some((policy) => (policy.get(directive) ?? []).some(predicate));
  const reported =
    reportOnly.state === "present" &&
    reportOnly.policies.some((policy) => (policy.get(directive) ?? []).some(predicate));
  return finding(
    controlId,
    present ? "observed" : reported ? "report_only" : "missing",
    present
      ? ["content-security-policy"]
      : reported
        ? ["content-security-policy-report-only"]
        : ["content-security-policy"],
    present
      ? `${label} was declared in enforced CSP.`
      : reported
        ? `${label} appears only in report-only CSP and is not enforced.`
        : `${label} was not declared in CSP.`
  );
}

function enumHeaderFinding(
  headers: NormalisedHeaders,
  controlId: string,
  headerName: string,
  accepted: readonly string[],
  allowReportTo = false
): AssuranceFinding {
  const header = singleton(headers, headerName);
  if (header.state === "missing") {
    return finding(controlId, "missing", [headerName], `${headerName} was not observed.`);
  }
  if (header.state === "invalid") {
    return finding(controlId, "invalid", [headerName], header.summary);
  }
  const [rawValue = "", ...rawParameters] = header.value.split(";");
  const normalised = rawValue.trim().toLowerCase();
  const parameters = rawParameters.map((value) => value.trim()).filter(Boolean);
  const validParameters =
    parameters.length === 0 ||
    (allowReportTo &&
      parameters.every(
        (parameter) =>
          !hasAsciiControl(parameter) &&
          /^report-to=(?:"[^"]{1,256}"|[A-Za-z0-9!#$%&'*+\-.^_`|~]{1,256})$/u.test(parameter)
      ));
  if (!accepted.includes(normalised) || !validParameters) {
    return finding(
      controlId,
      "invalid",
      [headerName],
      `${headerName} does not contain a recognised value or parameter set.`
    );
  }
  return finding(
    controlId,
    "observed",
    [headerName],
    `${headerName} contains a recognised value.`,
    parameters.length > 0 ? `${normalised}; report-to present` : normalised
  );
}

function hstsFinding(headers: NormalisedHeaders): AssuranceFinding {
  const header = singleton(headers, "strict-transport-security");
  if (header.state === "missing") {
    return finding(
      "strict-transport-security",
      "missing",
      ["strict-transport-security"],
      "Strict-Transport-Security was not observed."
    );
  }
  if (header.state === "invalid") {
    return finding(
      "strict-transport-security",
      "invalid",
      ["strict-transport-security"],
      header.summary
    );
  }
  const directives = header.value
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  const directiveNames = directives.map((value) => value.split("=", 1)[0]?.toLowerCase() ?? "");
  if (new Set(directiveNames).size !== directiveNames.length) {
    return finding(
      "strict-transport-security",
      "invalid",
      ["strict-transport-security"],
      "Strict-Transport-Security repeats a directive."
    );
  }
  const maxAgeDirective = directives.find((value) => /^max-age=/iu.test(value));
  const maxAge = maxAgeDirective?.slice(maxAgeDirective.indexOf("=") + 1);
  if (!maxAge || !/^\d+$/u.test(maxAge)) {
    return finding(
      "strict-transport-security",
      "invalid",
      ["strict-transport-security"],
      "Strict-Transport-Security lacks a numeric max-age directive."
    );
  }
  const unknown = directives.filter(
    (value) => !/^max-age=\d+$/iu.test(value) && !/^(?:includesubdomains|preload)$/iu.test(value)
  );
  if (unknown.length > 0) {
    return finding(
      "strict-transport-security",
      "invalid",
      ["strict-transport-security"],
      "Strict-Transport-Security contains an unrecognised directive."
    );
  }
  const lowered = directives.map((value) => value.toLowerCase());
  if (/^0+$/u.test(maxAge)) {
    return finding(
      "strict-transport-security",
      "missing",
      ["strict-transport-security"],
      "Strict-Transport-Security declares max-age=0 and requests removal of stored HSTS state.",
      "max-age 0"
    );
  }
  return finding(
    "strict-transport-security",
    "observed",
    ["strict-transport-security"],
    "Strict-Transport-Security requests a positive max-age; delivery over authenticated HTTPS was not established.",
    `max-age ${maxAge}; includeSubDomains ${String(lowered.includes("includesubdomains"))}; preload ${String(lowered.includes("preload"))}`
  );
}

function clearSiteDataFinding(headers: NormalisedHeaders): AssuranceFinding {
  const header = singleton(headers, "clear-site-data");
  if (header.state === "missing") {
    return finding(
      "clear-site-data",
      "missing",
      ["clear-site-data"],
      "Clear-Site-Data was not observed on this response."
    );
  }
  if (header.state === "invalid") {
    return finding("clear-site-data", "invalid", ["clear-site-data"], header.summary);
  }
  const directives = header.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const recognised = new Set(['"cache"', '"cookies"', '"storage"', '"executioncontexts"', '"*"']);
  if (directives.length === 0 || directives.some((value) => !recognised.has(value.toLowerCase()))) {
    return finding(
      "clear-site-data",
      "invalid",
      ["clear-site-data"],
      "Clear-Site-Data contains an unrecognised or unquoted directive."
    );
  }
  return finding(
    "clear-site-data",
    "observed",
    ["clear-site-data"],
    "Clear-Site-Data contains recognised quoted directives.",
    directives.map((value) => value.toLowerCase()).join(", ")
  );
}

function referrerPolicyFinding(headers: NormalisedHeaders): AssuranceFinding {
  const header = singleton(headers, "referrer-policy");
  if (header.state === "missing") {
    return finding(
      "referrer-policy",
      "missing",
      ["referrer-policy"],
      "Referrer-Policy was not observed."
    );
  }
  if (header.state === "invalid") {
    return finding("referrer-policy", "invalid", ["referrer-policy"], header.summary);
  }
  const accepted = new Set([
    "no-referrer",
    "no-referrer-when-downgrade",
    "origin",
    "origin-when-cross-origin",
    "same-origin",
    "strict-origin",
    "strict-origin-when-cross-origin",
    "unsafe-url"
  ]);
  const policies = header.value
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (policies.length === 0 || policies.some((value) => !accepted.has(value))) {
    return finding(
      "referrer-policy",
      "invalid",
      ["referrer-policy"],
      "Referrer-Policy contains an unrecognised value."
    );
  }
  return finding(
    "referrer-policy",
    "observed",
    ["referrer-policy"],
    "Referrer-Policy contains recognised values.",
    policies.join(", ")
  );
}

function splitStructuredList(value: string): string[] | undefined {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (depth < 0) return undefined;
    if (!quoted && depth === 0 && character === ",") {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (quoted || depth !== 0 || escaped) return undefined;
  parts.push(current.trim());
  return parts;
}

function validPermissionsAllowlist(value: string): boolean {
  const normalised = value.trim();
  if (hasAsciiControl(normalised)) return false;
  return (
    normalised === "" ||
    /^(?:\*|self|src|"(?:[^"\\]|\\["\\])*")(?:\s+(?:\*|self|src|"(?:[^"\\]|\\["\\])*"))*$/u.test(
      normalised
    )
  );
}

function permissionsPolicyFinding(headers: NormalisedHeaders): AssuranceFinding {
  const header = singleton(headers, "permissions-policy");
  if (header.state === "missing") {
    return finding(
      "permissions-policy",
      "missing",
      ["permissions-policy"],
      "Permissions-Policy was not observed."
    );
  }
  if (header.state === "invalid") {
    return finding("permissions-policy", "invalid", ["permissions-policy"], header.summary);
  }
  const directives = splitStructuredList(header.value)?.filter(Boolean);
  if (!directives || directives.length === 0) {
    return finding(
      "permissions-policy",
      "invalid",
      ["permissions-policy"],
      "Permissions-Policy contains an unrecognised directive shape."
    );
  }
  const names = new Set<string>();
  for (const directive of directives) {
    const match = /^([a-z][a-z0-9-]*)\s*=\s*\((.*)\)$/iu.exec(directive);
    if (!match || !validPermissionsAllowlist(match[2] ?? "")) {
      return finding(
        "permissions-policy",
        "invalid",
        ["permissions-policy"],
        "Permissions-Policy contains an invalid directive or allowlist."
      );
    }
    const name = (match[1] ?? "").toLowerCase();
    if (names.has(name)) {
      return finding(
        "permissions-policy",
        "invalid",
        ["permissions-policy"],
        "Permissions-Policy repeats a directive."
      );
    }
    names.add(name);
  }
  return finding(
    "permissions-policy",
    "observed",
    ["permissions-policy"],
    "Permissions-Policy contains parseable directive shapes.",
    `${String(directives.length)} directives parsed`
  );
}

type CookieSummary = {
  total: number;
  sameSite: number;
  invalidSameSite: number;
  partitioned: number;
  invalidPartitioned: number;
  httpOnly: number;
  prefixCookies: number;
  invalidPrefixCookies: number;
  malformedAttributes: number;
};

function summariseCookies(headers: NormalisedHeaders): CookieSummary {
  const values = headers.get("set-cookie") ?? [];
  const summary: CookieSummary = {
    total: 0,
    sameSite: 0,
    invalidSameSite: 0,
    partitioned: 0,
    invalidPartitioned: 0,
    httpOnly: 0,
    prefixCookies: 0,
    invalidPrefixCookies: 0,
    malformedAttributes: 0
  };
  for (const value of values) {
    const [pair = "", ...rawAttributes] = value.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    summary.total += 1;
    const name = pair.slice(0, separator).trim();
    const attributes = new Map<string, string | undefined>();
    let duplicateAttribute = false;
    for (const rawAttribute of rawAttributes) {
      const normalised = rawAttribute.trim();
      if (!normalised) continue;
      const attributeSeparator = normalised.indexOf("=");
      const attributeName = (
        attributeSeparator === -1 ? normalised : normalised.slice(0, attributeSeparator)
      ).toLowerCase();
      const attributeValue =
        attributeSeparator === -1 ? undefined : normalised.slice(attributeSeparator + 1).trim();
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(attributeName) || attributes.has(attributeName)) {
        duplicateAttribute = true;
        continue;
      }
      attributes.set(attributeName, attributeValue);
    }
    if (duplicateAttribute) summary.malformedAttributes += 1;
    const hasSecure = attributes.has("secure") && attributes.get("secure") === undefined;
    const hasHttpOnly = attributes.has("httponly") && attributes.get("httponly") === undefined;
    const hasPartitioned =
      attributes.has("partitioned") && attributes.get("partitioned") === undefined;
    const sameSiteValue = attributes.get("samesite")?.toLowerCase();
    const hasSameSite = attributes.has("samesite");
    if (hasSameSite) {
      summary.sameSite += 1;
      if (
        !sameSiteValue ||
        !["strict", "lax", "none"].includes(sameSiteValue) ||
        (sameSiteValue === "none" && !hasSecure)
      ) {
        summary.invalidSameSite += 1;
      }
    }
    if (hasPartitioned) {
      summary.partitioned += 1;
      if (!hasSecure) summary.invalidPartitioned += 1;
    }
    if (hasHttpOnly) summary.httpOnly += 1;
    if (
      name.startsWith("__Host-Http-") ||
      name.startsWith("__Http-") ||
      name.startsWith("__Host-") ||
      name.startsWith("__Secure-")
    ) {
      summary.prefixCookies += 1;
      const hostScoped = name.startsWith("__Host-");
      const httpBound = name.startsWith("__Http-") || name.startsWith("__Host-Http-");
      const valid =
        hasSecure &&
        (!httpBound || hasHttpOnly) &&
        (!hostScoped || (attributes.get("path") === "/" && !attributes.has("domain")));
      if (!valid) summary.invalidPrefixCookies += 1;
    }
  }
  return summary;
}

function cookieFinding(
  cookies: CookieSummary,
  controlId: string,
  observed: number,
  invalid: number,
  label: string,
  optional: boolean
): AssuranceFinding {
  if (cookies.total === 0) {
    return finding(
      controlId,
      "not_evaluated",
      ["set-cookie"],
      "No parseable Set-Cookie field was present in this response snapshot."
    );
  }
  if (observed === 0 && optional) {
    return finding(
      controlId,
      "not_evaluated",
      ["set-cookie"],
      `No ${label} cookie was declared; this response may not require one.`
    );
  }
  if (invalid > 0 || cookies.malformedAttributes > 0) {
    return finding(
      controlId,
      "invalid",
      ["set-cookie"],
      `${label} evidence contains invalid or duplicate attributes.`,
      `${String(observed)} observed; ${String(invalid)} invalid; ${String(cookies.malformedAttributes)} malformed attribute sets`
    );
  }
  if (!optional && observed > 0 && observed < cookies.total) {
    return finding(
      controlId,
      "inconclusive",
      ["set-cookie"],
      `${label} was present on only some cookies in this response; cookie purpose and route coverage require review.`,
      `${String(observed)} of ${String(cookies.total)} cookies`
    );
  }
  return finding(
    controlId,
    observed > 0 ? "observed" : "missing",
    ["set-cookie"],
    observed > 0
      ? `${label} was declared on ${String(observed)} of ${String(cookies.total)} cookies.`
      : `${label} was not declared on any of ${String(cookies.total)} cookies.`,
    `${String(observed)} of ${String(cookies.total)} cookies`
  );
}

export function inspectHeaders(snapshotInput: unknown): AssuranceReport {
  const { snapshot, headers } = normalisedHeaders(snapshotInput);
  const csp = parseCsp(headers, "content-security-policy");
  const reportOnlyCsp = parseCsp(headers, "content-security-policy-report-only");
  const cookies = summariseCookies(headers);
  const byControl = new Map<string, AssuranceFinding>();

  byControl.set(
    "content-security-policy",
    csp.state === "invalid"
      ? finding("content-security-policy", "invalid", ["content-security-policy"], csp.summary)
      : reportOnlyCsp.state === "invalid"
        ? finding(
            "content-security-policy",
            "invalid",
            ["content-security-policy-report-only"],
            reportOnlyCsp.summary
          )
        : csp.state === "missing" && reportOnlyCsp.state === "present"
          ? finding(
              "content-security-policy",
              "report_only",
              ["content-security-policy-report-only"],
              "Only report-only CSP was observed; it does not enforce restrictions.",
              `${String(reportOnlyCsp.policies.length)} report-only policies`
            )
          : csp.state === "missing"
            ? finding(
                "content-security-policy",
                "missing",
                ["content-security-policy"],
                "Content-Security-Policy was not observed."
              )
            : finding(
                "content-security-policy",
                "observed",
                ["content-security-policy"],
                "Content-Security-Policy contains parseable directives.",
                `${String(csp.policies.length)} policies and ${String(csp.directiveCount)} directives`
              )
  );
  byControl.set("csp-nonces", cspNonceFinding(csp, reportOnlyCsp));
  byControl.set("csp-hashes", cspHashFinding(csp, reportOnlyCsp));
  byControl.set(
    "strict-dynamic",
    cspTokenFinding(
      csp,
      reportOnlyCsp,
      "strict-dynamic",
      SCRIPT_SOURCE_CHAINS,
      (token) => token.toLowerCase() === "'strict-dynamic'",
      "The CSP strict-dynamic source expression"
    )
  );
  for (const [controlId, directive] of [
    ["csp-base-uri", "base-uri"],
    ["csp-frame-ancestors", "frame-ancestors"],
    ["csp-form-action", "form-action"],
    ["csp-upgrade-insecure-requests", "upgrade-insecure-requests"],
    ["csp-sandbox", "sandbox"]
  ] as const) {
    byControl.set(controlId, cspDirectiveFinding(csp, reportOnlyCsp, controlId, directive));
  }
  byControl.set(
    "trusted-types",
    cspDirectiveTokenFinding(
      csp,
      reportOnlyCsp,
      "trusted-types",
      "require-trusted-types-for",
      (token) => token.toLowerCase() === "'script'",
      "A Trusted Types enforcement token"
    )
  );
  byControl.set(
    "subresource-integrity",
    finding(
      "subresource-integrity",
      "not_evaluated",
      [],
      "Subresource Integrity requires HTML or DOM evidence and cannot be established from response headers."
    )
  );
  byControl.set(
    "cross-origin-opener-policy",
    enumHeaderFinding(
      headers,
      "cross-origin-opener-policy",
      "cross-origin-opener-policy",
      ["same-origin", "same-origin-allow-popups", "noopener-allow-popups"],
      true
    )
  );
  const coepFinding = enumHeaderFinding(
    headers,
    "cross-origin-embedder-policy",
    "cross-origin-embedder-policy",
    ["require-corp", "credentialless"],
    true
  );
  byControl.set("cross-origin-embedder-policy", coepFinding);
  byControl.set(
    "cross-origin-resource-policy",
    enumHeaderFinding(headers, "cross-origin-resource-policy", "cross-origin-resource-policy", [
      "same-origin",
      "same-site",
      "cross-origin"
    ])
  );
  const coep = singleton(headers, "cross-origin-embedder-policy");
  const coepValue =
    coep.state === "present" ? (coep.value.split(";", 1)[0]?.trim().toLowerCase() ?? "") : "";
  byControl.set(
    "coep-credentialless",
    coepFinding.state === "missing"
      ? finding(
          "coep-credentialless",
          "missing",
          ["cross-origin-embedder-policy"],
          "COEP credentialless was not observed."
        )
      : coepFinding.state === "invalid" || coep.state !== "present"
        ? finding(
            "coep-credentialless",
            "invalid",
            ["cross-origin-embedder-policy"],
            coepFinding.summary
          )
        : finding(
            "coep-credentialless",
            coepValue === "credentialless" ? "observed" : "missing",
            ["cross-origin-embedder-policy"],
            coepValue === "credentialless"
              ? "Cross-Origin-Embedder-Policy declares credentialless."
              : "Cross-Origin-Embedder-Policy does not declare credentialless."
          )
  );
  byControl.set(
    "origin-agent-cluster",
    enumHeaderFinding(headers, "origin-agent-cluster", "origin-agent-cluster", ["?1"])
  );
  byControl.set(
    "fetch-metadata",
    finding(
      "fetch-metadata",
      "not_evaluated",
      [],
      "Fetch Metadata is carried in browser request headers, not the inspected response headers."
    )
  );
  byControl.set("permissions-policy", permissionsPolicyFinding(headers));
  byControl.set("strict-transport-security", hstsFinding(headers));
  byControl.set(
    "x-content-type-options",
    enumHeaderFinding(headers, "x-content-type-options", "x-content-type-options", ["nosniff"])
  );
  byControl.set("clear-site-data", clearSiteDataFinding(headers));
  byControl.set("referrer-policy", referrerPolicyFinding(headers));
  byControl.set(
    "samesite-cookies",
    cookieFinding(
      cookies,
      "samesite-cookies",
      cookies.sameSite,
      cookies.invalidSameSite,
      "SameSite",
      false
    )
  );
  byControl.set(
    "partitioned-cookies",
    cookieFinding(
      cookies,
      "partitioned-cookies",
      cookies.partitioned,
      cookies.invalidPartitioned,
      "Partitioned",
      true
    )
  );
  byControl.set(
    "httponly-cookies",
    cookieFinding(cookies, "httponly-cookies", cookies.httpOnly, 0, "HttpOnly", false)
  );
  byControl.set(
    "secure-cookie-prefixes",
    cookies.prefixCookies === 0
      ? finding(
          "secure-cookie-prefixes",
          "not_evaluated",
          ["set-cookie"],
          "No recognised secure cookie prefix was present; prefix use is optional."
        )
      : finding(
          "secure-cookie-prefixes",
          cookies.invalidPrefixCookies === 0 && cookies.malformedAttributes === 0
            ? "observed"
            : "invalid",
          ["set-cookie"],
          cookies.invalidPrefixCookies === 0 && cookies.malformedAttributes === 0
            ? "Cookie prefix requirements were satisfied for every prefixed cookie."
            : "One or more prefixed cookies did not satisfy their Secure, HttpOnly, Path, or Domain requirements, or another cookie contained duplicate attributes.",
          `${String(cookies.prefixCookies)} prefixed cookies; ${String(cookies.invalidPrefixCookies)} invalid; ${String(cookies.malformedAttributes)} malformed attribute sets`
        )
  );
  for (const controlId of [
    "webauthn-platform-authenticator",
    "webauthn-prf",
    "webauthn-conditional-mediation"
  ]) {
    byControl.set(
      controlId,
      finding(
        controlId,
        "not_evaluated",
        [],
        "WebAuthn use and configuration cannot be established from response headers."
      )
    );
  }

  const findings = SECURITY_CONTROLS.map((control) => {
    const result = byControl.get(control.id);
    if (!result) {
      return finding(
        control.id,
        "not_evaluated",
        [],
        "No offline response-header check is defined for this control."
      );
    }
    return result;
  });
  const recognisedHeaderCount = [...headers.keys()].filter((name) =>
    RECOGNIZED_HEADERS.has(name)
  ).length;

  return assuranceReportSchema.parse({
    schemaVersion: 2,
    name: snapshot.name,
    inputHeaderCount: headers.size,
    recognisedHeaderCount,
    summary: {
      observed: findings.filter((result) => result.state === "observed").length,
      missing: findings.filter((result) => result.state === "missing").length,
      invalid: findings.filter((result) => result.state === "invalid").length,
      notEvaluated: findings.filter((result) => result.state === "not_evaluated").length,
      reportOnly: findings.filter((result) => result.state === "report_only").length,
      inconclusive: findings.filter((result) => result.state === "inconclusive").length
    },
    findings
  });
}
