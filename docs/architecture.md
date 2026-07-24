# Architecture

## System boundary

ControlCurrent is a static security-compatibility application. Its locked source
dependencies are `@mdn/browser-compat-data` for browser-specific support
statements and `web-features` for exact feature associations and Baseline
adoptability context. A separate project-authored registry maps controls to
exact Web Platform Tests suite paths at a pinned reviewed revision.

```text
package-lock.json
      |
      +--> @mdn/browser-compat-data
      |
      +--> web-features
      |
      v
fixed selected-path importer
      |
      +--> schema validation
      +--> explicit bounds
      +--> schema fingerprint
      |
      v
data/selected-bcd.json
      |
      +--> control catalogue
      |          |
      |          v
      |   profile evaluation
      |
      +--> previous selected subset
                 |
                 v
          immutable change events
                 |
                 v
           static Astro build

pinned WPT revision
      |
      v
exact suite-path registry
      |
      +--> pinned source links
      +--> current wpt.fyi links
      +--> per-control evidence limits
      |
      v
static Astro build
```

The browser receives only static HTML, CSS, JavaScript, and the selected data
bundled by the build. There is no runtime source request.

## Source selection

The catalogue owns every requested BCD path. The generator:

1. loads the exact packages selected by the lockfile;
2. validates package versions and the BCD timestamp;
3. resolves each path through own properties only;
4. requires a `__compat` statement;
5. retains nine explicit desktop and mobile browser families;
6. associates only WebDX features that explicitly declare the selected BCD path;
7. validates bounded source fields;
8. retains bounded release metadata for explicit version choices;
9. emits canonical JSON and a structural schema fingerprint.

Prototype-related segments and excessive path depth are refused.

## Catalogue

The versioned catalogue separates project-authored security guidance from BCD
facts. A control contains:

- stable identity and category;
- threat classes and explicit non-claims;
- prerequisites and fallback;
- mapping state;
- exact BCD paths;
- `all` or `any` combination rule;
- specification links.

Unsupported mappings remain first-class catalogue entries. They do not produce a
guessed support result.

## Evaluation

Feature evaluation preserves:

- multiple support statements;
- exact, imprecise, unknown, false, and removed support versions;
- last-supported versions;
- partial implementation;
- flags;
- prefix and alternative name;
- bounded notes.

Control evaluation combines path outcomes according to the catalogue. Profile
evaluation applies the same calculation independently to each selected browser
minimum. Baseline status is displayed as secondary adoptability evidence and
does not alter a browser-specific compatibility outcome.

## Client boundary

The profile planner imports the selected data and pure evaluator into a bundled
client module. It creates result DOM nodes with `textContent`; it does not
insert source data through `innerHTML`.

The planner does not use:

- `navigator.userAgent`;
- browser feature detection;
- network fetches;
- server storage;
- market share.

Local persistence is opt-in and limited to one schema-versioned key.
Profile and exported-evaluation imports are byte-bounded and schema-validated
locally. Semantic comparison requires identical BCD and catalogue versions,
keeps added or removed browser scope distinct from gained or lost support, and
does not treat a baseline-only change as a compatibility change.

The reverse planner searches only deployable releases retained in the selected
BCD snapshot. It never invents an exact minimum from an imprecise source
boundary and reports unsupported mappings or source inconsistencies as
blockers.

Engineering reports are deterministic Markdown generated in the browser. They
contain the selected profile, source versions, aggregate outcomes, and bounded
comparison counts; they are not uploaded or retained by the site.

## Offline assurance boundary

The response-header inspector accepts at most 64 KiB and 256 lines. It rejects
folded headers, request credentials, invalid names, excessive duplicate values,
and future contract versions. Recognised policy parsers emit one bounded
finding per catalogue control.

The inspector:

- makes no URL or network request;
- stores no input;
- renders findings with `textContent`;
- omits raw header values, cookie names, and cookie values from reports;
- distinguishes observed, not observed, invalid, report-only, inconclusive, and
  not evaluated states;
- evaluates CSP source expressions only through applicable directive fallback
  chains and does not merge multiple enforced policies optimistically;
- evaluates only the final response block when a redirect-style paste contains
  more than one HTTP status line.

Controls that require HTML, DOM, request, WebAuthn, or runtime evidence remain
`not_evaluated`.

## Evidence-bundle boundary

The evidence-bundle path combines up to 16 response snapshots, 16 HTML
documents, 32 bounded local resource bodies, 32 request snapshots, and 16
reduced WebAuthn configurations. Its dependency direction is:

```text
bounded local inputs
      |
      +--> bounded application, environment, revision, producer,
      |    and capture-window identity
      +--> response-header assurance
      +--> bounded response variant, status, redirect, cache,
      |    authentication, content, and error context
      +--> parse5 HTML tree without execution or fetch
      +--> in-memory CSP and SRI digest correlation
      +--> selected Sec-Fetch-* request reduction
      +--> strict reduced WebAuthn configuration
      +--> expected-surface coverage
      |
      v
explicit per-surface applicability and redacted reports
      |
      v
control-level consistency merge
      |
      v
project-authored composite candidates
      |
      v
subject-identified, provenance-stamped, fingerprinted reduced report
      |
      +--> compatible, detail-aware comparison
      |
      +--> independent evidence-policy evaluation
      |
      +--> canonical in-toto evidence statement
                    |
                    v
             external DSSE signing
                    |
                    v
       CLI-only Sigstore verification
                    |
                    v
       attestation-aware policy evaluation
```

The HTML parser retains only counts, recognised integrity algorithms, parse
error counts, and relative/absolute/other reference counts. CSP correlation
retains only result counts. Optional resource bodies are decoded under a 256
KiB per-resource and 1 MiB total bound, hashed in memory, and discarded. The
report never serialises resource locations, content, nonces, or digests.
Request inspection refuses credential fields and emits only selected Fetch
Metadata values. WebAuthn input accepts no challenge, relying-party identifier,
user identifier, or credential identifier.

Contextual response snapshots retain no URL or redirect location. Opaque
variant and chain IDs make repeated status, authentication, cache and redirect
observations comparable without binding the public report to private route
locations. Legacy schema 1 header snapshots remain accepted and are explicitly
counted as responses without context.

Composite candidates are deterministic derived guidance. They do not change
BCD compatibility outcomes and do not claim browser execution, remote resource
identity, server-side enforcement, ceremony success, or complete route
coverage.

The optional scope inventory and required surface manifest are assertions
supplied by an external producer, not route discovery performed by
ControlCurrent. Up to 256 opaque inventory entries are reduced to kind,
completeness, generation time, counts, and a semantic fingerprint. Included
entry IDs must match assessed surface IDs exactly. This makes excluded or
unknown scope reviewable while preserving opaque identifiers and discarding
entry-level data from the report. Report comparison consumes only validated
reduced reports, requires the same semantic inventory fingerprint, and cannot
recover original inventory or evidence.

The evidence identity is also an operator or CI assertion. It prevents reports
for different named applications or environments from being compared as one
deployment, and it lets independent policy bound revision, producer, capture
duration, and age. A SHA-256 report fingerprint protects retained content
integrity; it does not authenticate the producer by itself.

The optional attestation path places that fingerprint and the retained
deployment identity and reduced scope inventory in one bounded in-toto
Statement v1. ControlCurrent does not sign it. The CLI verifies an externally
produced Sigstore DSSE bundle against the exact certificate issuer and URI
identity selected by schema 4 evidence policy, then compares the verified
subject and predicate with the supplied report. It requires
certificate-transparency and transparency-log evidence.

Sigstore verification is excluded from the browser build. The CLI reads the
reviewed `trusted_root.json` target directly from the lockfile-pinned
`@sigstore/tuf` package, verifies its project-pinned SHA-256 digest, converts it
with `@sigstore/protobuf-specs`, and never starts the TUF client. The reduced
result retains no bundle, certificate, transparency entry, or dependency error
message. A verified result authenticates the signed statement and configured
signer identity; it does not authenticate how the underlying evidence was
collected or prove that the producer was uncompromised.

## Conformance evidence boundary

`src/wpt-evidence.ts` covers every catalogue control exactly once. Mapped
controls identify bounded exact suite paths. Unmapped controls carry an
explicit reason and never inherit a nearby suite.

Pinned repository links make the mapping review reproducible. Current wpt.fyi
links are navigational only: no result data, pass rate, test log, or browser
binary enters the build. The registry does not affect compatibility or offline
assurance outcomes.

## Change history

The first generated selected subset creates a baseline event. Later package or
catalogue updates compare the previous complete subset with the new subset and
append deterministic events. Event identifiers are content-derived. A build
does not invent history for BCD versions that were never retained.

`data/source-history.json` separately records every reviewed package pair and
selected structural fingerprint. It is append-only and bounded. Its timestamp
is the BCD package timestamp, not a claim about the exact time a reviewer or
browser changed state.

## Deployment

Astro produces directory-form static routes. The Pages workflow runs
automatically only after CI succeeds for a push to `main`, checks out the exact
commit SHA verified by that CI run, and retains a manual dispatch path. The site
uses a repository base path in GitHub Actions and root paths in local
development. Dependency installation and verification run without Pages write
or OIDC credentials. A separate dependency-free job receives only the
permissions required to deploy the reviewed artifact.

The deployed meta policy blocks scripts, styles, frames, workers, forms, media,
and connections outside the explicit static requirements. Because
`frame-ancestors` is enforceable only as an HTTP response header and GitHub
Pages does not expose project-controlled headers, a client-side guard refuses
framed interaction. The guard is not a substitute for origin isolation; use a
dedicated reviewed origin before processing organisation-specific evidence.

A weekly read-only source review compares the locked BCD and Web Platform
Features packages with npm registry metadata. It fails visibly when a newer
version needs review, but cannot edit packages or data, open issues, commit,
push, or deploy. The manual dry run has the same no-write boundary.
