import { SECURITY_CONTROLS } from "./catalogue";

export const WPT_EVIDENCE_REVIEW = {
  schemaVersion: 1,
  repository: "web-platform-tests/wpt",
  revision: "af38980d2fcd74af19a226f5f651051cc15940ed",
  reviewedOn: "2026-07-23",
  licence: "BSD-3-Clause"
} as const;

export const WPT_DIRECTIVE_REVIEW = {
  revision: "cc74d2669f5de548e808779877d1d33339ec5115",
  reviewedOn: "2026-10-11"
} as const;

export type WptSourceReview = { revision: string; reviewedOn: string };

export type WptSuite = {
  path: string;
  label: string;
  tests?: readonly string[];
};

export type WptEvidenceMapping = {
  controlId: string;
  state: "mapped" | "not_mapped";
  suites: readonly WptSuite[];
  scope: string;
  limitation: string;
  review?: WptSourceReview;
};

const MAPPINGS = [
  {
    controlId: "content-security-policy",
    state: "mapped",
    suites: [{ path: "content-security-policy", label: "Content Security Policy" }],
    scope: "Policy parsing and enforcement behaviour across the CSP test suite.",
    limitation:
      "Suite coverage does not establish that an application's policy is complete, effective, or deployed on every response."
  },
  {
    controlId: "csp-nonces",
    state: "mapped",
    suites: [{ path: "content-security-policy/script-src", label: "CSP script-src" }],
    scope: "Nonce source parsing and script authorisation behaviour.",
    limitation:
      "The mapping covers browser behaviour, not nonce unpredictability, per-response generation, reuse, or disclosure."
  },
  {
    controlId: "csp-hashes",
    state: "mapped",
    suites: [
      { path: "content-security-policy/script-src", label: "CSP script-src" },
      { path: "content-security-policy/style-src", label: "CSP style-src" }
    ],
    scope: "Hash source parsing and authorisation for inline script and style content.",
    limitation:
      "The mapping does not establish that deployed hashes match every intended resource or remain current."
  },
  {
    controlId: "strict-dynamic",
    state: "mapped",
    suites: [{ path: "content-security-policy/script-src", label: "CSP script-src" }],
    scope: "strict-dynamic parsing, trust propagation, and fallback interactions.",
    limitation:
      "Passing behaviour does not establish that an application's trusted loaders are safe."
  },
  {
    controlId: "csp-base-uri",
    state: "mapped",
    suites: [{ path: "content-security-policy/base-uri", label: "CSP base-uri" }],
    scope: "Base URL authorisation and blocking behaviour.",
    limitation:
      "The suite does not establish that an application prevents every unsafe absolute URL."
  },
  {
    controlId: "csp-frame-ancestors",
    state: "mapped",
    suites: [{ path: "content-security-policy/frame-ancestors", label: "CSP frame-ancestors" }],
    scope: "Embedding authorisation across same-origin, cross-origin, nested, and sandboxed cases.",
    limitation:
      "The mapping does not establish that the deployed allowlist matches an application's intended embedding relationships."
  },
  {
    controlId: "csp-form-action",
    state: "mapped",
    suites: [{ path: "content-security-policy/form-action", label: "CSP form-action" }],
    scope: "Form destination authorisation, redirects, and target behaviour.",
    limitation:
      "The suite does not evaluate scripted requests, server authorisation, or whether every legitimate destination was inventoried."
  },
  {
    controlId: "csp-upgrade-insecure-requests",
    state: "mapped",
    suites: [{ path: "upgrade-insecure-requests", label: "Upgrade Insecure Requests" }],
    scope: "Eligible request rewriting and mixed-content interactions.",
    limitation: "The mapping does not prove that every upgraded endpoint supports correct HTTPS."
  },
  {
    controlId: "csp-sandbox",
    state: "mapped",
    suites: [{ path: "content-security-policy/sandbox", label: "CSP sandbox" }],
    scope: "Sandbox token behaviour across frames, workers, redirects, and navigations.",
    limitation:
      "The suite cannot determine whether an application's selected sandbox tokens grant excessive capability."
  },
  {
    controlId: "trusted-types",
    state: "mapped",
    suites: [{ path: "trusted-types", label: "Trusted Types" }],
    scope: "Trusted Types APIs, policy behaviour, CSP enforcement, and protected DOM sinks.",
    limitation:
      "The mapping does not establish complete sink coverage or the safety of application-authored policies."
  },
  {
    controlId: "subresource-integrity",
    state: "mapped",
    suites: [{ path: "subresource-integrity", label: "Subresource Integrity" }],
    scope: "Integrity metadata parsing, digest matching, fetching, and CSP interactions.",
    limitation:
      "The suite does not establish that a deployment supplies current integrity metadata for every eligible resource."
  },
  {
    controlId: "integrity-policy",
    state: "mapped",
    suites: [
      {
        path: "subresource-integrity/integrity-policy",
        label: "Subresource Integrity Policy"
      }
    ],
    scope:
      "Integrity-Policy parsing, blocking, report-only behaviour, destinations, sources, and reporting integration.",
    limitation:
      "The suite does not establish that every production resource carries current metadata or that reports are operationally reviewed."
  },
  {
    controlId: "cross-origin-opener-policy",
    state: "mapped",
    suites: [{ path: "html/cross-origin-opener-policy", label: "Cross-Origin-Opener-Policy" }],
    scope: "Browsing-context isolation, opener relationships, reporting, and navigation behaviour.",
    limitation:
      "The mapping does not establish compatibility with an application's popup and cross-window integrations."
  },
  {
    controlId: "cross-origin-embedder-policy",
    state: "mapped",
    suites: [{ path: "html/cross-origin-embedder-policy", label: "Cross-Origin-Embedder-Policy" }],
    scope: "Cross-origin resource opt-in and embedder-policy enforcement.",
    limitation: "The suite does not establish that all production dependencies opt in correctly."
  },
  {
    controlId: "cross-origin-resource-policy",
    state: "mapped",
    suites: [{ path: "fetch/cross-origin-resource-policy", label: "Cross-Origin-Resource-Policy" }],
    scope: "Resource-policy enforcement across fetch and embedding contexts.",
    limitation:
      "The mapping does not determine the correct resource-sharing policy for an application."
  },
  {
    controlId: "coep-credentialless",
    state: "mapped",
    suites: [
      {
        path: "html/cross-origin-embedder-policy/credentialless",
        label: "COEP credentialless"
      }
    ],
    scope: "Credential omission and embedding behaviour under credentialless COEP.",
    limitation:
      "The suite does not establish that credential omission is suitable for every embedded resource."
  },
  {
    controlId: "origin-agent-cluster",
    state: "mapped",
    suites: [
      {
        path: "html/browsers/origin/origin-keyed-agent-clusters",
        label: "Origin-keyed agent clusters"
      }
    ],
    scope: "Origin-keyed agent-cluster opt-in and browsing behaviour.",
    limitation:
      "Agent clustering is not a guarantee of process isolation or an application authorisation boundary."
  },
  {
    controlId: "fetch-metadata",
    state: "mapped",
    suites: [{ path: "fetch/metadata", label: "Fetch Metadata" }],
    scope: "Sec-Fetch request-context header generation across request modes and destinations.",
    limitation: "The mapping does not test an application's server-side resource-isolation policy."
  },
  {
    controlId: "permissions-policy",
    state: "mapped",
    suites: [{ path: "permissions-policy", label: "Permissions Policy" }],
    scope: "Policy parsing, inheritance, delegation, and feature-specific enforcement.",
    limitation:
      "The suite does not establish that an application selected the correct capabilities or frame allowlists."
  },
  {
    controlId: "strict-transport-security",
    state: "not_mapped",
    suites: [],
    scope: "No exact suite mapping was retained at the reviewed revision.",
    limitation:
      "Nearby HTTPS and navigation tests are not substituted for HSTS state, expiry, subdomain, or first-visit behaviour."
  },
  {
    controlId: "x-content-type-options",
    state: "mapped",
    suites: [{ path: "fetch/nosniff", label: "Fetch nosniff" }],
    scope: "nosniff enforcement for relevant script, style, and fetch responses.",
    limitation:
      "The suite does not establish that a deployment sends correct Content-Type values for every response."
  },
  {
    controlId: "clear-site-data",
    state: "mapped",
    suites: [{ path: "clear-site-data", label: "Clear-Site-Data" }],
    scope: "Directive parsing and browser-held data clearing behaviour.",
    limitation:
      "The mapping does not establish correct logout sequencing, server-side revocation, or coverage of every storage mechanism."
  },
  {
    controlId: "referrer-policy",
    state: "mapped",
    suites: [{ path: "referrer-policy", label: "Referrer Policy" }],
    scope: "Policy parsing and referrer delivery across navigation and resource contexts.",
    limitation:
      "The suite does not establish that sensitive data is absent from URLs or other telemetry."
  },
  {
    controlId: "samesite-cookies",
    state: "mapped",
    suites: [{ path: "cookies/samesite", label: "SameSite cookies" }],
    scope: "SameSite parsing and cookie delivery across same-site and cross-site contexts.",
    limitation:
      "The mapping does not establish that session cookies use an appropriate value or replace CSRF protection."
  },
  {
    controlId: "partitioned-cookies",
    state: "mapped",
    suites: [{ path: "cookies/partitioned-cookies", label: "Partitioned cookies" }],
    scope: "Partition-key behaviour, redirects, subresources, and SameSite interactions.",
    limitation:
      "The mapping does not establish that a deployment needs partitioned state or declares all required attributes."
  },
  {
    controlId: "httponly-cookies",
    state: "not_mapped",
    suites: [],
    scope: "No exact suite mapping was retained at the reviewed revision.",
    limitation:
      "General cookie tests are not substituted for the intended claim that script access is prevented by HttpOnly."
  },
  {
    controlId: "secure-cookie-prefixes",
    state: "mapped",
    suites: [{ path: "cookies/prefix", label: "Cookie prefixes" }],
    scope: "__Secure-, __Host-, __Http-, and __Host-Http- prefix constraint behaviour.",
    limitation:
      "Prefix enforcement does not establish sound session design or protection from every cookie-confusion attack."
  },
  {
    controlId: "webauthn-platform-authenticator",
    state: "mapped",
    suites: [{ path: "webauthn", label: "Web Authentication" }],
    scope: "WebAuthn API and authenticator-availability behaviour within the WebAuthn suite.",
    limitation:
      "The suite does not establish relying-party verification, recovery safety, or authenticator policy."
  },
  {
    controlId: "webauthn-prf",
    state: "mapped",
    suites: [{ path: "webauthn", label: "Web Authentication" }],
    scope: "PRF extension parsing and credential operation behaviour within the WebAuthn suite.",
    limitation:
      "The mapping does not establish authenticator support in a user's environment or a safe key-recovery design."
  },
  {
    controlId: "webauthn-conditional-mediation",
    state: "mapped",
    suites: [{ path: "webauthn", label: "Web Authentication" }],
    scope:
      "Conditional mediation and related PublicKeyCredential behaviour within the WebAuthn suite.",
    limitation: "The suite does not establish a secure account, autofill, or recovery experience."
  }
] as const satisfies readonly WptEvidenceMapping[];

const DIRECTIVE_MAPPINGS = [
  {
    controlId: "permissions-policy-camera",
    state: "mapped",
    review: WPT_DIRECTIVE_REVIEW,
    suites: [
      {
        path: "permissions-policy",
        label: "Camera policy reporting",
        tests: [
          "permissions-policy/reporting/camera-potential-report-only.https.html",
          "permissions-policy/reporting/camera-potential-reporting.https.html",
          "permissions-policy/reporting/camera-report-only.https.html",
          "permissions-policy/reporting/camera-reporting.https.html"
        ]
      }
    ],
    scope:
      "Camera policy violation and potential-violation reports in enforced and report-only modes.",
    limitation:
      "These files also depend on reporting support and media-test automation. Their outcomes do not isolate basic camera blocking or cover every frame allowlist and device."
  },
  {
    controlId: "permissions-policy-microphone",
    state: "mapped",
    review: WPT_DIRECTIVE_REVIEW,
    suites: [
      {
        path: "permissions-policy",
        label: "Microphone policy reporting",
        tests: [
          "permissions-policy/reporting/microphone-report-only.https.html",
          "permissions-policy/reporting/microphone-reporting.https.html"
        ]
      }
    ],
    scope:
      "Microphone policy violation reports when audio access is blocked or allowed in report-only mode.",
    limitation:
      "These files also depend on reporting support and media-test automation. Their outcomes do not isolate basic microphone blocking or cover every frame allowlist and device."
  },
  {
    controlId: "permissions-policy-geolocation",
    state: "mapped",
    review: WPT_DIRECTIVE_REVIEW,
    suites: [
      {
        path: "permissions-policy",
        label: "Geolocation policy reporting",
        tests: [
          "permissions-policy/reporting/geolocation-report-only.https.html",
          "permissions-policy/reporting/geolocation-reporting.https.html"
        ]
      }
    ],
    scope: "Geolocation policy violation reports in enforced and report-only modes.",
    limitation:
      "Reporting support, location availability and user permission can affect these outcomes. They do not isolate basic geolocation blocking or cover every frame allowlist."
  },
  {
    controlId: "clear-site-data-cache",
    state: "mapped",
    review: WPT_DIRECTIVE_REVIEW,
    suites: [
      {
        path: "clear-site-data",
        label: "Cache clearing",
        tests: [
          "clear-site-data/clear-cache-bfcache-partitioning.tentative.https.html",
          "clear-site-data/clear-cache-bfcache.https.html",
          "clear-site-data/clear-cache-partitioning.tentative.https.html",
          "clear-site-data/clear-cache.https.html"
        ]
      }
    ],
    scope: "Cache eviction, subsequent fetches, partitioning and back/forward cache behaviour.",
    limitation:
      "The selected files include wildcard-clearing cases and tentative partitioning tests. File totals do not isolate every cache directive subtest or prove that application logout removes all cached data."
  },
  {
    controlId: "clear-site-data-cookies",
    state: "mapped",
    review: WPT_DIRECTIVE_REVIEW,
    suites: [
      {
        path: "clear-site-data",
        label: "Cookie clearing and response header order",
        tests: [
          "clear-site-data/set-cookie-after-clear-cookies.https.html",
          "clear-site-data/set-cookie-before-clear-cookies.https.html"
        ]
      }
    ],
    scope:
      "Cookie visibility when Set-Cookie appears before or after a cookies-clearing header in the same response.",
    limitation:
      "These two files cover response header ordering. They do not establish complete cookie-domain or partition coverage, server-side session revocation, or correct logout sequencing."
  },
  {
    controlId: "clear-site-data-storage",
    state: "mapped",
    review: WPT_DIRECTIVE_REVIEW,
    suites: [
      {
        path: "clear-site-data",
        label: "Storage clearing and service-worker control",
        tests: ["clear-site-data/storage.https.html"]
      }
    ],
    scope:
      "Clearing supported storage backends and removing service-worker control from an existing client.",
    limitation:
      "The file includes setup checks and selects backends available in that browser. Its totals do not prove coverage of every storage mechanism, partition or application data flow."
  }
] as const satisfies readonly WptEvidenceMapping[];

const mappingByControl = new Map<string, WptEvidenceMapping>(
  [...MAPPINGS, ...DIRECTIVE_MAPPINGS].map((mapping) => [mapping.controlId, mapping])
);

export const WPT_EVIDENCE = SECURITY_CONTROLS.map((control) => {
  const mapping = mappingByControl.get(control.id);
  if (!mapping) throw new Error(`Missing WPT evidence mapping for ${control.id}`);
  return mapping;
});

export function getWptEvidence(controlId: string): WptEvidenceMapping {
  const mapping = mappingByControl.get(controlId);
  if (!mapping) throw new Error(`Unknown WPT evidence control: ${controlId}`);
  return mapping;
}

export function getWptSourceReview(mapping: WptEvidenceMapping): WptSourceReview {
  return mapping.review ?? WPT_EVIDENCE_REVIEW;
}

export function wptSourceUrl(
  path: string,
  revision: string = WPT_EVIDENCE_REVIEW.revision,
  kind: "tree" | "blob" = "tree"
): string {
  return `https://github.com/web-platform-tests/wpt/${kind}/${revision}/${path}`;
}

export function wptResultsUrl(path: string): string {
  return `https://wpt.fyi/results/${path}?label=master&label=experimental&aligned`;
}
