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

The full BCD package is broad and changes frequently. The importer narrows it to
18 exact paths selected by a 15-control catalogue. This creates a reviewable
surface:

- every path has a product reason;
- missing paths fail generation;
- field shape is fingerprinted;
- only four browser families and bounded release metadata are retained;
- the selected output is about 74 KB rather than a full source mirror.

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

Ordinary checks do not call live services.
