import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { CATALOGUE_VERSION, SECURITY_CONTROLS } from "./catalogue";
import {
  type AssuranceFinding,
  type AssuranceReport,
  type CompositeAssessment,
  type CspMarkupReport,
  type EvidenceBundleInput,
  type EvidenceBundleReport,
  type FetchMetadataReport,
  type HeaderSnapshot,
  type HtmlResourceReport,
  type ResourceVerificationReport,
  type ResponseContextReport,
  type ResponseSnapshot,
  type SurfaceCoverage,
  type SurfaceAssessment,
  type WebauthnReport,
  assuranceFindingSchema,
  cspMarkupReportSchema,
  evidenceBundleInputSchema,
  evidenceBundleReportSchema,
  evidenceSourceContextSchema,
  fetchMetadataReportSchema,
  headerSnapshotSchema,
  htmlDocumentInputSchema,
  htmlResourceReportSchema,
  resourceVerificationReportSchema,
  responseContextReportSchema,
  surfaceAssessmentSchema,
  webauthnConfigurationSchema,
  webauthnReportSchema
} from "./contracts";
import { EVIDENCE_ANALYSER_VERSION, EVIDENCE_COMPOSITE_IDS } from "./evidence-model";
import { fingerprintEvidenceReportBody } from "./evidence-report";
import { absentScopeInventory, reduceScopeInventory } from "./scope-inventory";
import { cspElementTokens, extractCspEvidence, inspectHeaders, type CspPolicy } from "./assurance";
import {
  decodeBase64Bytes,
  parseCspHashSource,
  parseCspNonceSource,
  parseIntegrityMetadata,
  strongestIntegrityMetadata,
  type IntegrityAlgorithm
} from "./integrity";

const MAX_HTML_ELEMENTS = 8_192;
const MAX_ELIGIBLE_RESOURCES = 512;
const MAX_HTML_PARSE_ERRORS = 64;
const MAX_RESOURCE_BYTES = 256 * 1_024;
const MAX_TOTAL_RESOURCE_BYTES = 1_024 * 1_024;
const SENSITIVE_REQUEST_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "proxy-authenticate"
]);
const FETCH_HEADER_NAMES = [
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user"
] as const;

type ResourceKind = "script" | "style" | "preload";
type ReferenceKind = "relative" | "absolute" | "other";
type HtmlResourceEvidence = {
  reference: string;
  integrity?: string;
};
type InlineElementEvidence = {
  kind: "script" | "style";
  content: string;
  nonce?: string;
};
type HtmlAnalysis = {
  report: HtmlResourceReport;
  resources: HtmlResourceEvidence[];
  inlineElements: InlineElementEvidence[];
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function statusClass(status: number | undefined): ResponseContextReport["statusClass"] {
  if (status === undefined) return "not_available";
  if (status < 200) return "informational";
  if (status < 300) return "success";
  if (status < 400) return "redirect";
  if (status < 500) return "client_error";
  return "server_error";
}

function reduceResponseContext(
  response: EvidenceBundleInput["responses"][number]
): ResponseContextReport | undefined {
  if (response.schemaVersion !== 2 || !response.surfaceId) return undefined;
  return responseContextReportSchema.parse({
    surfaceId: response.surfaceId,
    variantId: response.context.variantId,
    sequence: response.context.sequence,
    outcome: response.context.outcome,
    status: response.context.status,
    statusClass: statusClass(response.context.status),
    contentType: response.context.contentType,
    authentication: response.context.authentication,
    cache: response.context.cache,
    redirectChainId: response.context.redirectChainId,
    redirectTarget: response.context.redirectTarget,
    errorKind: response.context.errorKind
  });
}

function finding(
  controlId: string,
  state: AssuranceFinding["state"],
  sourceHeaders: string[],
  summary: string,
  evidence?: string
): AssuranceFinding {
  return assuranceFindingSchema.parse({
    controlId,
    state,
    sourceHeaders,
    summary,
    ...(evidence ? { evidence } : {})
  });
}

function attr(element: DefaultTreeAdapterTypes.Element, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name.toLowerCase() === name)?.value;
}

function referenceKind(value: string): ReferenceKind {
  const normalised = value.trim();
  if (
    normalised.startsWith("/") ||
    normalised.startsWith("./") ||
    normalised.startsWith("../") ||
    normalised.startsWith("?") ||
    normalised.startsWith("#")
  ) {
    return "relative";
  }
  if (/^(?:https?:)?\/\//iu.test(normalised)) return "absolute";
  return "other";
}

function resourceKind(element: DefaultTreeAdapterTypes.Element): ResourceKind | undefined {
  if (element.tagName === "script" && attr(element, "src")?.trim()) return "script";
  if (element.tagName !== "link" || !attr(element, "href")?.trim()) return undefined;
  const relations = new Set(
    (attr(element, "rel") ?? "").toLowerCase().split(/\s+/u).filter(Boolean)
  );
  if (relations.has("stylesheet")) return "style";
  if (relations.has("preload") || relations.has("modulepreload")) return "preload";
  return undefined;
}

function childText(parent: DefaultTreeAdapterTypes.ParentNode): string {
  return parent.childNodes
    .map((node) => {
      if ("value" in node) return node.value;
      if ("childNodes" in node) return childText(node);
      return "";
    })
    .join("");
}

function supportedIntegrityAlgorithms(value: string): {
  algorithms: ("sha256" | "sha384" | "sha512")[];
  valid: boolean;
} {
  const parsed = parseIntegrityMetadata(value);
  const algorithms = new Set(parsed.metadata.map((item) => item.algorithm));
  return {
    algorithms: [...algorithms].sort(),
    valid: algorithms.size > 0 && parsed.invalidSupportedTokenCount === 0
  };
}

function analyzeHtmlDocument(input: unknown): HtmlAnalysis {
  const documentInput = htmlDocumentInputSchema.parse(input);
  const inputBytes = byteLength(documentInput.html);
  if (inputBytes > 128 * 1_024) throw new Error("HTML input exceeds 131072 bytes.");

  let parseErrorCount = 0;
  const document = parseFragment(documentInput.html, {
    onParseError: () => {
      parseErrorCount += 1;
      if (parseErrorCount > MAX_HTML_PARSE_ERRORS) {
        throw new Error(`HTML input exceeds ${String(MAX_HTML_PARSE_ERRORS)} parse errors.`);
      }
    }
  });
  let elementCount = 0;
  let eligibleResourceCount = 0;
  let protectedResourceCount = 0;
  let unprotectedResourceCount = 0;
  let invalidIntegrityCount = 0;
  let scriptCount = 0;
  let styleCount = 0;
  let preloadCount = 0;
  let relativeReferenceCount = 0;
  let absoluteReferenceCount = 0;
  let otherReferenceCount = 0;
  const algorithms = new Set<"sha256" | "sha384" | "sha512">();
  const resources: HtmlResourceEvidence[] = [];
  const inlineElements: InlineElementEvidence[] = [];

  function walk(parent: DefaultTreeAdapterTypes.ParentNode): void {
    for (const node of parent.childNodes) {
      if (!("tagName" in node)) continue;
      elementCount += 1;
      if (elementCount > MAX_HTML_ELEMENTS) {
        throw new Error(`HTML input exceeds ${String(MAX_HTML_ELEMENTS)} elements.`);
      }
      const kind = resourceKind(node);
      if (kind) {
        eligibleResourceCount += 1;
        if (eligibleResourceCount > MAX_ELIGIBLE_RESOURCES) {
          throw new Error(
            `HTML input exceeds ${String(MAX_ELIGIBLE_RESOURCES)} executable or style resources.`
          );
        }
        if (kind === "script") scriptCount += 1;
        if (kind === "style") styleCount += 1;
        if (kind === "preload") preloadCount += 1;
        const reference = attr(node, kind === "script" ? "src" : "href") ?? "";
        const location = referenceKind(reference);
        if (location === "relative") relativeReferenceCount += 1;
        if (location === "absolute") absoluteReferenceCount += 1;
        if (location === "other") otherReferenceCount += 1;

        const integrity = attr(node, "integrity");
        resources.push({
          reference,
          ...(integrity === undefined ? {} : { integrity })
        });
        if (integrity === undefined) {
          unprotectedResourceCount += 1;
        } else {
          const parsed = supportedIntegrityAlgorithms(integrity);
          if (!parsed.valid) {
            invalidIntegrityCount += 1;
          } else {
            protectedResourceCount += 1;
            for (const algorithm of parsed.algorithms) algorithms.add(algorithm);
          }
        }
      }
      if (node.tagName === "script" && !attr(node, "src")?.trim()) {
        const nonce = attr(node, "nonce");
        inlineElements.push({
          kind: "script",
          content: childText(node),
          ...(nonce === undefined ? {} : { nonce })
        });
      }
      if (node.tagName === "style") {
        const nonce = attr(node, "nonce");
        inlineElements.push({
          kind: "style",
          content: childText(node),
          ...(nonce === undefined ? {} : { nonce })
        });
      }
      walk(node);
    }
  }

  walk(document);
  const integrityFinding =
    eligibleResourceCount === 0
      ? finding(
          "subresource-integrity",
          "not_evaluated",
          [],
          "No external script, stylesheet, or preload resource was present in the supplied HTML."
        )
      : invalidIntegrityCount > 0
        ? finding(
            "subresource-integrity",
            "invalid",
            [],
            "One or more integrity attributes contained no recognised SHA-256, SHA-384, or SHA-512 metadata.",
            `${String(protectedResourceCount)} protected; ${String(unprotectedResourceCount)} absent; ${String(invalidIntegrityCount)} invalid`
          )
        : unprotectedResourceCount > 0 || parseErrorCount > 0
          ? finding(
              "subresource-integrity",
              "inconclusive",
              [],
              parseErrorCount > 0
                ? "The supplied HTML required parser recovery, so complete SRI coverage needs source review."
                : "SRI metadata was present on only some eligible resources.",
              `${String(protectedResourceCount)} protected; ${String(unprotectedResourceCount)} absent; ${String(parseErrorCount)} parse errors`
            )
          : finding(
              "subresource-integrity",
              "observed",
              [],
              "Every eligible resource carried recognised SRI metadata; resource bytes were not fetched or verified.",
              `${String(protectedResourceCount)} of ${String(eligibleResourceCount)} resources`
            );

  return {
    report: htmlResourceReportSchema.parse({
      schemaVersion: 1,
      name: documentInput.name,
      inputBytes,
      elementCount,
      parseErrorCount,
      eligibleResourceCount,
      protectedResourceCount,
      unprotectedResourceCount,
      invalidIntegrityCount,
      scriptCount,
      styleCount,
      preloadCount,
      relativeReferenceCount,
      absoluteReferenceCount,
      otherReferenceCount,
      algorithms: [...algorithms].sort(),
      finding: integrityFinding
    }),
    resources,
    inlineElements
  };
}

export function inspectHtmlResources(input: unknown): HtmlResourceReport {
  return analyzeHtmlDocument(input).report;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function digestBytes(algorithm: IntegrityAlgorithm, bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const names: Readonly<Record<IntegrityAlgorithm, string>> = {
    sha256: "SHA-256",
    sha384: "SHA-384",
    sha512: "SHA-512"
  };
  return new Uint8Array(await subtle.digest(names[algorithm], bytes.slice().buffer));
}

async function verifyResourceBytes(
  bundle: ReturnType<typeof evidenceBundleInputSchema.parse>,
  htmlAnalyses: readonly HtmlAnalysis[]
): Promise<ResourceVerificationReport> {
  let suppliedBytes = 0;
  let matchedResourceCount = 0;
  let verifiedResourceCount = 0;
  let mismatchedResourceCount = 0;
  let invalidMetadataCount = 0;
  let unmatchedResourceCount = 0;
  const documents = bundle.htmlDocuments.map((document, index) => ({
    document,
    analysis: htmlAnalyses[index]
  }));

  for (const supplied of bundle.resourceBytes) {
    const bytes = decodeBase64Bytes(supplied.bodyBase64);
    if (!bytes) throw new Error(`Resource ${supplied.resourceId} contains invalid base64 bytes.`);
    if (bytes.byteLength > MAX_RESOURCE_BYTES) {
      throw new Error(
        `Resource ${supplied.resourceId} exceeds the ${String(MAX_RESOURCE_BYTES)}-byte bound.`
      );
    }
    suppliedBytes += bytes.byteLength;
    if (suppliedBytes > MAX_TOTAL_RESOURCE_BYTES) {
      throw new Error(
        `Resource bytes exceed the ${String(MAX_TOTAL_RESOURCE_BYTES)}-byte total bound.`
      );
    }

    const matches = documents.flatMap(({ document, analysis }) =>
      document.surfaceId === supplied.surfaceId && analysis
        ? analysis.resources.filter((resource) => resource.reference === supplied.reference)
        : []
    );
    if (matches.length !== 1) {
      unmatchedResourceCount += 1;
      continue;
    }
    matchedResourceCount += 1;
    const integrity = matches[0]?.integrity;
    if (!integrity) {
      invalidMetadataCount += 1;
      continue;
    }
    const parsed = parseIntegrityMetadata(integrity);
    const strongest = strongestIntegrityMetadata(parsed.metadata);
    if (parsed.invalidSupportedTokenCount > 0 || strongest.length === 0) {
      invalidMetadataCount += 1;
      continue;
    }
    const actual = await digestBytes(strongest[0]?.algorithm ?? "sha256", bytes);
    if (strongest.some((metadata) => equalBytes(metadata.digest, actual))) {
      verifiedResourceCount += 1;
    } else {
      mismatchedResourceCount += 1;
    }
  }

  const verifiableResourceCount = htmlAnalyses
    .flatMap((analysis) => analysis.resources)
    .filter((resource) => {
      if (!resource.integrity) return false;
      const parsed = parseIntegrityMetadata(resource.integrity);
      return parsed.metadata.length > 0 && parsed.invalidSupportedTokenCount === 0;
    }).length;
  const verificationFinding =
    bundle.resourceBytes.length === 0
      ? finding(
          "subresource-integrity",
          "not_evaluated",
          [],
          "No local resource bytes were supplied for digest verification."
        )
      : unmatchedResourceCount > 0 || invalidMetadataCount > 0 || mismatchedResourceCount > 0
        ? finding(
            "subresource-integrity",
            "invalid",
            [],
            "At least one supplied resource was unmatched, had invalid metadata, or failed digest verification.",
            `${String(verifiedResourceCount)} verified; ${String(mismatchedResourceCount)} mismatched; ${String(invalidMetadataCount)} invalid metadata; ${String(unmatchedResourceCount)} unmatched`
          )
        : verifiedResourceCount < verifiableResourceCount
          ? finding(
              "subresource-integrity",
              "inconclusive",
              [],
              "Every supplied resource matched, but bytes were not supplied for every resource with valid integrity metadata.",
              `${String(verifiedResourceCount)} verified of ${String(verifiableResourceCount)} verifiable resources`
            )
          : finding(
              "subresource-integrity",
              "observed",
              [],
              "Every resource with valid integrity metadata matched the supplied local bytes; browser fetching and CORS behaviour remain unverified.",
              `${String(verifiedResourceCount)} resources verified locally`
            );

  return resourceVerificationReportSchema.parse({
    schemaVersion: 1,
    suppliedResourceCount: bundle.resourceBytes.length,
    suppliedBytes,
    matchedResourceCount,
    verifiedResourceCount,
    mismatchedResourceCount,
    invalidMetadataCount,
    unmatchedResourceCount,
    finding: verificationFinding
  });
}

function nonceTokenValue(token: string): string | undefined {
  const parsed = parseCspNonceSource(token);
  if (parsed.state !== "valid" && parsed.state !== "short") return undefined;
  return token.slice(7, -1);
}

async function hashMatches(content: string, tokens: readonly string[]): Promise<boolean> {
  const parsed = tokens
    .filter((token) => /^'(?:sha256|sha384|sha512)-/iu.test(token))
    .flatMap((token) => parseCspHashSource(token).metadata);
  const byAlgorithm = new Map<IntegrityAlgorithm, Uint8Array>();
  for (const metadata of parsed) {
    let actual = byAlgorithm.get(metadata.algorithm);
    if (!actual) {
      actual = await digestBytes(metadata.algorithm, new TextEncoder().encode(content));
      byAlgorithm.set(metadata.algorithm, actual);
    }
    if (equalBytes(metadata.digest, actual)) return true;
  }
  return false;
}

function broadSourceCount(policy: CspPolicy, kinds: ReadonlySet<"script" | "style">): number {
  const broad = new Set([
    "'unsafe-inline'",
    "'unsafe-eval'",
    "'wasm-unsafe-eval'",
    "*",
    "data:",
    "http:",
    "https:"
  ]);
  return [...kinds].reduce(
    (total, kind) =>
      total +
      cspElementTokens(policy, kind).filter((token) => broad.has(token.toLowerCase())).length,
    0
  );
}

async function inspectCspMarkup(
  response: ResponseSnapshot,
  analysis: HtmlAnalysis,
  surfaceId: string,
  reusedNonces: ReadonlySet<string>
): Promise<CspMarkupReport> {
  const { enforced } = extractCspEvidence(response);
  const kinds = new Set(analysis.inlineElements.map((element) => element.kind));
  const broadSourceExpressionCount =
    enforced.state === "present"
      ? enforced.policies.reduce((total, policy) => total + broadSourceCount(policy, kinds), 0)
      : 0;
  let matchedNonceCount = 0;
  let matchedHashCount = 0;
  let matchedMixedCount = 0;
  let unmatchedInlineCount = 0;
  let crossDocumentNonceReuseCount = 0;

  if (enforced.state === "present") {
    for (const element of analysis.inlineElements) {
      const methods: ("nonce" | "hash")[] = [];
      let authorised = true;
      for (const policy of enforced.policies) {
        const tokens = cspElementTokens(policy, element.kind);
        const nonceMatch =
          element.nonce !== undefined &&
          tokens.some((token) => nonceTokenValue(token) === element.nonce);
        const hashMatch = await hashMatches(element.content, tokens);
        if (!nonceMatch && !hashMatch) {
          authorised = false;
          break;
        }
        methods.push(nonceMatch ? "nonce" : "hash");
      }
      if (!authorised) {
        unmatchedInlineCount += 1;
      } else if (methods.every((method) => method === "nonce")) {
        matchedNonceCount += 1;
      } else if (methods.every((method) => method === "hash")) {
        matchedHashCount += 1;
      } else {
        matchedMixedCount += 1;
      }
      if (element.nonce && reusedNonces.has(element.nonce)) {
        crossDocumentNonceReuseCount += 1;
      }
    }
  }

  const inlineElementCount = analysis.inlineElements.length;
  const correlationFinding =
    enforced.state === "invalid"
      ? finding("content-security-policy", "invalid", ["content-security-policy"], enforced.summary)
      : enforced.state === "missing"
        ? finding(
            "content-security-policy",
            inlineElementCount > 0 ? "missing" : "not_evaluated",
            ["content-security-policy"],
            inlineElementCount > 0
              ? "Inline script or style content was supplied without an enforced CSP for correlation."
              : "No enforced CSP or inline content was available for correlation."
          )
        : broadSourceExpressionCount > 0 ||
            unmatchedInlineCount > 0 ||
            crossDocumentNonceReuseCount > 0
          ? finding(
              "content-security-policy",
              "inconclusive",
              ["content-security-policy"],
              "CSP and markup correlation found unmatched inline content, broad source expressions, or nonce reuse across supplied documents.",
              `${String(matchedNonceCount + matchedHashCount + matchedMixedCount)} matched; ${String(unmatchedInlineCount)} unmatched; ${String(broadSourceExpressionCount)} broad expressions; ${String(crossDocumentNonceReuseCount)} cross-document nonce reuse`
            )
          : inlineElementCount === 0
            ? finding(
                "content-security-policy",
                "not_evaluated",
                ["content-security-policy"],
                "No inline script or style content required CSP source matching."
              )
            : finding(
                "content-security-policy",
                "observed",
                ["content-security-policy"],
                "Every supplied inline script and style element matched a nonce or hash source in every enforced policy; runtime enforcement remains unverified.",
                `${String(matchedNonceCount)} nonce; ${String(matchedHashCount)} hash; ${String(matchedMixedCount)} mixed`
              );

  return cspMarkupReportSchema.parse({
    schemaVersion: 1,
    surfaceId,
    inlineElementCount,
    matchedNonceCount,
    matchedHashCount,
    matchedMixedCount,
    unmatchedInlineCount,
    broadSourceExpressionCount,
    crossDocumentNonceReuseCount,
    finding: correlationFinding
  });
}

async function cspMarkupReports(
  bundle: ReturnType<typeof evidenceBundleInputSchema.parse>,
  htmlAnalyses: readonly HtmlAnalysis[]
): Promise<CspMarkupReport[]> {
  const nonceSurfaces = new Map<string, Set<string>>();
  for (const [index, document] of bundle.htmlDocuments.entries()) {
    if (!document.surfaceId) continue;
    for (const element of htmlAnalyses[index]?.inlineElements ?? []) {
      if (!element.nonce) continue;
      const surfaces = nonceSurfaces.get(element.nonce) ?? new Set<string>();
      surfaces.add(document.surfaceId);
      nonceSurfaces.set(element.nonce, surfaces);
    }
  }
  const reusedNonces = new Set(
    [...nonceSurfaces.entries()].filter(([, surfaces]) => surfaces.size > 1).map(([nonce]) => nonce)
  );
  const reports: CspMarkupReport[] = [];
  for (const [index, document] of bundle.htmlDocuments.entries()) {
    if (!document.surfaceId) continue;
    const responses = bundle.responses.filter(
      (response) => response.surfaceId === document.surfaceId
    );
    const analysis = htmlAnalyses[index];
    const [response] = responses;
    if (responses.length !== 1 || !response || !analysis) continue;
    reports.push(await inspectCspMarkup(response, analysis, document.surfaceId, reusedNonces));
  }
  return reports.sort((left, right) => left.surfaceId.localeCompare(right.surfaceId));
}

function inspectSurfaceCoverage(
  bundle: ReturnType<typeof evidenceBundleInputSchema.parse>
): SurfaceCoverage[] {
  const observed = new Map<string, Set<SurfaceCoverage["observedEvidence"][number]>>();
  const add = (
    surfaceId: string | undefined,
    kind: SurfaceCoverage["observedEvidence"][number]
  ): void => {
    if (!surfaceId) return;
    const kinds = observed.get(surfaceId) ?? new Set();
    kinds.add(kind);
    observed.set(surfaceId, kinds);
  };
  for (const item of bundle.responses) add(item.surfaceId, "response");
  for (const item of bundle.htmlDocuments) add(item.surfaceId, "html");
  for (const item of bundle.resourceBytes) add(item.surfaceId, "resource_bytes");
  for (const item of bundle.requests) add(item.surfaceId, "request");
  for (const item of bundle.webauthn) add(item.surfaceId, "webauthn");

  return bundle.surfaces.map((surface) => {
    const observedEvidence = [...(observed.get(surface.id) ?? new Set())].sort();
    const missingEvidence = surface.requiredEvidence
      .filter((kind) => !observedEvidence.includes(kind))
      .sort();
    return {
      surfaceId: surface.id,
      role: surface.role,
      state: missingEvidence.length === 0 ? "complete" : "gap",
      requiredEvidence: [...surface.requiredEvidence].sort(),
      observedEvidence,
      missingEvidence
    };
  });
}

function surfaceCoverageComposite(coverage: readonly SurfaceCoverage[]): CompositeAssessment {
  const requirements = ["Every declared surface includes each required evidence kind"];
  if (coverage.length === 0) {
    return {
      id: "expected-surface-coverage",
      name: "Expected surface coverage",
      state: "not_evaluated",
      summary: "No expected-surface manifest was supplied.",
      requirements
    };
  }
  const gaps = coverage.filter((surface) => surface.state === "gap").length;
  return gaps === 0
    ? {
        id: "expected-surface-coverage",
        name: "Expected surface coverage",
        state: "satisfied",
        summary:
          "Every declared surface includes its required evidence kinds; undeclared application surfaces remain outside this result.",
        requirements
      }
    : {
        id: "expected-surface-coverage",
        name: "Expected surface coverage",
        state: "gap",
        summary: `${String(gaps)} of ${String(coverage.length)} declared surfaces are missing required evidence.`,
        requirements
      };
}

function requestHeaders(snapshotInput: unknown): {
  snapshot: HeaderSnapshot;
  headers: Map<string, string[]>;
} {
  const snapshot = headerSnapshotSchema.parse(snapshotInput);
  const headers = new Map<string, string[]>();
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

function requestSingleton(
  headers: Map<string, string[]>,
  name: string
): { state: "missing" } | { state: "invalid" } | { state: "present"; value: string } {
  const values = headers.get(name);
  if (!values) return { state: "missing" };
  if (values.length !== 1) return { state: "invalid" };
  return { state: "present", value: (values[0] ?? "").trim().toLowerCase() };
}

export function inspectFetchMetadata(input: unknown): FetchMetadataReport {
  const { snapshot, headers } = requestHeaders(input);
  const site = requestSingleton(headers, "sec-fetch-site");
  const mode = requestSingleton(headers, "sec-fetch-mode");
  const destination = requestSingleton(headers, "sec-fetch-dest");
  const user = requestSingleton(headers, "sec-fetch-user");
  const recognisedHeaderCount = FETCH_HEADER_NAMES.filter((name) => headers.has(name)).length;
  const required = [site, mode, destination];
  const invalid =
    required.some((item) => item.state === "invalid") ||
    user.state === "invalid" ||
    (site.state === "present" &&
      !["cross-site", "same-origin", "same-site", "none"].includes(site.value)) ||
    (mode.state === "present" &&
      !["cors", "navigate", "no-cors", "same-origin", "websocket"].includes(mode.value)) ||
    (destination.state === "present" && !/^[a-z][a-z0-9-]{0,63}$/u.test(destination.value)) ||
    (user.state === "present" && user.value !== "?1");
  const missing = required.some((item) => item.state === "missing");
  const metadataFinding = invalid
    ? finding(
        "fetch-metadata",
        "invalid",
        [...FETCH_HEADER_NAMES],
        "Fetch Metadata contains a duplicate or unrecognised required value."
      )
    : missing
      ? finding(
          "fetch-metadata",
          "missing",
          [...FETCH_HEADER_NAMES],
          "The supplied request does not contain the complete Sec-Fetch-Site, Sec-Fetch-Mode, and Sec-Fetch-Dest set."
        )
      : finding(
          "fetch-metadata",
          "observed",
          [...FETCH_HEADER_NAMES],
          "The supplied request contains a recognised core Fetch Metadata set; server-side enforcement was not evaluated.",
          `site ${site.state === "present" ? site.value : "missing"}; mode ${mode.state === "present" ? mode.value : "missing"}; destination ${destination.state === "present" ? destination.value : "missing"}; user ${user.state === "present" ? "present" : "absent"}`
        );

  return fetchMetadataReportSchema.parse({
    schemaVersion: 1,
    name: snapshot.name,
    inputHeaderCount: headers.size,
    recognisedHeaderCount,
    finding: metadataFinding
  });
}

export function inspectWebauthnConfiguration(input: unknown): WebauthnReport {
  const configuration = webauthnConfigurationSchema.parse(input);
  const platformFinding =
    configuration.authenticatorAttachment === "unspecified"
      ? finding(
          "webauthn-platform-authenticator",
          "not_evaluated",
          [],
          "Authenticator attachment is unspecified; a platform authenticator requirement cannot be established."
        )
      : configuration.authenticatorAttachment === "platform"
        ? finding(
            "webauthn-platform-authenticator",
            "observed",
            [],
            "The reduced configuration requests a platform authenticator; actual availability and ceremony outcomes were not tested."
          )
        : finding(
            "webauthn-platform-authenticator",
            "missing",
            [],
            "The reduced configuration requests a cross-platform authenticator rather than a platform authenticator."
          );
  const prfFinding =
    configuration.prfRequested === undefined
      ? finding(
          "webauthn-prf",
          "not_evaluated",
          [],
          "The reduced configuration does not state whether the PRF extension is requested."
        )
      : configuration.prfRequested
        ? finding(
            "webauthn-prf",
            "observed",
            [],
            "The reduced configuration requests the PRF extension; authenticator support and returned results were not tested."
          )
        : finding(
            "webauthn-prf",
            "missing",
            [],
            "The reduced configuration explicitly does not request the PRF extension."
          );
  const conditionalFinding =
    configuration.operation !== "get"
      ? finding(
          "webauthn-conditional-mediation",
          "not_evaluated",
          [],
          "Conditional mediation applies to credential retrieval rather than this creation configuration."
        )
      : configuration.mediation === "conditional"
        ? finding(
            "webauthn-conditional-mediation",
            "observed",
            [],
            "The reduced retrieval configuration requests conditional mediation; runtime availability and behaviour were not tested."
          )
        : configuration.mediation === "unspecified"
          ? finding(
              "webauthn-conditional-mediation",
              "not_evaluated",
              [],
              "The reduced retrieval configuration does not specify a mediation mode."
            )
          : finding(
              "webauthn-conditional-mediation",
              "missing",
              [],
              "The reduced retrieval configuration does not request conditional mediation."
            );

  return webauthnReportSchema.parse({
    schemaVersion: 1,
    name: configuration.name,
    operation: configuration.operation,
    configuration: {
      authenticatorAttachment: configuration.authenticatorAttachment,
      userVerification: configuration.userVerification,
      residentKey: configuration.residentKey,
      attestation: configuration.attestation,
      mediation: configuration.mediation,
      ...(configuration.prfRequested === undefined
        ? {}
        : { prfRequested: configuration.prfRequested })
    },
    findings: [platformFinding, prfFinding, conditionalFinding]
  });
}

function mergeFindings(controlId: string, inputs: AssuranceFinding[]): AssuranceFinding {
  const evaluated = inputs.filter((input) => input.state !== "not_evaluated");
  if (evaluated.length === 0) {
    return finding(
      controlId,
      "not_evaluated",
      [],
      "No supplied evidence type can establish this control."
    );
  }
  const states = new Set(evaluated.map((input) => input.state));
  const sourceHeaders = [...new Set(evaluated.flatMap((input) => input.sourceHeaders))].slice(0, 4);
  const reducedDetails = [
    ...new Set(evaluated.flatMap((input) => (input.evidence ? [input.evidence] : [])))
  ].sort();
  const retainedDetails = reducedDetails.slice(0, 4).map((detail) => detail.slice(0, 96));
  const counts = `${String(inputs.filter((input) => input.state === "observed").length)} observed; ${String(inputs.filter((input) => input.state === "missing").length)} missing; ${String(inputs.filter((input) => input.state === "report_only").length)} report only; ${String(inputs.filter((input) => input.state === "invalid").length)} invalid; ${String(inputs.filter((input) => input.state === "inconclusive").length)} inconclusive`;
  const evidence = [
    counts,
    ...(retainedDetails.length > 0 ? [`reduced detail ${retainedDetails.join(" | ")}`] : []),
    ...(reducedDetails.length > retainedDetails.length
      ? [
          `${String(reducedDetails.length - retainedDetails.length)} additional detail value(s) omitted`
        ]
      : [])
  ]
    .join("; ")
    .slice(0, 512);
  if (states.has("invalid")) {
    return finding(
      controlId,
      "invalid",
      sourceHeaders,
      "At least one supplied observation contains invalid evidence for this control.",
      evidence
    );
  }
  if (states.has("inconclusive") || states.size > 1) {
    return finding(
      controlId,
      "inconclusive",
      sourceHeaders,
      "Supplied observations do not support one consistent conclusion for this control.",
      evidence
    );
  }
  const [state] = states;
  if (state === "observed") {
    return finding(
      controlId,
      "observed",
      sourceHeaders,
      `Observed consistently across ${String(evaluated.length)} applicable evidence item${evaluated.length === 1 ? "" : "s"}.`,
      evidence
    );
  }
  if (state === "report_only") {
    return finding(
      controlId,
      "report_only",
      sourceHeaders,
      "The supplied evidence identifies this control only in report-only policy.",
      evidence
    );
  }
  return finding(
    controlId,
    "missing",
    sourceHeaders,
    `Not observed in ${String(evaluated.length)} applicable evidence item${evaluated.length === 1 ? "" : "s"}.`,
    evidence
  );
}

function notApplicableFinding(controlId: string): AssuranceFinding {
  return finding(controlId, "not_applicable", [], "No declared surface requires this control.");
}

function notApplicableComposite(id: (typeof EVIDENCE_COMPOSITE_IDS)[number]): CompositeAssessment {
  const templates: Readonly<
    Record<
      (typeof EVIDENCE_COMPOSITE_IDS)[number],
      Pick<CompositeAssessment, "name" | "requirements">
    >
  > = {
    "strict-csp-candidate": {
      name: "Strict CSP candidate",
      requirements: ["Enforced CSP", "Applicable nonce or hash source", "base-uri restriction"]
    },
    "cross-origin-isolation-candidate": {
      name: "Cross-origin isolation header candidate",
      requirements: [
        "COOP same-origin on every supplied response",
        "COEP require-corp or credentialless on every supplied response"
      ]
    },
    "cookie-attribute-coverage": {
      name: "Cookie attribute coverage",
      requirements: [
        "SameSite on every observed cookie",
        "HttpOnly on every observed cookie",
        "No invalid recognised secure-prefix declaration"
      ]
    }
  };
  return {
    id,
    name: templates[id].name,
    state: "not_applicable",
    summary: "No declared surface requires this composite.",
    requirements: templates[id].requirements
  };
}

function mergeCompositeAssessments(
  id: (typeof EVIDENCE_COMPOSITE_IDS)[number],
  inputs: readonly CompositeAssessment[]
): CompositeAssessment {
  if (inputs.length === 0) return notApplicableComposite(id);
  const template = inputs[0];
  if (!template) return notApplicableComposite(id);
  const states = new Set(inputs.map((input) => input.state));
  if (states.size === 1) {
    return {
      ...template,
      summary:
        template.state === "satisfied"
          ? `Satisfied across ${String(inputs.length)} required surface${inputs.length === 1 ? "" : "s"}.`
          : template.summary
    };
  }
  if (states.has("review") || states.has("not_evaluated")) {
    return {
      ...template,
      state: "review",
      summary: "Required surfaces do not support one consistent composite conclusion."
    };
  }
  return {
    ...template,
    state: "gap",
    summary: "At least one required surface does not satisfy this composite."
  };
}

function stateOf(findings: AssuranceFinding[], controlId: string): AssuranceFinding["state"] {
  return findings.find((item) => item.controlId === controlId)?.state ?? "not_evaluated";
}

function strictCspComposite(
  findings: AssuranceFinding[],
  markupReports: readonly CspMarkupReport[]
): CompositeAssessment {
  const csp = stateOf(findings, "content-security-policy");
  const nonce = stateOf(findings, "csp-nonces");
  const hash = stateOf(findings, "csp-hashes");
  const base = stateOf(findings, "csp-base-uri");
  const states = [csp, nonce, hash, base];
  const activeAuthorisation = nonce === "observed" || hash === "observed";
  const markupNeedsReview = markupReports.some((report) =>
    ["invalid", "inconclusive", "missing"].includes(report.finding.state)
  );
  if (states.every((state) => state === "not_evaluated")) {
    return {
      id: "strict-csp-candidate",
      name: "Strict CSP candidate",
      state: "not_evaluated",
      summary: "No applicable CSP evidence was supplied.",
      requirements: ["Enforced CSP", "Applicable nonce or hash source", "base-uri restriction"]
    };
  }
  if (csp === "observed" && activeAuthorisation && base === "observed" && !markupNeedsReview) {
    return {
      id: "strict-csp-candidate",
      name: "Strict CSP candidate",
      state: "satisfied",
      summary:
        markupReports.length > 0
          ? "The supplied evidence contains the minimum declarations and every correlated inline element matched; runtime enforcement remains unverified."
          : "The supplied evidence contains the minimum declarations for this project-authored strict CSP candidate; no paired markup was available for source matching.",
      requirements: ["Enforced CSP", "Applicable nonce or hash source", "base-uri restriction"]
    };
  }
  if (states.some((state) => ["invalid", "inconclusive", "report_only"].includes(state))) {
    return {
      id: "strict-csp-candidate",
      name: "Strict CSP candidate",
      state: "review",
      summary:
        "CSP evidence is partial, report-only, invalid, or inconsistent across supplied observations.",
      requirements: ["Enforced CSP", "Applicable nonce or hash source", "base-uri restriction"]
    };
  }
  return {
    id: "strict-csp-candidate",
    name: "Strict CSP candidate",
    state: "gap",
    summary: "At least one minimum declaration for the strict CSP candidate is not observed.",
    requirements: ["Enforced CSP", "Applicable nonce or hash source", "base-uri restriction"]
  };
}

function crossOriginComposite(responseReports: AssuranceReport[]): CompositeAssessment {
  const requirements = [
    "COOP same-origin on every supplied response",
    "COEP require-corp or credentialless on every supplied response"
  ];
  if (responseReports.length === 0) {
    return {
      id: "cross-origin-isolation-candidate",
      name: "Cross-origin isolation header candidate",
      state: "not_evaluated",
      summary: "No response-header evidence was supplied.",
      requirements
    };
  }
  const pairs = responseReports.map((report) => ({
    coop: report.findings.find((item) => item.controlId === "cross-origin-opener-policy"),
    coep: report.findings.find((item) => item.controlId === "cross-origin-embedder-policy")
  }));
  if (
    pairs.every(
      ({ coop, coep }) =>
        coop?.state === "observed" &&
        coop.evidence === "same-origin" &&
        coep?.state === "observed" &&
        (coep.evidence === "require-corp" || coep.evidence === "credentialless")
    )
  ) {
    return {
      id: "cross-origin-isolation-candidate",
      name: "Cross-origin isolation header candidate",
      state: "satisfied",
      summary:
        "Every supplied response declares the required header pair; subresource compatibility and runtime crossOriginIsolated state remain unverified.",
      requirements
    };
  }
  if (
    pairs.some(({ coop, coep }) =>
      [coop?.state, coep?.state].some((state) => state === "invalid" || state === "inconclusive")
    )
  ) {
    return {
      id: "cross-origin-isolation-candidate",
      name: "Cross-origin isolation header candidate",
      state: "review",
      summary:
        "At least one supplied response contains invalid or inconsistent isolation evidence.",
      requirements
    };
  }
  return {
    id: "cross-origin-isolation-candidate",
    name: "Cross-origin isolation header candidate",
    state: "gap",
    summary:
      "At least one supplied response lacks COOP same-origin or COEP require-corp/credentialless.",
    requirements
  };
}

function cookieComposite(responseReports: AssuranceReport[]): CompositeAssessment {
  const requirements = [
    "SameSite on every observed cookie",
    "HttpOnly on every observed cookie",
    "No invalid recognised secure-prefix declaration"
  ];
  const cookieReports = responseReports.filter((report) =>
    report.findings.some(
      (item) =>
        ["samesite-cookies", "httponly-cookies"].includes(item.controlId) &&
        item.state !== "not_evaluated"
    )
  );
  if (cookieReports.length === 0) {
    return {
      id: "cookie-attribute-coverage",
      name: "Cookie attribute coverage",
      state: "not_evaluated",
      summary: "No parseable Set-Cookie evidence was supplied.",
      requirements
    };
  }
  const relevant = cookieReports.flatMap((report) =>
    report.findings.filter((item) =>
      ["samesite-cookies", "httponly-cookies", "secure-cookie-prefixes"].includes(item.controlId)
    )
  );
  if (
    cookieReports.every(
      (report) =>
        report.findings.find((item) => item.controlId === "samesite-cookies")?.state ===
          "observed" &&
        report.findings.find((item) => item.controlId === "httponly-cookies")?.state ===
          "observed" &&
        report.findings.find((item) => item.controlId === "secure-cookie-prefixes")?.state !==
          "invalid"
    )
  ) {
    return {
      id: "cookie-attribute-coverage",
      name: "Cookie attribute coverage",
      state: "satisfied",
      summary:
        "Selected attributes are consistently present in the supplied cookie evidence; Secure transport, cookie purpose, and session design remain unverified.",
      requirements
    };
  }
  if (relevant.some((item) => item.state === "invalid" || item.state === "inconclusive")) {
    return {
      id: "cookie-attribute-coverage",
      name: "Cookie attribute coverage",
      state: "review",
      summary: "Cookie attribute evidence is invalid or varies within the supplied responses.",
      requirements
    };
  }
  return {
    id: "cookie-attribute-coverage",
    name: "Cookie attribute coverage",
    state: "gap",
    summary: "At least one selected cookie attribute is not observed.",
    requirements
  };
}

function evaluateComposite(
  id: (typeof EVIDENCE_COMPOSITE_IDS)[number],
  findings: AssuranceFinding[],
  responseReports: AssuranceReport[],
  markupReports: readonly CspMarkupReport[]
): CompositeAssessment {
  switch (id) {
    case "strict-csp-candidate":
      return strictCspComposite(findings, markupReports);
    case "cross-origin-isolation-candidate":
      return crossOriginComposite(responseReports);
    case "cookie-attribute-coverage":
      return cookieComposite(responseReports);
  }
}

export async function inspectEvidenceBundle(
  input: unknown,
  sourceContextInput: unknown
): Promise<EvidenceBundleReport> {
  const bundle = evidenceBundleInputSchema.parse(input);
  const sourceContext = evidenceSourceContextSchema.parse(sourceContextInput);
  const scopeInventory = bundle.scopeInventory
    ? await reduceScopeInventory(bundle.scopeInventory)
    : absentScopeInventory();
  const knownControls = new Set<string>(SECURITY_CONTROLS.map((control) => control.id));
  for (const surface of bundle.surfaces) {
    for (const controlId of surface.requiredControls) {
      if (!knownControls.has(controlId)) {
        throw new Error(`Unknown required control on surface ${surface.id}: ${controlId}`);
      }
    }
  }
  const totalHtmlBytes = bundle.htmlDocuments.reduce(
    (total, document) => total + byteLength(document.html),
    0
  );
  if (totalHtmlBytes > 512 * 1_024) {
    throw new Error("Evidence bundle HTML exceeds the 524288-byte total bound.");
  }

  const responseReports = bundle.responses.map((response) => inspectHeaders(response));
  const responseContexts = bundle.responses
    .map((response) => reduceResponseContext(response))
    .filter((context): context is ResponseContextReport => context !== undefined)
    .sort(
      (left, right) =>
        left.surfaceId.localeCompare(right.surfaceId) ||
        left.variantId.localeCompare(right.variantId) ||
        left.sequence - right.sequence
    );
  const htmlAnalyses = bundle.htmlDocuments.map((document) => analyzeHtmlDocument(document));
  const htmlReports = htmlAnalyses.map((analysis) => analysis.report);
  const resourceVerificationReport = await verifyResourceBytes(bundle, htmlAnalyses);
  const markupReports = await cspMarkupReports(bundle, htmlAnalyses);
  const surfaceCoverage = inspectSurfaceCoverage(bundle);
  const requestReports = bundle.requests.map((request) => inspectFetchMetadata(request));
  const webauthnReports = bundle.webauthn.map((configuration) =>
    inspectWebauthnConfiguration(configuration)
  );
  const resourceReportsBySurface = new Map<string, ResourceVerificationReport>();
  for (const surface of bundle.surfaces) {
    const htmlEntries = bundle.htmlDocuments
      .map((document, index) => ({ document, analysis: htmlAnalyses[index] }))
      .filter(
        (
          entry
        ): entry is {
          document: (typeof bundle.htmlDocuments)[number];
          analysis: HtmlAnalysis;
        } => entry.document.surfaceId === surface.id && entry.analysis !== undefined
      );
    resourceReportsBySurface.set(
      surface.id,
      await verifyResourceBytes(
        {
          ...bundle,
          surfaces: [surface],
          htmlDocuments: htmlEntries.map((entry) => entry.document),
          resourceBytes: bundle.resourceBytes.filter((item) => item.surfaceId === surface.id),
          responses: bundle.responses.filter((item) => item.surfaceId === surface.id),
          requests: bundle.requests.filter((item) => item.surfaceId === surface.id),
          webauthn: bundle.webauthn.filter((item) => item.surfaceId === surface.id)
        },
        htmlEntries.map((entry) => entry.analysis)
      )
    );
  }

  const surfaceAssessments: SurfaceAssessment[] = bundle.surfaces.map((surface) => {
    const scopedResponseReports = responseReports.filter(
      (_, index) => bundle.responses[index]?.surfaceId === surface.id
    );
    const scopedMarkupReports = markupReports.filter((report) => report.surfaceId === surface.id);
    const scopedResourceReport = resourceReportsBySurface.get(surface.id);
    const scopedEvidence = [
      ...scopedResponseReports.flatMap((report) => report.findings),
      ...htmlReports
        .filter((_, index) => bundle.htmlDocuments[index]?.surfaceId === surface.id)
        .map((report) => report.finding),
      ...(scopedResourceReport ? [scopedResourceReport.finding] : []),
      ...scopedMarkupReports.map((report) => report.finding),
      ...requestReports
        .filter((_, index) => bundle.requests[index]?.surfaceId === surface.id)
        .map((report) => report.finding),
      ...webauthnReports
        .filter((_, index) => bundle.webauthn[index]?.surfaceId === surface.id)
        .flatMap((report) => report.findings)
    ];
    const allSurfaceFindings = SECURITY_CONTROLS.map((control) =>
      mergeFindings(
        control.id,
        scopedEvidence.filter((item) => item.controlId === control.id)
      )
    );
    const findings = surface.requiredControls.map(
      (controlId) =>
        allSurfaceFindings.find((item) => item.controlId === controlId) ??
        notApplicableFinding(controlId)
    );
    const composites = surface.requiredComposites.map((id) =>
      evaluateComposite(id, allSurfaceFindings, scopedResponseReports, scopedMarkupReports)
    );
    return surfaceAssessmentSchema.parse({
      surfaceId: surface.id,
      role: surface.role,
      requiredControls: [...surface.requiredControls].sort(),
      requiredComposites: [...surface.requiredComposites].sort(),
      responseContexts: responseContexts.filter((context) => context.surfaceId === surface.id),
      findings,
      composites
    });
  });

  const findings = SECURITY_CONTROLS.map((control) => {
    const requiredFindings = surfaceAssessments.flatMap((surface) =>
      surface.findings.filter((item) => item.controlId === control.id)
    );
    const onlyFinding = requiredFindings.length === 1 ? requiredFindings[0] : undefined;
    return (
      onlyFinding ??
      (requiredFindings.length === 0
        ? notApplicableFinding(control.id)
        : mergeFindings(control.id, requiredFindings))
    );
  });
  const composites = [
    ...EVIDENCE_COMPOSITE_IDS.map((id) =>
      mergeCompositeAssessments(
        id,
        surfaceAssessments.flatMap((surface) =>
          surface.composites.filter((composite) => composite.id === id)
        )
      )
    ),
    surfaceCoverageComposite(surfaceCoverage)
  ];
  const reportWithoutFingerprint = {
    schemaVersion: 7 as const,
    name: bundle.name,
    identity: bundle.identity,
    scopeInventory,
    provenance: {
      analyserVersion: EVIDENCE_ANALYSER_VERSION,
      catalogueVersion: CATALOGUE_VERSION,
      ...sourceContext
    },
    coverage: {
      responses: responseReports.length,
      contextualisedResponses: responseContexts.length,
      responseVariants: new Set(
        responseContexts.map((context) => `${context.surfaceId}\u0000${context.variantId}`)
      ).size,
      redirectResponses: responseContexts.filter((context) => context.outcome === "redirect")
        .length,
      errorResponses: responseContexts.filter(
        (context) => context.outcome === "http_error" || context.outcome === "transport_error"
      ).length,
      authenticatedResponses: responseContexts.filter(
        (context) => context.authentication === "authenticated"
      ).length,
      htmlDocuments: htmlReports.length,
      resourceBytes: bundle.resourceBytes.length,
      requests: requestReports.length,
      webauthn: webauthnReports.length,
      expectedSurfaces: surfaceCoverage.length,
      completeSurfaces: surfaceCoverage.filter((surface) => surface.state === "complete").length,
      surfaceGaps: surfaceCoverage.filter((surface) => surface.state === "gap").length
    },
    surfaceCoverage,
    surfaceAssessments,
    summary: {
      observed: findings.filter((result) => result.state === "observed").length,
      missing: findings.filter((result) => result.state === "missing").length,
      invalid: findings.filter((result) => result.state === "invalid").length,
      notEvaluated: findings.filter((result) => result.state === "not_evaluated").length,
      notApplicable: findings.filter((result) => result.state === "not_applicable").length,
      reportOnly: findings.filter((result) => result.state === "report_only").length,
      inconclusive: findings.filter((result) => result.state === "inconclusive").length
    },
    findings,
    composites,
    responseContexts,
    responseReports,
    htmlReports,
    resourceVerificationReport,
    cspMarkupReports: markupReports,
    requestReports,
    webauthnReports
  };
  const reportFingerprint = await fingerprintEvidenceReportBody(reportWithoutFingerprint);
  return evidenceBundleReportSchema.parse({ ...reportWithoutFingerprint, reportFingerprint });
}
