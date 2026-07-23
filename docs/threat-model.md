# Threat model

## Assets

- Integrity of the selected BCD subset
- Accuracy of catalogue-to-path mappings
- Determinism of profile calculations
- Privacy of visitor-selected browser profiles
- Integrity of the static public build
- Trustworthiness of source attribution
- Integrity and signer-policy binding of optional evidence attestations

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
  reduced WebAuthn configurations, and opaque scope inventories;
- reduced evidence reports, Sigstore bundles, and evidence-attestation policy
  identities;
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

Scope inventory entries use the same opaque identifier grammar as assessed
surfaces. They cannot contain URLs or free-form descriptions. At most 256
entries are accepted; included IDs must match assessed surfaces exactly,
excluded entries require one enumerated reason, and contradictory completeness
claims are refused. Inventory generation cannot follow capture start. Reduction
sorts semantic entries before hashing and retains no entry IDs or exclusion
reasons in the report.

### Attestation confusion and trust substitution

The optional verifier accepts at most 512 KiB, requires a DSSE envelope with
the in-toto payload type, caps the decoded statement at 48 KiB, and validates
one exact statement and predicate schema. It verifies the bundle before
interpreting its statement. The statement subject digest, deployment predicate,
and reduced scope inventory must match the independently validated reduced
report.

The expected certificate issuer and URI identity come from the evidence policy,
not the bundle. URI identity is escaped and anchored before verification.
Attestation, inventory, identity, and freshness findings cannot receive a
surface exception. The reduced result omits certificates, complete bundles,
transparency entries, and upstream diagnostic messages.

The verifier uses Sigstore's packaged TUF seed with live refresh disabled in a
new temporary cache. This avoids an unreviewed runtime trust-root request and
makes the locked dependency version part of the trust decision. It also means a
trust-root update requires a dependency review.

A valid attestation proves that the configured identity signed the matching
statement under the accepted Sigstore trust material. It does not prove that
the signer should be trusted, that its identity provider or workflow was
uncompromised, that evidence collection was complete, or that the signed claims
were truthful.

An opaque scope inventory and expected-surface manifest can themselves be
incomplete or misleading. The tool therefore describes coverage only for
supplied inventory entries and declared opaque surfaces and never calls either
one independently verified route discovery. Policy can require the inventory,
restrict its asserted source kind, require a complete claim, pin its exact
semantic fingerprint, enforce freshness, and limit excluded entries. These
checks make omission visible but cannot prove the inventory source was
exhaustive.

Per-surface control and composite requirements must be explicit; semantic roles
do not silently add policy. Comparison refuses invalid or future report
schemas, fails closed across incompatible analyser, catalogue, application,
environment, or scope-inventory identities, and does not infer a resolution
from absent, `not_evaluated`, `not_applicable`, or incomparable evidence.

Evidence-policy profiles are supplied separately from evidence reports. This
prevents a report producer from weakening a gate by omitting requirements from
the bundle. Model, application, environment, optional revision, producer,
build-presence, inventory presence, inventory fingerprint, inventory
completeness, exclusion count, inventory age, capture-duration, and evidence age
mismatches fail. Future-dated evidence or inventory also fails. Exceptions are
bounded, specific, and expiring; active exceptions produce review rather than
pass, while expired exceptions remain visible. Attestation, inventory, identity,
and freshness cannot be exempted through surface exceptions.

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
- Evidence signing, OIDC token acquisition, or transparency-log publication
- Trust decisions for unreviewed certificate identities
- Route or state discovery by ControlCurrent
