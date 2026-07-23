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

## Configuration evidence without a scanner

The local evidence bundle narrows the gap between compatibility and engineering
review without introducing active collection. It combines several bounded
response snapshots with non-executing HTML analysis, CSP-to-markup
correlation, optional local SRI byte verification, selected Fetch Metadata
request context, and strict reduced WebAuthn configuration.

Raw HTML, resource locations, cookie identities, credentials, request targets,
and WebAuthn identifiers never enter the reduced report. Conflicting route
observations become `inconclusive`, invalid evidence cannot be hidden by a
favourable snapshot, and composite deployment candidates remain separate from
browser-support outcomes.

An expected-surface manifest makes missing evidence and control applicability
explicit within an operator-declared scope. Reduced reports pin their analysis
and source model, carry a canonical fingerprint, and retain bounded safe detail.
Compatible comparison separates regressions, resolutions, detail changes, and
incomparable evidence without reintroducing raw inputs. A separate policy
profile lets CI enforce requirements that the evidence producer cannot weaken.

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

## Verification strategy

The verification design separates:

- unit tests for version comparison, qualification propagation, mapping rules,
  source drift, storage, exports, and change events;
- static type and Astro checks;
- deterministic source regeneration;
- dependency and public-tree audits;
- browser behaviour, accessibility, external-request, and narrow-viewport tests.
- complete catalogue-to-WPT registry coverage and pinned-link generation.

Ordinary checks do not call live services.
