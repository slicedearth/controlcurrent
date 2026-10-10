# PR32 optional local follow-up

This session on 10 October 2026 implements the authorised optional and deferred
local work. It started with a clean tracked, staged and untracked inventory at
`eaf928facc64e565fe300712a91a518e2970c4df` on
`maintenance/security-repairs-and-deployment-hardening`. The earlier maintenance,
dependency/source refresh, four PR32 corrections and XML correction are retained.
No branch switch, reset, stash, clean, lock replacement or discarded edit occurred.
All changes in this session belong to this follow-up; no ownership conflict arose.

## Dispositions

| Item   | Current disposition                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR32-1 | Retained exact generated-lock exclusions and authored-language regressions.                                                                                                       |
| PR32-2 | Retained anchored CSP hash grammar, SRI options and effective-source tests.                                                                                                       |
| PR32-3 | Retained the complete incomparable-summary gate and real-builder process fixture.                                                                                                 |
| PR32-4 | Retained genuine text/JSON/Markdown/JUnit output and format-independent gates.                                                                                                    |
| H1     | Retained accurate setup-node probe wording; provisioning and least privilege unchanged.                                                                                           |
| H2     | Implemented repository-root anchoring, private-parent link refusal, canonical external destinations and pre-collection preflight. Trusted-parent concurrency boundary documented. |
| H3     | Implemented atomic no-replace hard-link publication, private modes and temporary-file cleanup. Real competing writers and a deterministic post-preflight claimant are tested.     |
| FU01   | Retained the exact XML 1.0 character boundary and browser XML parser regressions.                                                                                                 |

The private-output root follows the CLI's checkout, not the invoking process's
working directory. A synthetic process test starts elsewhere and verifies that a
public destination is refused before any loopback request. Existing aliases into
the publication tree are rejected. Output bytes are flushed and closed before a
same-directory hard link claims the final filename. Eight competing processes
produce exactly one winner; a forced claim after preflight cannot be replaced.
Serialisation and partial-write failures leave no partial final file or temporary
file. Unsupported hard-link filesystems fail closed. Windows and other filesystem
implementations were not executed in this session. The design assumes trusted
parents and does not claim resistance to malicious concurrent directory swaps.

Markdown display fields now escape CommonMark punctuation, including supplied
image/link/HTML/formatting syntax. Offline parser fixtures preserve literal names
and refuse active supplied image/HTML/formatting nodes. CommonMark and GFM parsing
are distinguished: viewers can independently linkify plain URLs after parsing.
No URL in those fixtures was visited. JSON, fingerprints and classification remain
unchanged.

The public packet builder accepts the synthetic maximum of 4,096 evidence-policy
findings per input within its byte bound. Disjoint sets reproduced a failure at
8,192 changes against the former 4,096 category cap. Category totals now share the
existing 16,384 whole-evidence bound; combined totals allow that evidence lane
plus at most 4,096 browser events. The 512-event display limit remains. These are
accepted builder-contract inputs, not findings naturally emitted by the current
catalogue evaluator. No ordinary-user failure is inferred from the stress case.

The planner, minimum planner and evidence-bundle inspector now use complete
TypeScript controllers with explicit initialisers, typed required DOM controls,
guarded async listeners and shared bounded downloads. Existing generation/storage
boundaries remain. Replacement evidence disables review until loading finishes;
replacement comparisons remove old comparison data immediately. Source timestamps,
versions and device-clock package age appear beside both planning forms. Package
age is not a review date or a guarantee of current data.

The alternative-feature test preserves the current stronger contract: one mapped
path must cover the entire reviewed release population. It covers complementary
support intervals and a qualified whole-population alternative. The current
Integrity Policy paths still share their bundled support data. The stale
methodology claim that no control uses `any` is corrected.

Bootstrap activation is measured separately from reconstruction. Version, advisory
and registry-signature subprocesses must all succeed before executable links or a
workflow PATH entry are created. Offline failing subprocesses test each gate. The
real fresh reconstruction is also validated locally; it does not establish that
the reconstructed code is benign or that evidence collection is truthful.

## Historical closure matrix

These retain the identified closures, not a claim that every historical acceptance
permutation has been executed again.

| Finding | Retained closure                                                                |
| ------- | ------------------------------------------------------------------------------- |
| CC01    | Released populations and Safari gaps.                                           |
| CC02    | CSP hash grammar and effective declaration candidate; runtime caveats retained. |
| CC03    | Repeated-header fail-closed handling.                                           |
| CC04    | Most-specific cookie-prefix redaction.                                          |
| CC05    | Surface, redirect, HTML and label budgets.                                      |
| CC06    | Absolute collection deadlines.                                                  |
| CC07    | Complete counts before truncation, including wrapped totals.                    |
| CC08    | Independent policy-drift decisions.                                             |
| CC09    | Dirty-state/export invalidation; pending comparisons now clearer.               |
| CC10    | Unavailable-version preflight.                                                  |
| CC11    | Generation supersession; retained across controller extraction.                 |
| CC12    | Guarded opt-in storage.                                                         |
| CC13    | Exception-scope rejection.                                                      |
| CC14    | Cache boundaries.                                                               |

## Nine optional choices

| Item                             | Current status                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Strict incomparable/formats   | Completed previously; retained.                                                                                                                                                            |
| 2. Browser/accessibility breadth | Expanded local opt-in workflows across three engines; native 400% browser zoom and a complete cross-engine site suite remain unexecuted. No recurring hosted change.                       |
| 3. CLI diagnostics/coverage      | Added actual collector process diagnostics. Measured unit coverage now includes transport, private output and activation. CLI dispatch and reconstruction remain outside that denominator. |
| 4. UI controllers                | Complete planner, minimum-planner and evidence-bundle controllers extracted; shared DOM/event/download boundaries added. Other simple page scripts remain in their components.             |
| 5. Source age                    | Implemented beside both planning forms with exact timestamp/version context and clock caveats.                                                                                             |
| 6. Hosting boundary              | Retained. Sensitive organisational evidence still requires an appropriate dedicated origin; no account or hosting changes authorised.                                                      |
| 7. Manual deployment parity      | Source controls retained. Deployment and eventual exact-main verification remain unobserved.                                                                                               |
| 8. Portable authenticated output | Existing unchanged evidence-member extraction remains documented; no new wrapper or fresh browser attestation claim.                                                                       |
| 9. Export error feedback         | Deterministic browser tests now exercise the byte-limit error, Blob failure, no-download outcome and successful retry.                                                                     |

## Validation record

Commands use Node 26.4.0 and the fresh reviewed npm 12.2.0 reconstruction.
`RUNTIME` below denotes the fresh temporary directory printed by the bootstrap;
its `executables` directory is first on PATH for all subsequent npm commands.
The private command record retains that exact path and per-command exit codes.
Astro is 7.3.6, TypeScript 6.0.3, Vitest 5.0.3, Playwright 1.63.0 and axe 4.13.0.
The executed engines report Chromium 153.0.8010.12 (revision 1243), Firefox 155.0
(1543) and WebKit 26.6 (2359).

| Command                                                                                                                                            | Exit | Observed result                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| `env -u GITHUB_PATH -u GITHUB_ENV node tools/bootstrap-npm.ts`                                                                                     | 0    | Fresh reconstruction, version check, low-severity runtime audit and registry signature verification succeeded before activation. |
| `npm ci`                                                                                                                                           | 0    | 414 added, 415 audited; zero reported vulnerabilities. Manifests and locks unchanged.                                            |
| `npm run test -- --coverage.enabled=false tests/collector-cli-process.test.ts tests/private-output.test.ts`                                        | 0    | 15 focused filesystem/process tests passed, including the deterministic late claimant.                                           |
| `CONTROLCURRENT_DEPLOY_TARGET= CONTROLCURRENT_BROWSER_SMOKE=0 CONTROLCURRENT_BROWSER_WORKFLOWS=0 npm run test:e2e -- e2e/audit-boundaries.spec.ts` | 0    | 15 focused Chromium tests passed.                                                                                                |
| `CONTROLCURRENT_DEPLOY_TARGET= CONTROLCURRENT_BROWSER_SMOKE=0 CONTROLCURRENT_BROWSER_WORKFLOWS=1 npm run test:e2e -- --grep '@smoke\|@workflow'`   | 0    | 60 passed: 20 each in Chromium, Firefox and WebKit; no failures, skips, flakes or retries.                                       |
| `CONTROLCURRENT_DEPLOY_TARGET=github-pages npm run verify`                                                                                         | 0    | Every stage passed; 396 tests in 44 files, none skipped. Repeated on the final staged tree before commit.                        |
| `npm audit --audit-level=low --json`                                                                                                               | 0    | Dedicated full application audit: zero vulnerabilities.                                                                          |
| `npm audit --audit-level=high`                                                                                                                     | 0    | Documented application gate: zero vulnerabilities.                                                                               |
| `npm audit --omit=dev --audit-level=low --json`                                                                                                    | 0    | Production dependency advisory query: zero vulnerabilities.                                                                      |
| `npm audit signatures`                                                                                                                             | 0    | 414 registry signatures and 149 attestations verified.                                                                           |
| `npm audit --prefix "$RUNTIME" --audit-level=low --json`                                                                                           | 0    | Separate package-manager runtime audit: zero vulnerabilities.                                                                    |
| `npm audit signatures --prefix "$RUNTIME"`                                                                                                         | 0    | 147 registry signatures and 72 attestations verified.                                                                            |
| `CONTROLCURRENT_DEPLOY_TARGET= CONTROLCURRENT_BROWSER_SMOKE=0 CONTROLCURRENT_BROWSER_WORKFLOWS=0 npm run test:e2e`                                 | 0    | All 38 default Chromium/accessibility tests passed; no failures, skips, flakes or retries.                                       |
| `git diff --cached --check` and `git diff --quiet`                                                                                                 | 0    | Staged patch passes whitespace checks and matches the worktree before commit.                                                    |

The complete verification runs lint, formatting, TypeScript, Astro, unit coverage,
repository audit, generated-data/schema checks, static build, public audit and
language audit. Astro checks 73 files with zero errors, warnings or hints. Unit
coverage is 88.82% statements, 79.32% branches, 94.21% functions and 90.48% lines;
the expanded denominator meets the unchanged thresholds. The repository audit
checks 200 tracked/unignored paths, 16 bounded public JSON files (480,213 bytes)
and five workflows. All six schemas and 36 selected paths/30 controls match.
The publication-target build has 45 pages and 73 public files (2,463,447 bytes).
The language audit covers 177 authored paths, including the staged additions.

The install count is not substituted for either dedicated audit. Application
advisory metadata covers 516 lock-graph entries including optional platform
packages; registry signatures cover the 414 installed packages. The separate
runtime graph has 147 packages. No dependency or browser download was added by
the optional engine checks; those engines were already installed locally.

Intermediate failures are retained as development evidence. The first focused
run had 68 passes and one obsolete Markdown expectation. The next had 35 passes
and seven failures: the intended maximum-input reproduction, four parser-extension
expectations, one legacy escaped-text expectation and one incorrect expected
support state. The next had 95 passes and one incorrect JUnit-property expectation.
Those fixtures now check the actual retained contracts. The extracted scripts
initially exposed 377 strict-lint errors, predominantly inherited non-null
assertions; typed element guards and async handlers resolved them without rule
suppression. One remaining generic-helper error and the moved base-URL typing were
also corrected. The new collector process fixture initially had a missing brace
(11 other tests passed); all 15 then passed after repair. The first complete verify
stopped at its new environment-variable type annotation, leaving subsequent stages
unexecuted in that attempt. The corrected complete run and final staged run pass.
Browser logs contain inherited colour-environment warnings; the tested CLI
subprocesses have empty stderr on successful commands.

## Changed files

The local commit contains 37 files:

- UI/model: `src/ci-output.ts`, `src/contracts.ts`, `src/source-age.ts`,
  `src/components/Planner.astro`, `src/components/MinimumPlanner.astro`,
  `src/components/EvidenceBundleInspector.astro`, `src/components/SourceContext.astro`,
  `src/controllers/planner.ts`, `src/controllers/minimum-planner.ts`,
  `src/controllers/evidence-bundle.ts`, `src/controllers/dom.ts`,
  `src/controllers/download.ts`.
- Local tooling: `tools/cli.ts`, `tools/private-output.ts`, `tools/bootstrap-npm.ts`,
  `tools/toolchain-activation.ts`.
- Verification: `tests/ci-output.test.ts`, `tests/decision-packet.test.ts`,
  `tests/evaluate.test.ts`, `tests/npm-toolchain.test.ts`, `tests/private-output.test.ts`,
  `tests/collector-cli-process.test.ts`, `tests/source-age.test.ts`,
  `e2e/audit-boundaries.spec.ts`, `e2e/site.spec.ts`, `playwright.config.ts`,
  `vitest.config.ts`.
- Documentation: `README.md`, `docs/architecture.md`, `docs/authorised-collection.md`,
  `docs/dependency-policy.md`, `docs/deployment-security.md`, `docs/methodology.md`,
  `docs/policy-as-code.md`, `docs/pr32-follow-up.md`, `docs/pr32-local-corrections.md`,
  `docs/pr32-optional-follow-up.md`.

## Maintenance and provenance limits

The current batch changes no package manifest, either lockfile, selected browser
dataset, source history, WPT revision, workflow, install-script policy or licence
inventory. The prior dated advisory and source-change evidence remains in
[the maintenance handoff](pr32-local-corrections.md) and
[the XML follow-up](pr32-follow-up.md). The original thirteen historical advisory
items are not newly claimed to have been individually reconciled. Current audit
results are separate from historical advisory reachability.

BCD 8.1.4, WebDX 3.40.1, TypeScript 6.0.3 and Node types 24.19.1 are retained.
This session uses Node 26.4.0 and the reviewed reconstructed npm 12.2.0; the Node 24
floor is not independently exercised. The reconstruction remains a maintained
distribution, not the unmodified upstream bundle. Hashes, registry signatures and
attestations do not prove benign code. Compressed download bounds are not expanded
disk quotas. Registry provenance is separate from authentic application evidence.

The optional browsers use a disposable loopback HTTPS certificate with the
documented context-wide test-only certificate bypass. This is not production TLS
verification. No real signed evidence ceremony, native 400% zoom, hostile-directory
race defence, current hosted run, branch protection, human environment approval or
exact-main release check is claimed. Full bootstrap reconstruction is outside unit
coverage even though archive tests and a successful fresh run provide other evidence.

No push, merge, deployment, release, hosted workflow dispatch, live target
collection, evidence upload, signing ceremony, external message or account change
is part of this session. The only remote validation is the previously approved
registry reconstruction, advisory queries and registry signature verification.
Further publication or hosted runs need separate approval; merge and deployment
retain their own renewed approval boundary.
