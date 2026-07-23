# Threat model

## Assets

- Integrity of the selected BCD subset
- Accuracy of catalogue-to-path mappings
- Determinism of profile calculations
- Privacy of visitor-selected browser profiles
- Integrity of the static public build
- Trustworthiness of source attribution

## Adversarial inputs

The project treats these as hostile:

- BCD path names and nested objects;
- source strings, notes, descriptions, and URLs;
- project-authored WPT suite paths and external evidence links;
- browser version strings;
- committed selected snapshots and change events;
- localStorage values;
- exported profile names;
- pasted response-header blocks and local header snapshot files;
- local evidence bundles, supplied HTML and resource bytes, request snapshots,
  and reduced WebAuthn configurations;
- dependency packages and build output.

## Source risks

### Schema drift

A selected path can move, disappear, or change type. Generation fails when a
configured path is missing or lacks a compatibility statement. A structural
fingerprint makes reviewed shape changes visible.

### Oversized or complex data

Paths, releases, statements, flags, notes, strings, events, public files, and
exports are bounded. The generator projects a small subset rather than copying
the full source package.

### Semantic simplification

Flags, notes, partial support, prefixes, alternative names, removals, and
unknowns remain explicit. Unsupported mappings do not inherit a nearby
feature's result.

WPT suite presence and current dashboard results do not become a conformance
score or application-assurance result. Source links are pinned to one reviewed
revision, paths are bounded, and unmapped controls do not inherit nearby tests.

## Client risks

### Injection

Static Astro templates escape source-derived content. The interactive planner
creates nodes and assigns `textContent`. It does not use source data with
`innerHTML`. CSV cells are quoted and formula-prefixed values are neutralized.

### Storage tampering

Stored profiles are untrusted JSON. They are byte-bounded, schema-validated,
versioned, and refused on a future schema. Invalid values are not executed or
silently migrated.

### Privacy leakage

The planner does not inspect the actual browser or make a network request. It
uses local persistence only after a deliberate action. The static CSP denies
runtime connections.

The header inspector refuses request credentials, caps input size and
duplicates, and never emits raw values, cookie names, or cookie values. Input
exists in page or process memory only for the local calculation. Users are
still told to redact secrets before inspection.

The evidence bundle parses HTML without a browser DOM, script execution, or
resource loading. It caps input bytes, parse errors, nodes, resources, decoded
resource bytes, and observation counts. CSP and SRI matching uses local
cryptographic operations and releases raw content after reduction. Reports
retain no resource locations, raw HTML, resource bytes, inline content, nonce
values, or digest values. Request evidence refuses credentials, while the
strict WebAuthn schema refuses challenges and relying-party, user, and
credential identifiers.

Evidence identity fields are bounded opaque claims for application,
environment, revision, build, producer, and capture time. They must not contain
URLs, personal data, credentials, or free-form build logs. Identity is included
inside the reduced-report fingerprint, so later edits are detectable. The
fingerprint is not a signature and does not prove which workflow, repository, or
person produced the report.

An expected-surface manifest can itself be incomplete or misleading. The tool
therefore describes coverage only for declared opaque surfaces and never calls
the manifest a discovered route inventory. Per-surface control and composite
requirements must be explicit; semantic roles do not silently add policy.
Comparison refuses invalid or future report schemas, fails closed across
incompatible analyser, catalogue, application, or environment identities, and
does not infer a resolution from absent, `not_evaluated`, `not_applicable`, or
incomparable evidence.

Evidence-policy profiles are supplied separately from evidence reports. This
prevents a report producer from weakening a gate by omitting requirements from
the bundle. Model, application, environment, optional revision, producer,
build-presence, capture-duration, and age mismatches fail. Future-dated evidence
also fails. Exceptions are bounded, specific, and expiring; active exceptions
produce review rather than pass, while expired exceptions remain visible.
Identity and freshness cannot be exempted through surface exceptions.

## Build and workflow risks

- The lockfile fixes dependency resolution.
- Lifecycle scripts are explicitly reviewed in `allowScripts`.
- CI has read-only content permission.
- Pages deployment has only required Pages and identity permissions.
- Actions are pinned to full commit SHAs.
- No workflow commits, pushes, creates issues, or uses `pull_request_target`.
- The scheduled source review is read-only and cannot modify repository or
  deployment state.

## Out of scope

- Browser implementation testing
- Active website collection or runtime testing
- Conformance certification
- Compliance advice
- Market-share analysis
- Private browser policy ingestion
- Live WPT execution or wpt.fyi result ingestion
