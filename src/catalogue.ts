export const CATALOGUE_VERSION = "1.0.0";

export type ControlMappingState = "active" | "unsupported";
export type CombinationRule = "all" | "any";

export type SecurityControl = {
  id: string;
  name: string;
  shortName: string;
  category: "Content execution" | "Cross-origin isolation" | "Browser privacy" | "Authentication";
  summary: string;
  threatClasses: readonly string[];
  doesNotAddress: readonly string[];
  prerequisites: readonly string[];
  fallback: string;
  mappingState: ControlMappingState;
  mappingNote?: string;
  combination: CombinationRule;
  bcdPaths: readonly string[];
  specificationUrls: readonly string[];
};

export const SECURITY_CONTROLS = [
  {
    id: "content-security-policy",
    name: "Content Security Policy",
    shortName: "CSP",
    category: "Content execution",
    summary: "Restricts the browser resources and execution paths that a document may use.",
    threatClasses: ["Content injection", "Cross-site scripting", "Untrusted embedding"],
    doesNotAddress: [
      "Unsafe application logic already permitted by the policy",
      "Server-side injection",
      "Complete prevention of browser implementation defects"
    ],
    prerequisites: ["A policy designed and tested for the application"],
    fallback:
      "Keep output encoding, input handling, dependency review, and other application controls in place.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Content-Security-Policy"],
    specificationUrls: ["https://w3c.github.io/webappsec-csp/"]
  },
  {
    id: "csp-nonces",
    name: "CSP nonce sources",
    shortName: "CSP nonces",
    category: "Content execution",
    summary:
      "Authorises selected inline scripts with unpredictable, response-specific nonce values.",
    threatClasses: ["Injected inline script execution"],
    doesNotAddress: [
      "Nonce disclosure or reuse",
      "Unsafe trusted scripts",
      "DOM injection that reaches an allowed sink"
    ],
    prerequisites: ["Per-response nonce generation", "A CSP script source policy"],
    fallback:
      "Use a carefully scoped CSP and avoid inline script where a nonce deployment cannot be validated.",
    mappingState: "unsupported",
    mappingNote:
      "BCD 8.0.7 does not publish a standalone compatibility statement for CSP nonce source expressions.",
    combination: "all",
    bcdPaths: [],
    specificationUrls: ["https://w3c.github.io/webappsec-csp/#grammardef-nonce-source"]
  },
  {
    id: "csp-hashes",
    name: "CSP hash sources",
    shortName: "CSP hashes",
    category: "Content execution",
    summary:
      "Authorises exact inline script or style content through cryptographic source expressions.",
    threatClasses: ["Injected inline script execution", "Injected inline style execution"],
    doesNotAddress: [
      "Modified content without a matching policy update",
      "Unsafe external scripts",
      "Permitted code that creates dangerous sinks"
    ],
    prerequisites: ["Stable inline content", "A CSP source policy with matching digests"],
    fallback:
      "Use nonces or external resources under a restrictive CSP when hash maintenance is unsuitable.",
    mappingState: "unsupported",
    mappingNote:
      "BCD 8.0.7 does not publish a standalone compatibility statement for CSP hash source expressions.",
    combination: "all",
    bcdPaths: [],
    specificationUrls: ["https://w3c.github.io/webappsec-csp/#grammardef-hash-source"]
  },
  {
    id: "strict-dynamic",
    name: "CSP strict-dynamic",
    shortName: "strict-dynamic",
    category: "Content execution",
    summary:
      "Allows trust from a nonce- or hash-authorised script to propagate to scripts it loads.",
    threatClasses: ["Brittle host allowlists", "Script injection through allowed origins"],
    doesNotAddress: [
      "Compromise of an authorised script",
      "Unsafe script loaders",
      "Browsers that ignore the source expression"
    ],
    prerequisites: ["CSP nonces or hashes", "A tested fallback source list"],
    fallback:
      "Retain compatible host and scheme sources for browsers that do not implement strict-dynamic.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Content-Security-Policy.strict-dynamic"],
    specificationUrls: ["https://w3c.github.io/webappsec-csp/#strict-dynamic-usage"]
  },
  {
    id: "trusted-types",
    name: "Trusted Types enforcement",
    shortName: "Trusted Types",
    category: "Content execution",
    summary: "Restricts selected DOM injection sinks to values created through approved policies.",
    threatClasses: ["DOM cross-site scripting", "Unsafe DOM sink use"],
    doesNotAddress: [
      "All injection sinks",
      "Unsafe policy implementations",
      "Server-side cross-site scripting"
    ],
    prerequisites: ["Trusted Types policy design", "CSP enforcement directive", "Sink migration"],
    fallback: "Continue sink review, output encoding, and nonce- or hash-based CSP deployment.",
    mappingState: "active",
    combination: "all",
    bcdPaths: [
      "api.trustedTypes",
      "http.headers.Content-Security-Policy.require-trusted-types-for"
    ],
    specificationUrls: ["https://w3c.github.io/trusted-types/dist/spec/"]
  },
  {
    id: "subresource-integrity",
    name: "Subresource Integrity",
    shortName: "SRI",
    category: "Content execution",
    summary: "Lets a document require external scripts and stylesheets to match expected digests.",
    threatClasses: ["Unexpected third-party resource modification", "CDN content substitution"],
    doesNotAddress: [
      "Resources intentionally updated without matching metadata",
      "Dynamic resources that cannot use stable digests",
      "Compromise of the page that supplies integrity metadata"
    ],
    prerequisites: ["Stable resource bytes", "Correct CORS behaviour where required"],
    fallback:
      "Self-host critical resources or apply other supply-chain and CSP controls when stable integrity metadata is impractical.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["html.elements.script.integrity", "html.elements.link.integrity"],
    specificationUrls: ["https://w3c.github.io/webappsec-subresource-integrity/"]
  },
  {
    id: "cross-origin-opener-policy",
    name: "Cross-Origin-Opener-Policy",
    shortName: "COOP",
    category: "Cross-origin isolation",
    summary:
      "Controls whether a document shares a browsing context group with cross-origin documents.",
    threatClasses: ["Cross-window reference attacks", "Cross-origin process isolation gaps"],
    doesNotAddress: [
      "All cross-origin data exposure",
      "Application authorisation",
      "Isolation without companion resource policies"
    ],
    prerequisites: ["Popup and integration compatibility review"],
    fallback: "Use defensive opener handling and explicit cross-origin communication checks.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Cross-Origin-Opener-Policy"],
    specificationUrls: [
      "https://html.spec.whatwg.org/multipage/origin.html#cross-origin-opener-policies"
    ]
  },
  {
    id: "cross-origin-embedder-policy",
    name: "Cross-Origin-Embedder-Policy",
    shortName: "COEP",
    category: "Cross-origin isolation",
    summary: "Requires embedded cross-origin resources to opt in through CORS or resource policy.",
    threatClasses: ["Uncontrolled cross-origin embedding", "Cross-origin isolation gaps"],
    doesNotAddress: [
      "Application authorisation",
      "All data leakage",
      "Resources that are already same-origin"
    ],
    prerequisites: ["Compatible embedded resources", "Usually COOP for cross-origin isolation"],
    fallback:
      "Keep sensitive operations independent of cross-origin isolation and review embedded resource origins.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Cross-Origin-Embedder-Policy"],
    specificationUrls: ["https://html.spec.whatwg.org/multipage/browsers.html#coep"]
  },
  {
    id: "cross-origin-resource-policy",
    name: "Cross-Origin-Resource-Policy",
    shortName: "CORP",
    category: "Cross-origin isolation",
    summary: "Lets a resource state which origins or sites may embed it without CORS.",
    threatClasses: [
      "Cross-origin resource inclusion",
      "Selected speculative side-channel exposure"
    ],
    doesNotAddress: [
      "Authorised CORS reads",
      "Application authorisation",
      "Resources served without the header"
    ],
    prerequisites: ["An accurate resource-sharing model"],
    fallback: "Use authentication, CORS, and response minimization appropriate to each resource.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Cross-Origin-Resource-Policy"],
    specificationUrls: ["https://fetch.spec.whatwg.org/#cross-origin-resource-policy-header"]
  },
  {
    id: "fetch-metadata",
    name: "Fetch Metadata request headers",
    shortName: "Fetch Metadata",
    category: "Cross-origin isolation",
    summary: "Supplies request context that servers can use in a resource-isolation policy.",
    threatClasses: ["Cross-site request forgery", "Cross-site resource abuse"],
    doesNotAddress: [
      "Requests from clients that do not send the headers",
      "Authorisation flaws",
      "Incorrect server-side policy decisions"
    ],
    prerequisites: ["A server-side policy with explicit fallback behaviour"],
    fallback:
      "Retain CSRF tokens, SameSite cookies, origin checks, and ordinary authorisation controls.",
    mappingState: "active",
    combination: "all",
    bcdPaths: [
      "http.headers.Sec-Fetch-Dest",
      "http.headers.Sec-Fetch-Mode",
      "http.headers.Sec-Fetch-Site",
      "http.headers.Sec-Fetch-User"
    ],
    specificationUrls: ["https://w3c.github.io/webappsec-fetch-metadata/"]
  },
  {
    id: "permissions-policy",
    name: "Permissions Policy",
    shortName: "Permissions Policy",
    category: "Browser privacy",
    summary:
      "Controls whether a document and its embedded frames may use selected browser capabilities.",
    threatClasses: ["Unexpected capability use", "Over-privileged embedded content"],
    doesNotAddress: [
      "User-granted permissions outside the policy",
      "Application authorisation",
      "Capabilities not covered by a directive"
    ],
    prerequisites: ["An inventory of required browser capabilities and frames"],
    fallback: "Avoid requesting unnecessary capabilities and isolate untrusted embedded content.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Permissions-Policy"],
    specificationUrls: ["https://w3c.github.io/webappsec-permissions-policy/"]
  },
  {
    id: "referrer-policy",
    name: "Referrer Policy",
    shortName: "Referrer Policy",
    category: "Browser privacy",
    summary: "Limits referrer information sent with navigations and subresource requests.",
    threatClasses: ["URL data disclosure", "Cross-origin navigation metadata leakage"],
    doesNotAddress: [
      "Data placed in destination URLs",
      "Other browser telemetry",
      "Server logs for the requested resource"
    ],
    prerequisites: ["A policy compatible with application routing and integrations"],
    fallback:
      "Keep sensitive values out of URLs and avoid relying on referrer data for authorisation.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Referrer-Policy"],
    specificationUrls: ["https://w3c.github.io/webappsec-referrer-policy/"]
  },
  {
    id: "samesite-cookies",
    name: "SameSite cookies",
    shortName: "SameSite",
    category: "Browser privacy",
    summary: "Restricts when cookies are attached to cross-site requests.",
    threatClasses: ["Cross-site request forgery", "Unnecessary cross-site cookie exposure"],
    doesNotAddress: [
      "Same-site request forgery",
      "Cross-site scripting",
      "Authentication and authorisation design"
    ],
    prerequisites: ["Explicit cookie classification", "Secure transport for SameSite=None"],
    fallback:
      "Use CSRF tokens, origin validation, Secure cookies, and ordinary authorisation checks.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Set-Cookie.SameSite"],
    specificationUrls: ["https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html"]
  },
  {
    id: "partitioned-cookies",
    name: "Partitioned cookies",
    shortName: "CHIPS",
    category: "Browser privacy",
    summary: "Stores selected cross-site cookies in a partition keyed by the top-level site.",
    threatClasses: ["Cross-site tracking", "Unpartitioned third-party state sharing"],
    doesNotAddress: ["All browser fingerprinting", "First-party tracking", "Authorisation flaws"],
    prerequisites: ["Secure cookies", "A design that tolerates partitioned state"],
    fallback:
      "Minimise third-party state and avoid relying on cross-site cookies when partitioning is unavailable.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Set-Cookie.Partitioned"],
    specificationUrls: [
      "https://datatracker.ietf.org/doc/html/draft-cutler-httpbis-partitioned-cookies"
    ]
  },
  {
    id: "webauthn-conditional-mediation",
    name: "WebAuthn conditional mediation",
    shortName: "Conditional WebAuthn",
    category: "Authentication",
    summary:
      "Allows passkey suggestions to participate in a credential input flow without an immediate modal prompt.",
    threatClasses: ["Phishing-prone password dependence", "Credential reuse"],
    doesNotAddress: [
      "Account recovery weaknesses",
      "Server-side authentication flaws",
      "Every phishing and social-engineering path"
    ],
    prerequisites: [
      "A complete WebAuthn flow",
      "Secure account recovery",
      "User-verification policy"
    ],
    fallback: "Offer an explicit WebAuthn action and a carefully protected recovery path.",
    mappingState: "active",
    mappingNote:
      "The BCD path represents the feature-detection method for conditional mediation availability.",
    combination: "all",
    bcdPaths: ["api.PublicKeyCredential.isConditionalMediationAvailable_static"],
    specificationUrls: ["https://w3c.github.io/webauthn/#enum-credentialmediationrequirement"]
  }
] as const satisfies readonly SecurityControl[];

export function getControl(controlId: string): SecurityControl | undefined {
  return SECURITY_CONTROLS.find((control) => control.id === controlId);
}
