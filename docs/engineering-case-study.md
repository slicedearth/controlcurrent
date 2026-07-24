# Engineering case study

## Problem

General compatibility tables can answer whether a web feature exists, but
security deployment decisions need stronger semantics:

- one control can depend on several features;
- support can be partial, flagged, prefixed, renamed, removed, or uncertain;
- browser availability does not establish secure configuration;
- a source-data correction is not necessarily a browser-code change.

ControlCurrent turns those distinctions into data contracts and visible product
behaviour.

## Source contraction

The full BCD and Web Platform Features packages are broad and change frequently.
The importer narrows them to 36 exact paths selected by a 30-control catalogue.
This creates a reviewable surface:

- every path has a product reason;
- missing paths fail generation;
- field shape is fingerprinted;
- only nine browser families and bounded release metadata are retained;
- exact WebDX associations are retained without copying the full feature corpus;
- the selected output is about 172 KB rather than either full source package.

## Honest unsupported states

The desired catalogue included CSP nonce and hash sources. BCD 8.0.7 has no
standalone compatibility statement for either source expression. Mapping both
to the broader `script-src` directive would overstate the evidence, so the
catalogue exposes them with `unsupported_mapping`.

That state is useful: it tells a researcher where the source cannot answer the
question and prevents a nearby feature from becoming a proxy without review.

## Qualification-preserving evaluation

The evaluator consumes multiple BCD support statements and retains:

- support and removal boundaries;
- last-supported versions;
- partial implementation;
- flags;
- prefixes and alternative names;
- notes;
- imprecise version boundaries.

A multi-path control fails closed when a path is missing. The result remains
deterministic for fixed inputs.

## Secondary adoptability evidence

WebDX Baseline metadata is joined only through exact declared BCD path
associations. It can help explain when a feature became broadly available, but
it cannot override a browser-specific statement or establish deployment
quality. Missing associations remain visible instead of being inferred.

## Conformance without certification

The catalogue now has a second evidence map for relevant Web Platform Tests.
Every mapping is pinned to one WPT revision and records both what the suite
exercises and what it cannot establish about a deployment.

Twenty-eight controls have an exact suite mapping. HSTS and HttpOnly remain
unmapped because a nearby HTTPS or cookie suite would overstate the evidence.
Current wpt.fyi results are linked for investigation but not reduced to a pass
percentage or used as a policy decision.

## Configuration evidence with a separate collector boundary

The local evidence bundle narrows the gap between compatibility and engineering
review without requiring active collection. It combines several bounded
response snapshots with non-executing HTML analysis, CSP-to-markup
correlation, optional local SRI byte verification, selected Fetch Metadata
request context, and strict reduced WebAuthn configuration.

Raw HTML, resource locations, cookie identities, credentials, request targets,
and WebAuthn identifiers never enter the reduced report. Conflicting route
observations become `inconclusive`, invalid evidence cannot be hidden by a
favourable snapshot, and composite deployment candidates remain separate from
browser-support outcomes.

An optional opaque scope inventory now binds assessed surfaces to a semantic
fingerprint without retaining inventory entries. It can identify excluded scope
and distinguish declared, framework-manifest, authorised-crawl, and test-suite
claims. An expected-surface manifest then makes missing evidence and control
applicability explicit within that supplied scope.

For operators who want a repeatable capture, a separate CLI collector accepts a
reviewed fixed-origin manifest and an explicit authorisation flag. It validates
and pins public network addresses, follows only same-origin redirects, carries
no credentials, executes no scripts, and writes a privacy-minimised bundle to
ignored private storage. This collector boundary does not enter the static
website or ordinary CI.

Reduced reports pin their analysis and source model, bind the reduced inventory,
application, environment, revision, build, producer, and capture window into a
canonical fingerprint, and retain bounded safe detail. Compatible comparison
separates regressions, resolutions, detail changes, and incomparable
application, environment, or inventory identities without reintroducing raw
inputs. A separate policy profile lets CI enforce inventory provenance,
completeness, fingerprint, freshness, identity, coverage, and control
requirements that the evidence producer cannot weaken.

An optional CLI-only trust layer turns that fingerprint, deployment identity,
and reduced inventory into a canonical in-toto statement, verifies an
externally signed Sigstore DSSE bundle against the policy's exact issuer and
workflow identity, and reduces the result without retaining certificates or
transparency entries. This authenticates the signed statement without claiming
that the inventory source was exhaustive, collection was truthful, controls
worked at runtime, or the signer was uncompromised.

## Privacy through absence

The product does not need to know the visitor's installed browser. It asks for
explicit minimums and avoids user-agent detection, capability probing,
telemetry, and server storage.

The optional saved profile is one schema-versioned local value. Export is a
local JSON blob. A static CSP denies runtime network connections.

## Evidence history

The initial selected snapshot establishes a baseline rather than pretending to
know historical BCD changes. Later reviewed updates compare retained snapshots
and append deterministic change events.

## Adoption without a service

The same bounded contracts now support editor and CI workflows without adding a
hosted API. Draft 2020-12 JSON Schemas are generated from the runtime contracts,
while the command line emits deterministic JSON, Markdown and JUnit. Runtime
parsing remains authoritative because cross-field invariants cannot all be
represented in JSON Schema.

Policy drift records browser scope, required features, rule strength,
exceptions and resulting decisions separately. Decision packet comparison
revalidates fingerprints before comparing browser-policy and evidence lanes.
This makes review automation practical without turning a collection of
different signals into an unsupported security score.

The read-only source preview uses candidate packages as data, disables lifecycle
scripts, rebuilds only the selected subset in temporary storage, and reports
semantic changes without opening a pull request or modifying the repository.

## Verification strategy

The verification design separates:

- unit tests for version comparison, qualification propagation, mapping rules,
  source drift, storage, exports, and change events;
- static type and Astro checks;
- deterministic source regeneration;
- generated-contract drift checks and CI report formats;
- dependency and public-tree audits;
- browser behaviour, accessibility, external-request, and narrow-viewport tests;
- complete catalogue-to-WPT registry coverage and pinned-link generation.

Ordinary checks do not call live services.
