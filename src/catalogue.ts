export const CATALOGUE_VERSION = "2.1.0";

export type ControlMappingState = "active" | "unsupported";
export type CombinationRule = "all" | "any";

export type SecurityControl = {
  id: string;
  name: string;
  shortName: string;
  category:
    | "Content execution"
    | "Cross-origin isolation"
    | "Transport and response hardening"
    | "Browser privacy"
    | "Authentication";
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
    id: "csp-base-uri",
    name: "CSP base-uri restriction",
    shortName: "CSP base-uri",
    category: "Content execution",
    summary: "Restricts which URLs a document may use as its base URL.",
    threatClasses: ["Base-tag injection", "Relative URL target manipulation"],
    doesNotAddress: [
      "Absolute malicious URLs",
      "Unsafe permitted base URLs",
      "Server-side routing"
    ],
    prerequisites: ["A CSP delivered for the protected document"],
    fallback: "Use absolute security-sensitive URLs and prevent untrusted base elements.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Content-Security-Policy.base-uri"],
    specificationUrls: ["https://w3c.github.io/webappsec-csp/#directive-base-uri"]
  },
  {
    id: "csp-frame-ancestors",
    name: "CSP frame-ancestors restriction",
    shortName: "frame-ancestors",
    category: "Content execution",
    summary: "Restricts which parent documents may embed a page in a frame.",
    threatClasses: ["Clickjacking", "Unapproved cross-origin embedding"],
    doesNotAddress: ["Same-origin UI redressing", "Pop-up windows", "Application authorisation"],
    prerequisites: ["An explicit inventory of permitted embedding origins"],
    fallback:
      "Retain application-level anti-framing design and legacy X-Frame-Options where needed.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Content-Security-Policy.frame-ancestors"],
    specificationUrls: ["https://w3c.github.io/webappsec-csp/#directive-frame-ancestors"]
  },
  {
    id: "csp-form-action",
    name: "CSP form-action restriction",
    shortName: "form-action",
    category: "Content execution",
    summary: "Restricts the destinations to which a document may submit forms.",
    threatClasses: ["Injected form exfiltration", "Unexpected cross-origin form submission"],
    doesNotAddress: [
      "Scripted fetch requests",
      "Permitted malicious endpoints",
      "Server authorisation"
    ],
    prerequisites: ["A complete inventory of legitimate form destinations"],
    fallback: "Validate destinations and sensitive operations on the server.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Content-Security-Policy.form-action"],
    specificationUrls: ["https://w3c.github.io/webappsec-csp/#directive-form-action"]
  },
  {
    id: "csp-upgrade-insecure-requests",
    name: "CSP upgrade-insecure-requests",
    shortName: "Upgrade insecure requests",
    category: "Content execution",
    summary: "Asks the browser to rewrite eligible insecure resource requests to HTTPS.",
    threatClasses: ["Mixed-content downgrade", "Accidental insecure subresource requests"],
    doesNotAddress: [
      "Unavailable HTTPS resources",
      "Insecure external redirects",
      "Transport setup"
    ],
    prerequisites: ["HTTPS availability for every upgraded resource"],
    fallback: "Migrate every resource URL to HTTPS and block mixed content explicitly.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Content-Security-Policy.upgrade-insecure-requests"],
    specificationUrls: ["https://w3c.github.io/webappsec-upgrade-insecure-requests/"]
  },
  {
    id: "csp-sandbox",
    name: "CSP sandbox",
    shortName: "CSP sandbox",
    category: "Content execution",
    summary: "Applies a configurable sandbox to a protected resource.",
    threatClasses: ["Over-privileged embedded documents", "Untrusted active content"],
    doesNotAddress: [
      "Every browser exploit",
      "Unsafe granted sandbox tokens",
      "Server authorisation"
    ],
    prerequisites: ["A tested list of required sandbox capabilities"],
    fallback: "Isolate untrusted content on a separate origin and minimise active capabilities.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Content-Security-Policy.sandbox"],
    specificationUrls: ["https://w3c.github.io/webappsec-csp/#directive-sandbox"]
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
    id: "coep-credentialless",
    name: "Credentialless cross-origin embedding",
    shortName: "COEP credentialless",
    category: "Cross-origin isolation",
    summary:
      "Allows selected cross-origin no-CORS resources to load without credentials under COEP.",
    threatClasses: [
      "Credential-bearing cross-origin resource inclusion",
      "Isolation deployment gaps"
    ],
    doesNotAddress: ["Public resource disclosure", "Application authorisation", "CORS correctness"],
    prerequisites: ["COEP deployment", "A resource inventory that tolerates credential omission"],
    fallback: "Use require-corp with explicit CORS or CORP opt-in from embedded resources.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Cross-Origin-Embedder-Policy.credentialless"],
    specificationUrls: ["https://html.spec.whatwg.org/multipage/browsers.html#coep"]
  },
  {
    id: "origin-agent-cluster",
    name: "Origin-Agent-Cluster",
    shortName: "Origin-Agent-Cluster",
    category: "Cross-origin isolation",
    summary: "Requests origin-keyed browser agent clustering for a document.",
    threatClasses: ["Unnecessary same-site process sharing", "Origin isolation ambiguity"],
    doesNotAddress: ["Complete process isolation", "Application authorisation", "Browser defects"],
    prerequisites: ["Consistent delivery across an origin"],
    fallback:
      "Use separate origins for security boundaries and avoid relying on process placement.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Origin-Agent-Cluster"],
    specificationUrls: [
      "https://html.spec.whatwg.org/multipage/origin.html#origin-keyed-agent-clusters"
    ]
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
    id: "strict-transport-security",
    name: "HTTP Strict Transport Security",
    shortName: "HSTS",
    category: "Transport and response hardening",
    summary: "Tells supporting browsers to use HTTPS for a host during a declared period.",
    threatClasses: ["HTTP downgrade", "Accidental insecure navigation"],
    doesNotAddress: [
      "First-visit downgrade before policy is known",
      "TLS defects",
      "Certificate compromise"
    ],
    prerequisites: ["Reliable HTTPS", "A carefully chosen host and subdomain policy"],
    fallback:
      "Redirect HTTP to HTTPS and remove insecure links while assessing preload separately.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Strict-Transport-Security"],
    specificationUrls: ["https://www.rfc-editor.org/rfc/rfc6797"]
  },
  {
    id: "x-content-type-options",
    name: "X-Content-Type-Options nosniff",
    shortName: "nosniff",
    category: "Transport and response hardening",
    summary: "Prevents selected responses from being interpreted as a different MIME type.",
    threatClasses: ["MIME confusion", "Unexpected script or style interpretation"],
    doesNotAddress: [
      "Incorrect declared MIME types",
      "Content injection",
      "Every navigation response"
    ],
    prerequisites: ["Correct Content-Type headers"],
    fallback:
      "Serve accurate media types and avoid hosting active content in untrusted upload locations.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.X-Content-Type-Options"],
    specificationUrls: ["https://fetch.spec.whatwg.org/#x-content-type-options-header"]
  },
  {
    id: "clear-site-data",
    name: "Clear-Site-Data",
    shortName: "Clear-Site-Data",
    category: "Transport and response hardening",
    summary: "Requests removal of selected browser-held data for an origin.",
    threatClasses: ["Residual session data", "Persistent state after account or device reset"],
    doesNotAddress: ["Server-side data", "Every browser cache", "Data outside the origin scope"],
    prerequisites: ["A deliberate logout or reset flow", "Secure-context delivery"],
    fallback:
      "Expire application credentials and storage explicitly in addition to server-side revocation.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Clear-Site-Data"],
    specificationUrls: ["https://w3c.github.io/webappsec-clear-site-data/"]
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
    id: "httponly-cookies",
    name: "HttpOnly cookies",
    shortName: "HttpOnly",
    category: "Browser privacy",
    summary: "Prevents browser scripts from reading a cookie through ordinary cookie APIs.",
    threatClasses: ["Session-cookie theft through script access"],
    doesNotAddress: [
      "Authenticated actions performed by injected script",
      "Network theft",
      "Server compromise"
    ],
    prerequisites: ["Cookies that do not require client-side script access"],
    fallback:
      "Minimise credential lifetime and prevent script injection regardless of cookie visibility.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["http.headers.Set-Cookie.HttpOnly"],
    specificationUrls: ["https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html"]
  },
  {
    id: "secure-cookie-prefixes",
    name: "Secure cookie prefixes",
    shortName: "Cookie prefixes",
    category: "Browser privacy",
    summary:
      "Applies browser-enforced naming constraints to __Secure-, __Host-, __Http-, and __Host-Http- cookies.",
    threatClasses: ["Cookie scope confusion", "Insecure cookie replacement"],
    doesNotAddress: ["All cookie tossing", "Cross-site scripting", "Weak session design"],
    prerequisites: ["HTTPS", "Correct Secure, Path, and Domain attributes"],
    fallback: "Use host-only Secure cookies with narrow scope and server-side session controls.",
    mappingState: "active",
    combination: "all",
    bcdPaths: [
      "http.headers.Set-Cookie.host_secure_prefixes",
      "http.headers.Set-Cookie.http_host-http_prefixes"
    ],
    specificationUrls: ["https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html"]
  },
  {
    id: "webauthn-platform-authenticator",
    name: "WebAuthn platform authenticator detection",
    shortName: "Platform WebAuthn",
    category: "Authentication",
    summary: "Detects whether a user-verifying platform authenticator is available.",
    threatClasses: ["Phishing-prone password dependence", "Credential reuse"],
    doesNotAddress: [
      "Account recovery weaknesses",
      "Server verification defects",
      "Authenticator policy"
    ],
    prerequisites: ["A complete WebAuthn registration and authentication flow"],
    fallback:
      "Offer standards-based roaming authenticators and a carefully protected recovery path.",
    mappingState: "active",
    combination: "all",
    bcdPaths: ["api.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable_static"],
    specificationUrls: [
      "https://w3c.github.io/webauthn/#sctn-isUserVerifyingPlatformAuthenticatorAvailable"
    ]
  },
  {
    id: "webauthn-prf",
    name: "WebAuthn PRF extension",
    shortName: "WebAuthn PRF",
    category: "Authentication",
    summary: "Derives scoped pseudorandom outputs from a compatible WebAuthn credential.",
    threatClasses: ["Exportable application key material", "Password-derived local secrets"],
    doesNotAddress: ["Account recovery", "Relying-party verification", "Every authenticator"],
    prerequisites: ["A compatible authenticator", "A reviewed WebAuthn extension design"],
    fallback:
      "Keep key derivation and recovery independent of the extension where it is unavailable.",
    mappingState: "active",
    combination: "all",
    bcdPaths: [
      "api.CredentialsContainer.create.publicKey_option.extensions.prf",
      "api.CredentialsContainer.get.publicKey_option.extensions.prf"
    ],
    specificationUrls: ["https://w3c.github.io/webauthn/#prf-extension"]
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
