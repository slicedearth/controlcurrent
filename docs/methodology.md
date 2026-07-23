# Methodology

## Research question

ControlCurrent answers:

> For an explicit set of minimum browser versions, what availability and
> qualifications does MDN BCD record for a curated browser security control,
> and what adoptability context does WebDX Baseline associate with its exact
> feature paths? Which reviewed WPT suites exercise related browser behaviour?

It does not answer whether an application is secure or a control is configured
correctly.

## Control selection

Controls are included when they:

- are enforced or materially interpreted by a browser;
- have a distinct defensive or privacy purpose;
- can be explained without a general security score;
- have primary specifications;
- can be mapped to BCD or shown honestly as unmapped.

The catalogue is intentionally much smaller than BCD.

## Path mapping

A mapping represents the minimum BCD evidence required by the project-authored
control definition. Multi-path controls use:

- `all` when every mapped feature is required;
- `any` only when independent paths each establish the intended capability.

No current catalogue control uses `any`.

Related data is not substituted for a missing feature. CSP nonce and hash
sources remain unsupported mappings in BCD 8.0.7 because the package does not
publish standalone compatibility statements for those source expressions.

## Version comparison

Numeric browser versions are compared component by component. This avoids
treating `15.10` as a decimal less than `15.4`.

The evaluator handles:

- exact versions;
- BCD upper-bound records such as `≤37`;
- bounded version ranges;
- unknown or preview forms;
- version removed;
- version last supported.

An imprecise support boundary produces a qualified or unknown result depending
on the selected minimum. It does not produce an exact support claim.

## Multiple statements

Some BCD features have several statements, such as an unprefixed implementation
and an earlier alternative name. The evaluator preserves all statements and
selects the best applicable outcome without discarding the alternatives.

## Qualifications

Any source-recorded partial implementation, flag, prefix, alternative name, or
note is surfaced. Project prose does not simplify qualified support into an
unqualified check mark.

## Current release view

The static matrix uses the release entries marked `current` in the selected BCD
package. It is an informational view, not a recommended organisational browser
policy. The planner accepts explicit minimum versions.

## Baseline context

Web Platform Features is joined to the selected BCD subset only when a feature
explicitly declares the exact compatibility path. Path-specific status is
preferred when the source supplies it.

Baseline status and low/high dates describe cross-browser adoptability. They do
not change the BCD result for a selected browser, establish correct
configuration, or replace application testing. An absent exact association
remains absent rather than being inferred from a nearby feature.

## Offline configuration evidence

The optional inspector parses one supplied response-header block. It validates
recognised CSP directives and source-expression shapes only in their applicable
effective source-list chains, cross-origin policy values and reporting
parameters, HSTS, response hardening headers, Permissions Policy, Referrer
Policy, Clear-Site-Data, and selected cookie attributes.

`observed` means only that the expected declaration or recognised syntax was
present in that response. `missing` is an observation, not a universal
recommendation: controls such as Clear-Site-Data and partitioned cookies are
context-specific. `report_only` keeps non-enforced CSP evidence separate.
`inconclusive` identifies evidence that needs additional context, such as a
token spread across multiple enforced policies or partial cookie coverage.
`not_evaluated` is used when headers cannot establish a control, including SRI,
Fetch Metadata request behaviour, and WebAuthn.

The parser neither fetches a URL nor evaluates enforcement, origin coverage,
route consistency, application behaviour, browser conformance, or rollout
safety.

## Conformance evidence

Every control has one WPT evidence record. A mapped record identifies exact
suite paths at a pinned reviewed revision. An unmapped record explains why no
nearby suite was used.

Current wpt.fyi links are investigation aids. ControlCurrent does not ingest
their pass rates, infer browser quality from a percentage, or change a
compatibility result from conformance data. WPT exercises standardised browser
behaviour; it does not inspect an application's routes, configuration,
dependencies, threat model, or rollout.

## Change events

Events compare complete selected snapshots. They describe changes in BCD data
or catalogue mappings and use the source package timestamp. They do not assert
the exact time browser code changed.

The baseline event is honest about the project's observation window. Earlier
history is not reconstructed from assumptions.
