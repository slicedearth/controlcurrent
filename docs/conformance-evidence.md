# Conformance evidence

## Purpose

ControlCurrent maintains a project-authored registry that maps each security
control to relevant Web Platform Tests (WPT) suite paths.

The registry answers:

> Which cross-browser conformance suites exercise behaviour relevant to this
> control?

It does not answer:

> Is this application configured securely?

## Reviewed source

- **Repository:** <https://github.com/web-platform-tests/wpt>
- **Revision:** `af38980d2fcd74af19a226f5f651051cc15940ed`
- **Review date:** 2026-07-23
- **Licence:** BSD 3-Clause

Pinned source links use the reviewed revision. Links to wpt.fyi are deliberately
labelled as current results because the dashboard changes independently of the
reviewed registry.

## Mapping rule

A mapping is retained only when the reviewed repository contains an exact suite
path whose scope materially covers the browser behaviour in the control
definition.

Mappings may identify:

- one focused suite, such as `content-security-policy/base-uri`;
- several complementary suites, such as CSP hash behaviour for script and style;
- a broader protocol suite when a feature is tested within it, such as WebAuthn.

The registry does not infer a mapping from a related HTTPS, cookie, or browser
security suite. HSTS and HttpOnly are therefore explicitly unmapped at the
reviewed revision.

## Why pass rates are not ingested

ControlCurrent links to current wpt.fyi results but does not copy or summarise
pass percentages.

A percentage can conceal:

- the exact tests selected;
- stable versus experimental browser channels;
- incomplete or infrastructure-affected runs;
- test expectations;
- platform-specific differences;
- manual or automation-dependent tests;
- whether a suite tests the application concern represented by a control.

The registry is a provenance layer, not a browser leaderboard.

## Evidence boundaries

The project keeps these claims separate:

1. BCD records browser compatibility statements.
2. WebDX Baseline records cross-browser adoptability context.
3. WPT exercises standardised browser behaviour.
4. The offline inspector parses one supplied response snapshot.
5. Application testing evaluates the actual routes, policies, content, and
   runtime behaviour of a deployment.

No earlier layer substitutes for the later one. A passing conformance test does
not establish that an application deployed a control correctly, selected the
right policy, covered every route, or is free from browser defects.

## Updating the registry

A reviewer should:

1. resolve the current WPT default-branch revision;
2. verify every retained suite path at that revision;
3. review renamed, removed, split, or newly relevant suites;
4. keep missing evidence explicit;
5. update the pinned revision and review date together;
6. run the complete unit, build, accessibility, and external-request checks.

Ordinary tests do not access WPT or wpt.fyi.
