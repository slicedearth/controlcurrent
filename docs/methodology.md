# Methodology

## Research question

ControlCurrent answers:

> For an explicit set of minimum browser versions, what availability and
> qualifications does MDN BCD record for a curated browser security control,
> and what adoptability context does WebDX Baseline associate with its exact
> feature paths?

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

## Change events

Events compare complete selected snapshots. They describe changes in BCD data
or catalogue mappings and use the source package timestamp. They do not assert
the exact time browser code changed.

The baseline event is honest about the project's observation window. Earlier
history is not reconstructed from assumptions.
