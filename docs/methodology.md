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

The simple inspector parses one supplied response-header block. It validates
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

## Multi-surface evidence bundles

The bundle inspector applies the same response-header analysis to several
named snapshots, parses HTML with a WHATWG-compatible non-executing parser,
reduces selected Fetch Metadata request headers, and accepts a deliberately
small WebAuthn configuration contract.

SRI metadata coverage is `observed` only when every eligible external script and every `link`
resource whose `rel` contains `stylesheet`, `preload`, or `modulepreload`
carries at least one recognised SHA-256, SHA-384, or SHA-512 metadata token and
the HTML required no parser recovery. Recognised SHA-2 tokens must decode to
the digest length required by their algorithm. When bounded local bytes are
supplied, ControlCurrent applies the strongest declared algorithm and reports
whether those bytes match. It never fetches a resource.

Response and HTML inputs with the same opaque surface ID are also correlated.
For inline `script` and `style` elements, the inspector checks nonce equality or
calculates the applicable CSP SHA-2 digest against every enforced policy. It
reports unmatched content, broad source expressions, and nonce reuse across
supplied documents without retaining source text or nonce values. Parsing
cannot establish nonce unpredictability, response-by-response generation, or
runtime enforcement.

Integrity Policy headers are parsed as bounded structured dictionaries.
Enforced and report-only observations remain distinct, recognised blocked
destinations are counted, and referenced endpoint names are compared with
`Reporting-Endpoints` without retaining endpoint URLs.

Fetch Metadata evidence establishes only that recognised browser request
context was supplied. It does not prove that an application server rejects
inappropriate requests. WebAuthn evidence describes selected configuration
fields; it does not run a ceremony or establish authenticator support.

Every bundle must declare its expected surfaces. Each surface identifies
required evidence kinds, controls, and composite candidates explicitly. The
semantic role provides context but does not silently choose a default policy.
This avoids declaring a logout, API, embedded, or authentication surface
compliant against requirements that were never selected.

Control findings are first merged within each applicable surface. A favourable
snapshot cannot erase invalid evidence, and conflicting observed/missing states
become `inconclusive`. Cross-surface findings then include only surfaces that
require that control. A control required nowhere is `not_applicable`; a required
control with insufficient evidence remains missing, invalid, inconclusive,
report-only, or not evaluated.

Project-authored strict CSP, cross-origin isolation, and cookie attribute
composites are transparent candidate recipes rather than certification or
policy scores. They are evaluated only for surfaces that explicitly require
them.

Coverage is complete only for the declared manifest. A satisfied result never
claims that the manifest contains every production route or user state.

Every schema 3 bundle also identifies an opaque application, environment,
revision, optional build, producer, and bounded capture window. Schema 5 reports
retain that identity inside their canonical fingerprint. The fingerprint makes
later modification detectable but does not prove that the named producer
created the evidence or that its timestamps are trustworthy.

An independent schema 3 evidence policy can require the intended application,
allowed environments and producer kinds, exact release revision, build-ID
presence, maximum capture duration, and maximum evidence age. Age is measured
in UTC calendar days from capture completion to the explicit evaluation date.
Future-dated evidence fails rather than receiving a negative age. Producer
timestamps remain claims in an unsigned report.

An optional CLI trust layer creates one canonical in-toto statement over the
validated reduced-report fingerprint and retained deployment identity. An
external producer can sign that statement as a Sigstore DSSE bundle.
ControlCurrent verifies the signature, certificate, transparency evidence,
subject digest, and exact policy-selected certificate identity before applying
the evidence gate. Verification authenticates the signed statement, not the
truth or completeness of the collection that produced it.

Reduced reports also pin the analyser, catalogue, BCD, Web Platform Features,
and selected-schema versions.
Report comparison proceeds semantically only when analyser and catalogue
versions match and both reports describe the same application and environment.
It compares normalised states and retained reduced details, so
an HSTS duration or other bounded detail can change without being hidden behind
an unchanged `observed` state. Moving from an observed finding or satisfied
composite to another conclusive state is a regression; the inverse is a
resolution. Transitions involving `not_evaluated`, `not_applicable`, absent
controls, or absent composites are incomparable rather than favourable or
unfavourable. Surface gaps and policy changes are compared separately.

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
