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
- browser version strings;
- committed selected snapshots and change events;
- localStorage values;
- exported profile names;
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

## Build and workflow risks

- The lockfile fixes dependency resolution.
- Lifecycle scripts are explicitly reviewed in `allowScripts`.
- CI has read-only content permission.
- Pages deployment has only required Pages and identity permissions.
- Actions are pinned to full commit SHAs.
- No workflow commits, pushes, creates issues, or uses `pull_request_target`.
- No schedule is enabled for source updates.

## Out of scope

- Browser implementation testing
- Website header or runtime testing
- Conformance certification
- Compliance advice
- Market-share analysis
- Private browser policy ingestion
- WPT or wpt.fyi correlation
