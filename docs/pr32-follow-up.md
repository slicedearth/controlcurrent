# PR32 XML output follow-up

Later authorised optional work is recorded in
[the optional follow-up](pr32-optional-follow-up.md). This file retains the
validation evidence and deferred choices at the XML correction's revision.

This local correction addresses FU01 from the supplied follow-up audit dated
7 October 2026. The implementation session began on 10 October with a clean
checkout at `7f16e8b25366a4ccd15ead7af152f92767c33877` on
`maintenance/security-repairs-and-deployment-hardening`. Existing commits,
dependency locks, source snapshots and workflow boundaries are preserved.

## Confirmed correction

Accepted bundle names containing U+FFFE or U+FFFF reached JUnit suite attributes
through `inspectEvidenceBundle`, report fingerprinting, report comparison and the
actual CLI. Both pre-fix process fixtures produced XML rejected by Chromium's
XML parser. This is an output interoperability defect; no target collection,
external request or security exploit is claimed.

The shared XML escaping function now admits exactly the XML 1.0 character set:
U+0009, U+000A, U+000D, U+0020–U+D7FF, U+E000–U+FFFD and
U+10000–U+10FFFF. Each forbidden code point is replaced with one ASCII space
before markup escaping. Lone UTF-16 surrogates are covered at the renderer
boundary. Legal supplementary characters, including supplementary noncharacters
permitted by XML 1.0, are retained. Legal U+007F is also retained rather than
being removed by the previous broader control-character rule.

This changes display text only. JSON reports keep their original names and
fingerprints, and comparison totals and exit decisions are unchanged. No schema
restriction, evaluator-version change, dependency addition or output limit change
is needed.

## Regression evidence

Twelve new unit cases cover forbidden controls, surrogate boundaries, U+FFFE,
U+FFFF and legal character-range boundaries. Existing markup escaping remains
covered. The Markdown test description was narrowed to what it actually tests;
Markdown literal escaping was not implemented.

Five new default Chromium tests use `DOMParser` with `application/xml` on an
empty page. The oracle first rejects the original illegal literals and accepts
ordinary Unicode. The previously used `sax` strict parser accepts those literals,
so it is not used as the character-validity oracle.

Normal bundle builders generate both report-name fixtures. The tests run the
actual CLI, decode stdout as strict UTF-8, parse the emitted XML, and compare its
names, full event totals, case/failure counts, process status and stderr with JSON
output. Unchanged and regressed reports are covered. Positive controls include
accented and combining text, Japanese, emoji, supplementary range boundaries,
quotes and markup characters. The other four shared JUnit renderers are also
parsed; descriptive renderer-contract fields exercise case/message escaping
without fabricating reduced-report fingerprints.

The initial browser harness attempt failed on conflicting inherited colour
environment variables before reaching the XML assertion. The CLI subprocess now
uses an explicit, non-conflicting colour environment and still requires empty
stderr. The corrected pre-fix reproduction then failed twice on the intended XML
parse errors. Initial post-fix fixture assertions omitted an existing outcome
prefix and one preserved space; those expectations and nine new-fixture lint
errors were corrected. The production character-set correction was unchanged.

## Retained closures and optional work

PR32-1 through PR32-4 and H1 remain addressed in the retained source. H2's parent
symlink design and H3's concurrent no-overwrite design remain deferred. This
patch does not extend their filesystem scope.

The fourteen historical closures and nine optional-item dispositions remain as
recorded in [the earlier local handoff](pr32-local-corrections.md#historical-and-optional-boundaries).
FU01 is additional output polish; it does not reopen those original defects.
Markdown literal escaping remains optional, as do broader browser workflows,
controller extraction, planner source-age display, deterministic export-error
coverage, bootstrap failure orchestration and maximum-input experiments.
The default Chromium project is retained; no Firefox/WebKit schedule or hosted
workflow is added.

If reports from an earlier PR32 revision depended on malformed CSP hashes,
regenerate them from the original evidence with the corrected evaluator before
relying on their conclusions. Import and fingerprint validation check report
bytes and do not rerun the evaluator. This XML display correction does not itself
change the analyser model or require a migration.

## Local validation on 10 October 2026

The following checks use Node 26.4.0 and the retained reviewed npm 12.2.0
reconstruction. Package versions remain Astro 7.3.6, TypeScript 6.0.3,
Vitest 5.0.3, Playwright 1.63.0 and axe 4.13.0. BCD 8.1.4 and WebDX 3.40.1
remain unchanged. No package-manager bootstrap change or new reconstruction
was required for this output-only correction.

| Command                                                                                                     | Exit | Observed result                                                                |
| ----------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| `npm ci`                                                                                                    | 0    | 414 added, 415 audited; manifests, both locks and source data unchanged.       |
| `npm run test -- --coverage.enabled=false tests/ci-output.test.ts`                                          | 0    | 16 renderer tests passed.                                                      |
| `CONTROLCURRENT_DEPLOY_TARGET= CONTROLCURRENT_BROWSER_SMOKE=0 npm run test:e2e -- e2e/junit-output.spec.ts` | 0    | All 5 focused XML tests passed.                                                |
| `CONTROLCURRENT_DEPLOY_TARGET=github-pages npm run verify`                                                  | 0    | Every verification stage passed; 366 unit tests in 41 files, none skipped.     |
| `npm audit --audit-level=low --json`                                                                        | 0    | Dedicated application audit: zero vulnerabilities.                             |
| `npm audit --audit-level=high`                                                                              | 0    | Documented application audit gate: zero vulnerabilities.                       |
| `npm audit signatures`                                                                                      | 0    | 414 registry signatures and 149 attestations verified.                         |
| `npm audit --prefix <reviewed-runtime> --audit-level=low --json`                                            | 0    | Separate npm runtime audit: zero vulnerabilities.                              |
| `npm audit signatures --prefix <reviewed-runtime>`                                                          | 0    | 147 registry signatures and 72 attestations verified.                          |
| `CONTROLCURRENT_DEPLOY_TARGET= CONTROLCURRENT_BROWSER_SMOKE=0 npm run test:e2e`                             | 0    | 33 Chromium/accessibility tests passed; no failures, skips, flakes or retries. |
| `git diff --cached --check` and `git diff --quiet`                                                          | 0    | Staged diff clean and worktree matches the index before commit.                |

Coverage is 89.71% statements, 80.00% branches, 94.72% functions and 90.87% lines;
thresholds and the coverage denominator policy are unchanged. Astro checked
66 files with zero errors, warnings or hints. The repository audit checked
187 tracked/unignored paths, 16 bounded public JSON files and five workflows.
All six schemas and 36 selected paths/30 controls matched. The publication-target
build produced 45 pages; the public audit passed on 71 files (2,463,189 bytes).
The language audit passed on 164 authored files, including staged additions.

The final verification is repeated after staging this record, retaining the
publication-target build. Browser tests use the default controlled loopback
fixture and an empty page for XML parsing. The test runner printed inherited
colour-environment warnings; CLI subprocess stderr remained empty. Runtime
prefixes, exact invocations, machine results and local logs are retained in the
temporary validation record. Earlier expected reproduction failures and corrected
fixture/harness failures are recorded above rather than reported as final passes.
Registry package provenance is separate from application evidence authenticity.

## Evidence boundaries

The supplied follow-up audit reports successful CI run `37619283178` and CodeQL
run `37619283088`, attempt 1, for synthetic merge
`842560428f6167b4cedbf7d3bb8c1a0055155922`. It reports 354 unit tests in 41 files,
28 Chromium tests, the dedicated application audit and CodeQL completion for
that earlier revision. These are attributed historical observations, not fresh
remote verification of this local correction. The original 7 October local
handoff remains a dated record and is not rewritten as current hosted evidence.

The reviewed reconstructed npm 12.2.0 is reused with Node 26.4.0 for this session.
The separate runtime and application audits are run separately. The exact
commands, current counts and any failures or unexecuted checks are recorded in
the final local validation handoff. No claim is made about the exact Node 24
floor, broader browser matrix, genuine signed evidence flow, current remote
checks, branch protection, environment approval or release readiness.

This session is authorised for a local commit only. No push, merge, deployment,
release, hosted workflow dispatch, live target collection or evidence upload is
part of this correction.
