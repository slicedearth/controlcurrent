# Conformance evidence

## Purpose

ControlCurrent maintains a project-authored registry that maps each security
control to relevant Web Platform Tests (WPT) suite paths.

The registry answers:

> Which cross-browser conformance suites exercise behaviour relevant to this
> control?

It does not answer:

> Is this application configured securely?

## Reviewed sources

The original suite registry uses:

- **Repository:** <https://github.com/web-platform-tests/wpt>
- **Revision:** `af38980d2fcd74af19a226f5f651051cc15940ed`
- **Review date:** 2026-07-23
- **Licence:** BSD 3-Clause

Pinned source links use the reviewed revision. Links to wpt.fyi are deliberately
labelled as current results because the dashboard changes independently of the
reviewed registry.

The six directive mappings for camera, microphone, geolocation, cache, cookies
and storage use exact file selections reviewed on 2026-10-11 at revision
`cc74d2669f5de548e808779877d1d33339ec5115`. Each mapping displays its own review date,
revision, selected file links, scope and limitations. The original suite links
retain their earlier review metadata.

The Permissions Policy selections exercise enforced, report-only and, for
camera, potential-violation reporting. Their outcomes also depend on reporting
support and the relevant API or test automation. They do not isolate basic
directive enforcement. The cache files include wildcard-clearing cases and
tentative partitioning tests. The cookie files test Set-Cookie ordering within
a clearing response; the storage file includes setup checks and selects
backends available in that browser.

The separate retained snapshot in `data/wpt-snapshot.json` contains five exact
directory prefixes from aligned, stable-labelled runs. Each run records its own
full test-source revision, browser build, operating system, start and completion
times, and public run ID. These revisions are independent of the older suite-link
registry above. Each suite records the SHA-256 of its source API response, the
returned search count, and every result retained after exact-prefix filtering.
The source API's substring matches outside that prefix are excluded explicitly.

File outcomes and subtest counts are displayed separately. OK describes a
completed harness and does not imply all subtests passed. Pass and Fail can also
describe tests without a harness; zero reported subtests are not a passing test.
Complete runtime flags and a full expected-test inventory are not supplied by
these summaries. The snapshot does not change browser compatibility outcomes.

Directive pages select only the reviewed exact filenames from this unchanged
snapshot. They show selected, retained and parent-directory counts separately;
subtest totals include every reported subtest in each selected file. No
subtest-level directive pass rate is inferred. Missing files remain visible as
gaps, and missing browser slots retain their No result status. A changed run
revision makes a file selection incomparable until it is reviewed at that
revision. No parent-suite total is substituted. Response fingerprints and API
queries still identify the complete source directory response before selection.

`npm run wpt:import -- <response-directory> <YYYY-MM-DD>` validates already
downloaded responses named `wpt-search-0.json` through `wpt-search-4.json` in the
suite order in `src/wpt-snapshot.ts`. It makes no network request. Imports refuse
mixed run metadata, unaligned revisions, old aggregation semantics, duplicate
references and exceeded bounds. Normal builds validate the retained snapshot
without refreshing it.

## Mapping rule

A mapping is retained only when the reviewed repository contains an exact suite
path or exact file selection whose scope materially covers the browser behaviour in the control
definition.

Mappings may identify:

- one focused suite, such as `content-security-policy/base-uri`;
- several complementary suites, such as CSP hash behaviour for script and style;
- exact files within a broader suite, with their own reviewed source revision;
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
4. The offline assessment reduces supplied response, resource, request-context,
   and WebAuthn configuration evidence.
5. Application testing evaluates the actual routes, policies, content, and
   runtime behaviour of a deployment.

Directive conformance mappings do not change the offline assessment's
`not_evaluated` application findings. Checking a supplied application's individual
directives remains a separate capability.

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
