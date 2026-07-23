import { SECURITY_CONTROLS } from "./catalogue";
import {
  type AssuranceFinding,
  type AssuranceReport,
  type HeaderSnapshot,
  assuranceReportSchema,
  headerSnapshotSchema
} from "./contracts";

export const MAX_HEADER_BLOCK_BYTES = 64 * 1_024;

const RECOGNIZED_HEADERS = new Set([
  "clear-site-data",
  "content-security-policy",
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

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
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

function parseCsp(
  headers: NormalisedHeaders
):
  | { state: "missing" }
  | { state: "invalid"; summary: string }
  | { state: "present"; policies: CspPolicy[]; directiveCount: number } {
  const values = headers.get("content-security-policy");
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
  csp: ReturnType<typeof parseCsp>,
  controlId: string,
  directive: string
): AssuranceFinding {
  if (csp.state === "missing") {
    return finding(
      controlId,
      "missing",
      ["content-security-policy"],
      `The ${directive} directive was not observed because CSP is absent.`
    );
  }
  if (csp.state === "invalid") {
    return finding(controlId, "invalid", ["content-security-policy"], csp.summary);
  }
  const present = csp.policies.some((policy) => policy.has(directive));
  return finding(
    controlId,
    present ? "observed" : "missing",
    ["content-security-policy"],
    present
      ? `CSP declares the ${directive} directive.`
      : `CSP does not declare the ${directive} directive.`,
    present ? `${directive} present` : undefined
  );
}

function cspTokenFinding(
  csp: ReturnType<typeof parseCsp>,
  controlId: string,
  predicate: (token: string) => boolean,
  label: string
): AssuranceFinding {
  if (csp.state === "missing") {
    return finding(controlId, "missing", ["content-security-policy"], `${label} was not observed.`);
  }
  if (csp.state === "invalid") {
    return finding(controlId, "invalid", ["content-security-policy"], csp.summary);
  }
  const present = csp.policies.some((policy) =>
    [...policy.values()].some((tokens) => tokens.some(predicate))
  );
  return finding(
    controlId,
    present ? "observed" : "missing",
    ["content-security-policy"],
    present ? `${label} was declared in CSP.` : `${label} was not declared in CSP.`
  );
}

function cspDirectiveTokenFinding(
  csp: ReturnType<typeof parseCsp>,
  controlId: string,
  directive: string,
  predicate: (token: string) => boolean,
  label: string
): AssuranceFinding {
  if (csp.state === "missing") {
    return finding(controlId, "missing", ["content-security-policy"], `${label} was not observed.`);
  }
  if (csp.state === "invalid") {
    return finding(controlId, "invalid", ["content-security-policy"], csp.summary);
  }
  const present = csp.policies.some((policy) => (policy.get(directive) ?? []).some(predicate));
  return finding(
    controlId,
    present ? "observed" : "missing",
    ["content-security-policy"],
    present ? `${label} was declared in CSP.` : `${label} was not declared in CSP.`
  );
}

function enumHeaderFinding(
  headers: NormalisedHeaders,
  controlId: string,
  headerName: string,
  accepted: readonly string[]
): AssuranceFinding {
  const header = singleton(headers, headerName);
  if (header.state === "missing") {
    return finding(controlId, "missing", [headerName], `${headerName} was not observed.`);
  }
  if (header.state === "invalid") {
    return finding(controlId, "invalid", [headerName], header.summary);
  }
  const normalised = header.value.trim().toLowerCase();
  if (!accepted.includes(normalised)) {
    return finding(
      controlId,
      "invalid",
      [headerName],
      `${headerName} does not contain a recognised value.`
    );
  }
  return finding(
    controlId,
    "observed",
    [headerName],
    `${headerName} contains a recognised value.`,
    normalised
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
  const directives = header.value.split(";").map((value) => value.trim());
  const maxAge = directives.find((value) => /^max-age=/iu.test(value))?.split("=")[1];
  if (!maxAge || !/^\d+$/u.test(maxAge)) {
    return finding(
      "strict-transport-security",
      "invalid",
      ["strict-transport-security"],
      "Strict-Transport-Security lacks a numeric max-age directive."
    );
  }
  const lowered = directives.map((value) => value.toLowerCase());
  return finding(
    "strict-transport-security",
    "observed",
    ["strict-transport-security"],
    "Strict-Transport-Security contains a numeric max-age.",
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
  const directives = header.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    directives.length === 0 ||
    directives.some((value) => !/^[a-z][a-z0-9-]*\s*=\s*\([^)]*\)$/iu.test(value))
  ) {
    return finding(
      "permissions-policy",
      "invalid",
      ["permissions-policy"],
      "Permissions-Policy contains an unrecognised directive shape."
    );
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
  partitioned: number;
  httpOnly: number;
  prefixCookies: number;
  invalidPrefixCookies: number;
};

function summariseCookies(headers: NormalisedHeaders): CookieSummary {
  const values = headers.get("set-cookie") ?? [];
  const summary: CookieSummary = {
    total: 0,
    sameSite: 0,
    partitioned: 0,
    httpOnly: 0,
    prefixCookies: 0,
    invalidPrefixCookies: 0
  };
  for (const value of values) {
    const [pair = "", ...rawAttributes] = value.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    summary.total += 1;
    const name = pair.slice(0, separator).trim();
    const attributes = rawAttributes.map((attribute) => attribute.trim().toLowerCase());
    const hasSecure = attributes.includes("secure");
    const hasHttpOnly = attributes.includes("httponly");
    const hasPartitioned = attributes.includes("partitioned");
    const hasSameSite = attributes.some((attribute) => attribute.startsWith("samesite="));
    if (hasSameSite) summary.sameSite += 1;
    if (hasPartitioned) summary.partitioned += 1;
    if (hasHttpOnly) summary.httpOnly += 1;
    if (name.startsWith("__Host-") || name.startsWith("__Secure-")) {
      summary.prefixCookies += 1;
      const hostValid =
        !name.startsWith("__Host-") ||
        (hasSecure &&
          attributes.includes("path=/") &&
          !attributes.some((attribute) => attribute.startsWith("domain=")));
      if (!hasSecure || !hostValid) summary.invalidPrefixCookies += 1;
    }
  }
  return summary;
}

function cookieFinding(
  cookies: CookieSummary,
  controlId: string,
  observed: number,
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
  const csp = parseCsp(headers);
  const cookies = summariseCookies(headers);
  const byControl = new Map<string, AssuranceFinding>();

  byControl.set(
    "content-security-policy",
    csp.state === "missing"
      ? finding(
          "content-security-policy",
          "missing",
          ["content-security-policy"],
          "Content-Security-Policy was not observed."
        )
      : csp.state === "invalid"
        ? finding("content-security-policy", "invalid", ["content-security-policy"], csp.summary)
        : finding(
            "content-security-policy",
            "observed",
            ["content-security-policy"],
            "Content-Security-Policy contains parseable directives.",
            `${String(csp.policies.length)} policies and ${String(csp.directiveCount)} directives`
          )
  );
  byControl.set(
    "csp-nonces",
    cspTokenFinding(
      csp,
      "csp-nonces",
      (token) => token.toLowerCase().startsWith("'nonce-"),
      "A CSP nonce source expression"
    )
  );
  byControl.set(
    "csp-hashes",
    cspTokenFinding(
      csp,
      "csp-hashes",
      (token) => /^'(?:sha256|sha384|sha512)-/iu.test(token),
      "A CSP hash source expression"
    )
  );
  byControl.set(
    "strict-dynamic",
    cspTokenFinding(
      csp,
      "strict-dynamic",
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
    byControl.set(controlId, cspDirectiveFinding(csp, controlId, directive));
  }
  byControl.set(
    "trusted-types",
    cspDirectiveTokenFinding(
      csp,
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
    enumHeaderFinding(headers, "cross-origin-opener-policy", "cross-origin-opener-policy", [
      "same-origin",
      "same-origin-allow-popups",
      "noopener-allow-popups"
    ])
  );
  byControl.set(
    "cross-origin-embedder-policy",
    enumHeaderFinding(headers, "cross-origin-embedder-policy", "cross-origin-embedder-policy", [
      "require-corp",
      "credentialless"
    ])
  );
  byControl.set(
    "cross-origin-resource-policy",
    enumHeaderFinding(headers, "cross-origin-resource-policy", "cross-origin-resource-policy", [
      "same-origin",
      "same-site",
      "cross-origin"
    ])
  );
  const coep = singleton(headers, "cross-origin-embedder-policy");
  byControl.set(
    "coep-credentialless",
    coep.state === "missing"
      ? finding(
          "coep-credentialless",
          "missing",
          ["cross-origin-embedder-policy"],
          "COEP credentialless was not observed."
        )
      : coep.state === "invalid"
        ? finding("coep-credentialless", "invalid", ["cross-origin-embedder-policy"], coep.summary)
        : finding(
            "coep-credentialless",
            coep.value.trim().toLowerCase() === "credentialless" ? "observed" : "missing",
            ["cross-origin-embedder-policy"],
            coep.value.trim().toLowerCase() === "credentialless"
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
    cookieFinding(cookies, "samesite-cookies", cookies.sameSite, "SameSite", false)
  );
  byControl.set(
    "partitioned-cookies",
    cookieFinding(cookies, "partitioned-cookies", cookies.partitioned, "Partitioned", true)
  );
  byControl.set(
    "httponly-cookies",
    cookieFinding(cookies, "httponly-cookies", cookies.httpOnly, "HttpOnly", false)
  );
  byControl.set(
    "secure-cookie-prefixes",
    cookies.prefixCookies === 0
      ? finding(
          "secure-cookie-prefixes",
          "not_evaluated",
          ["set-cookie"],
          "No __Host- or __Secure- cookie name was present; prefix use is optional."
        )
      : finding(
          "secure-cookie-prefixes",
          cookies.invalidPrefixCookies === 0 ? "observed" : "invalid",
          ["set-cookie"],
          cookies.invalidPrefixCookies === 0
            ? "Cookie prefix requirements were satisfied for every prefixed cookie."
            : "One or more prefixed cookies did not satisfy their Secure, Path, or Domain requirements.",
          `${String(cookies.prefixCookies)} prefixed cookies; ${String(cookies.invalidPrefixCookies)} invalid`
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
    schemaVersion: 1,
    name: snapshot.name,
    inputHeaderCount: headers.size,
    recognisedHeaderCount,
    summary: {
      observed: findings.filter((result) => result.state === "observed").length,
      missing: findings.filter((result) => result.state === "missing").length,
      invalid: findings.filter((result) => result.state === "invalid").length,
      notEvaluated: findings.filter((result) => result.state === "not_evaluated").length
    },
    findings
  });
}
