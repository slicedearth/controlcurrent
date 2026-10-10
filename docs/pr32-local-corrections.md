# PR32 local correction and maintenance record

Later authorised optional work is recorded in
[the optional follow-up](pr32-optional-follow-up.md). This file retains the
dated maintenance evidence and choices for the original correction batch.

This record accompanies the local correction of the four confirmed PR32 issues
on 7 October 2026 AEDT. The companion source audit dated 6 October was read as
evidence, not additional authority. This record does not establish release
readiness or authorise publication.

## Preserved checkout

The session began with a clean staged, unstaged and untracked inventory on
`maintenance/security-repairs-and-deployment-hardening` at
`ca5ca99198ed43e0df5961ba937c48364f0634d8`. The supplied reviewed head was
`0bd0e25b070e08826164da23d1d016fddecb803d`, and the comparison base was
`8e142af595dc21b77da1a87075def83f9842e1da`. The only subsequent committed change
was the language-audit correction and four regression tests. It was retained.
There was no uncommitted 18-file dependency-refresh batch to overwrite. Existing
maintenance commits, generated data and workflows were preserved. The user later
authorised compatible dependency/source refreshes and a local commit; the root
manifest and lock were updated within that scope. No branch switch, reset, stash,
clean or remote repository mutation was performed. The workspace alias is a symlink to this checkout; the configured
sandbox could not start, so local commands used approval-reviewed execution.

## Correction dispositions

- PR32-1 was already implemented: only the two reviewed generated lock paths are
  exempted; nearby authored manifests and forbidden authored terms still fail.
  The audit also covers unignored new files and NUL-delimited paths.
- PR32-2 now applies a full-token CSP hash grammar and checks decoded algorithm
  lengths independently of SRI options. All three algorithms, malformed option
  suffixes, broad allowances, absent/empty HTML, fallback and overrides, style-only
  authorisation, multiple policies and evidence-policy mapping are covered.
  Valid nonce/hash and CSP3 ignored-source controls remain accepted. The Script
  CSP declaration candidate remains a declaration recipe with runtime caveats;
  no object-src requirement or security score was introduced.
- PR32-3 gates the complete incomparable summary as well as incompatible report
  context. The exact normal-builder reproduction produced compatible context,
  zero regressions, two incomparable results and one surface change. CLI tests
  cover default and independent strict flags, missing/not-evaluated findings,
  model/application/environment differences and unchanged reports.
- PR32-4 implements report-specific JSON, Markdown and JUnit output with shared
  format parsing, legacy --json compatibility, invalid/conflicting option errors
  and explicit total/emitted/truncated disclosure. Process tests parse JSON and
  XML and preserve status across formats, including bounded builder output.
- H1 documentation now distinguishes setup-node's node/npm/yarn version probes
  from reconstruction, installation, audit and signature verification. The action
  and runner remain trusted; deploy performs no project install or build. No
  exploit is inferred from a version probe. Provisioning was not rewritten.
- H2 remains deferred: decide the trusted private root before any filesystem
  redesign. Proposed synthetic tests cover an ordinary private destination and
  a private-parent symlink into a publication tree. Parent validation alone is
  not a defence against concurrent directory replacement; a race-resistant
  directory-relative design is needed if that threat is selected.
- H3 remains deferred: select exclusive final creation with partial-write cleanup
  or a genuine platform-supported no-replace primitive. Proposed competing-writer
  tests must show the loser preserves the winner's bytes. A second destination
  check does not close the race. Neither filesystem scenario was exercised.

## Dated dependency evidence

The application and separately reconstructed npm runtime both returned exit 0
from fresh low-severity JSON audits, with zero vulnerabilities. Fresh registry
verification returned 414 application signatures and 149 attestations, and 147
toolchain signatures and 72 attestations. These are registry-package provenance
checks, not tests of a genuine application evidence attestation or proof of benign
code. `npm ci` using reviewed npm 12.2.0 added 414 packages and audited 415;
its install-time result is separate from the dedicated final audit.

A fresh package-lock-only audit of the exact comparison-base lock on 7 October
returned exit 1: 15 affected package entries (4 moderate, 10 high, 1 critical).
The historical audit JSON establishing the previously reported 13 vulnerabilities
is unavailable. The table below records this dated reconstruction, not an
individual reconciliation of that missing historical result. Repeated package
entries and multiple advisories are not interchangeable counts. The affected
ranges are registry advisory data; the current locked versions are outside those
reported ranges. That initial correction phase preserved the existing dependency graph. The later
explicitly approved compatible refresh is recorded below.

| Exact baseline locked path          | Prior version | Current locked version | Advisory identifiers                                                                                                                              | Reported affected range                                                                          |
| ----------------------------------- | ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `node_modules/@vitest/coverage-v8`  | 4.1.10        | 5.0.3                  | Transitive advisory propagation                                                                                                                   | `See mocker advisory`                                                                            |
| `node_modules/@vitest/mocker`       | 4.1.10        | 5.0.3                  | GHSA-82fw-gwwq-j7x9                                                                                                                               | `>=2.1.0 <4.1.11`                                                                                |
| `node_modules/astro`                | 7.1.3         | 7.3.6                  | GHSA-26w7-cxv4-gfx2; GHSA-376h-93r7-7g6f                                                                                                          | `<7.2.8; <=7.2.3`                                                                                |
| `node_modules/brace-expansion`      | 5.0.8         | 5.0.12                 | GHSA-rgw5-rvv9-x895; GHSA-q2hr-2g5m-vwhr; GHSA-qhr7-859c-m2p7; GHSA-6j4f-fj2g-mc7p                                                                | `>=4.0.0 <5.0.9; >=4.0.0 <5.0.12; >=4.0.0 <5.0.11; >=4.0.0 <5.0.10`                              |
| `node_modules/devalue`              | 5.8.2         | 5.9.4                  | GHSA-9rgm-9g3h-6x36; GHSA-j22f-vq7h-c4qm; GHSA-hx4r-w6wj-j8fg; GHSA-mcm9-63f2-9j32; GHSA-wf3x-273g-mvxv; GHSA-x5rw-q4pp-hg5g; GHSA-4q55-j62x-fr9h | `<5.9.1; >=5.1.0 <=5.9.2; <=5.9.2; >=1.0.0 <=5.9.2; >=5.8.0 <=5.9.2`                             |
| `node_modules/fast-uri`             | 3.1.4         | 3.1.8                  | GHSA-7p8r-x3mc-p8w7; GHSA-5jgf-p345-68v8; GHSA-f65p-4m7j-42xc; GHSA-fph4-wmhf-6fwf; GHSA-jqff-g426-hqxp; GHSA-qw65-cvwx-89v3; GHSA-hrr3-gc8f-f4qj | `>=3.0.0 <3.1.5; >=3.1.3 <3.1.6; >=3.0.0 <3.1.6; >=3.1.2 <3.1.6; >=3.0.0 <3.1.7; >=3.0.0 <3.1.8` |
| `node_modules/http-cache-semantics` | 4.2.0         | 4.3.0                  | GHSA-ch52-4w7c-c8xp                                                                                                                               | `<=4.2.0`                                                                                        |
| `node_modules/js-yaml`              | 4.3.0         | Removed                | GHSA-5p4m-2wfm-xmqj; GHSA-2883-xcg3-v3hh                                                                                                          | `>=4.0.0 <4.3.1; >=4.0.0 <4.3.2`                                                                 |
| `node_modules/nanoid`               | 3.3.16        | 3.3.20                 | GHSA-2v37-7h3g-55p8                                                                                                                               | `<3.3.18`                                                                                        |
| `node_modules/postcss`              | 8.5.22        | 8.5.29                 | GHSA-fxqj-rqcc-2cmp                                                                                                                               | `<=8.5.22`                                                                                       |
| `node_modules/sharp`                | 0.35.3        | 0.35.5                 | GHSA-rgj7-g3m4-5g8c; GHSA-wq5f-xc86-pv6w                                                                                                          | `<0.35.4; <0.35.5`                                                                               |
| `node_modules/smol-toml`            | 1.7.0         | 1.9.0                  | GHSA-7w5x-hrqm-74c2; GHSA-r4xh-jqrq-34v2                                                                                                          | `<=1.7.0; <=1.8.0`                                                                               |
| `node_modules/source-map-js`        | 1.2.1         | 1.2.2                  | GHSA-68fv-2mgg-jv7q                                                                                                                               | `>=1.0.0 <1.2.2`                                                                                 |
| `node_modules/svgo`                 | 4.0.2         | 4.1.0                  | GHSA-w27v-7q3p-w38r; GHSA-4vpr-x523-8j87                                                                                                          | `>=4.0.0 <4.1.0`                                                                                 |
| `node_modules/vitest`               | 4.1.10        | 5.0.3                  | GHSA-82fw-gwwq-j7x9                                                                                                                               | `>=2.1.0 <4.1.11`                                                                                |

The corresponding original advisory records can be opened at
`https://github.com/advisories/<identifier>`. The full dated audit JSON and lock
comparison were retained in the local temporary validation files. The absence
of the original historical audit remains an evidence gap.

### Reachability and compatibility

Vitest, mocker and coverage are development test paths. Astro, devalue, sharp,
SVGO, YAML/TOML helpers and cache semantics are static build/development paths.
The former js-yaml build dependency and its argparse child were removed by the
approved framework patch; the owning helpers now declare yaml instead.
PostCSS, nanoid and source-map-js participate in build CSS/source-map tooling;
fast-uri is reached through the YAML language server's Ajv dependency. These
package-presence facts do not establish execution of an advisory's specific
vulnerable operation. Static deployment has no Node server/image service.

brace-expansion is also reachable in the declared CLI-only graph through
@sigstore/tuf, @tufjs/models and minimatch; lint tooling shares minimatch. The
verifier reads the pinned packaged trust root directly and does not start the
TUF client. No exploit reachability claim is made merely from that installed
chain. Sigstore remains excluded from the browser build. CLI, transport and
bootstrap are outside the coverage denominator; subprocess tests do not change it.

The retained refresh includes deliberate Vitest/coverage 4-to-5 and formatter
plugin 0-to-1 upgrades, rather than only patch updates. TypeScript stays at 6.0.3;
the installed typescript-estree peer range is `>=4.8.4 <6.1.0`. Node type
packages remain on 24.x. This session ran Node 26.4.0, which the package engine
permits; the Node 24 floor was not independently rerun. No forced audit repair,
bulk override or unexplained lock replacement was used.

Comparison of 286 changed lock entries, including the root entry, found no
licence changes at retained package paths; added package paths declare MIT.
The only install-script flag removals are two former nested fsevents paths.
Current script-bearing paths remain esbuild 0.28.2 and optional fsevents 2.3.3.
The inherited policy permits only the exact esbuild script and denies fsevents;
its esbuild pin changed from 0.28.1 in the base to 0.28.2 in the retained refresh.

The upstream npm bundle's complete historical advisory inventory was not
independently reconstructed here. The separate current graph uses
brace-expansion 5.0.12, http-cache-semantics 4.3.0, ip-address 10.7.3 and undici
8.11.2 within owning dependency ranges. The maintained reconstruction is not an
unmodified upstream npm distribution. Hashes/signatures do not prove benign
code. Native Node, tar, actions, the runner and registry roots remain trusted.
The 128 MiB compressed-download bound is not an expanded-disk quota.

### Approved compatible refresh on 7 October

Registry inventory identified Astro 7.3.6 and typescript-eslint 8.71.1 as compatible
updates from 7.3.5 and 8.71.0. The owning lint packages advance together to 8.71.1.
Vite advances from 8.3.2 to 8.3.3 and tinybench from 6.2.0 to 6.2.1 within declared
ranges. The framework patch itself changes its declared helper versions:
internal-helpers 0.11.0 to 0.12.0, markdown-satteri 0.4.2 to 0.4.3,
am-i-vibing 0.4.0 to 0.5.0, verkit 0.4.1 to 0.5.0, and its exact get-tsconfig
prerelease from 5.0.0-beta.4 to 5.0.0-beta.6. It adds a nested es-module-lexer
3.0.3 while the other consumer retains its own version. These are changes in
upstream owning declarations, not root overrides or an added optional-peer graph.

The refreshed lock changes 23 entries including the root, retains licences at
all retained paths, adds one MIT path,
and removes the former MIT js-yaml and Python-2.0 argparse paths. No lifecycle
script flag, allowScripts permission or retained package runtime floor changes.
TypeScript 6.0.3 and Node types 24.19.1 remain deliberate compatibility holds;
TypeScript 7 and Node types 26 were not installed. The separate reconstructed npm
12.2.0 graph has no installed compatible updates and its lock is unchanged.

The registry still identifies BCD 8.1.4 and web-features 3.40.1 as latest.
The documented source-update preview against those installed exact packages
reports zero semantic events and no truncation. Regeneration therefore retains
the reviewed dataset and event history unchanged; no source update was invented.

## Source review

The retained dataset refresh is BCD 8.0.8 to 8.1.4 and WebDX web-features 3.34.2
to 3.40.1. The semantic comparison produced 40 events without truncation:
29 browser-release additions, 5 support additions, 5 support-version corrections
and 1 partial-support addition. All 36 selected paths, the catalogue's 30 controls,
control mappings and retained WebDX Baseline fields remain unchanged.

Support additions cover Firefox Android PRF, WebView Android platform-authenticator
availability, Samsung Integrity Policy/enforcement-report-only and Host-Http cookie
prefixes. Permissions Policy's Chrome, Chrome Android, Edge and WebView Android
start versions move from 88 to 85. Conditional-mediation support in WebView Android
is explicitly partial because autofill integration is unavailable. Release metadata
additions do not bypass released-population checks. Generation/schema verification
checks exact pinned inputs; no runtime source fetch was added.

## Historical and optional boundaries

The companion audit source-closed CC01 and CC03–CC14 for their identified defects.
This patch repairs CC02's residual malformed-hash authorisation. Existing
population/Safari-gap, repeated-header, prefix-redaction, budget/deadline,
count-before-truncation, policy-drift, state invalidation, import preflight,
generation, guarded-storage, exception-scope and cache-boundary work is retained.
Source presence alone is not execution of every historical acceptance permutation.

| Finding | Disposition for the identified defect                                   |
| ------- | ----------------------------------------------------------------------- |
| CC01    | Source-closed; released-population and Safari gap semantics retained.   |
| CC02    | Residual CSP hash grammar correction completed here with focused tests. |
| CC03    | Source-closed; repeated-header fail-closed handling retained.           |
| CC04    | Source-closed; prefix-class privacy reduction retained.                 |
| CC05    | Source-closed; surface, redirect, HTML and label budgets retained.      |
| CC06    | Source-closed; total deadlines retained.                                |
| CC07    | Source-closed; counts before truncation and wrapped totals retained.    |
| CC08    | Source-closed; independent policy-drift decisions retained.             |
| CC09    | Source-closed; dirty-state and export invalidation retained.            |
| CC10    | Source-closed; unavailable-version preflight retained.                  |
| CC11    | Source-closed; generation supersession retained.                        |
| CC12    | Source-closed; guarded storage retained.                                |
| CC13    | Source-closed; exception-scope rejection retained.                      |
| CC14    | Source-closed; cache boundaries retained.                               |

The nine original optional choices remain separate:

1. Strict incomparable report gate and documented formats are corrected here.
2. Broader browser/accessibility coverage remains partial: opt-in Firefox/WebKit
   use one tagged keyboard/planner smoke at 200% root font and 640 px, not full
   imports/downloads/storage/file-drop/CSP or 400% browser zoom coverage.
3. CLI process/diagnostic coverage is expanded for these corrections; broader
   diagnostics and denominator expansion remain optional.
4. Shared generation/storage extraction is partial; a complete controller refactor
   is deferred.
5. Source-age display beside planning remains deferred; Data/footer context remains.
6. The Pages origin limitation is retained; sensitive evidence stays outside it.
7. Manual deployment parity is addressed in source, with no deployment observed.
8. Portable verified output is documented by unchanged evidence-member extraction;
   import does not perform fresh attestation verification.
9. Bounded export error feedback is addressed in source; a deterministic browser
   error-path regression remains deferred.

Complementary any-feature intervals, maximum disjoint accepted comparison inputs
and pending planner snapshot polish remain optional questions. No present bundled
support regression or ordinary-user maximum-input bug is asserted here.

## Local validation record

Commands used the reviewed reconstructed npm 12.2.0 on native Node 26.4.0.
The executable PATH was the fresh temporary reconstruction returned by
`node tools/bootstrap-npm.ts`, not runner npm. Final application versions are
Astro 7.3.6, typescript-eslint 8.71.1, TypeScript 6.0.3, Vitest 5.0.3,
Playwright 1.63.0 and axe 4.13.0. The installed Chromium is 153.0.8010.12,
revision 1243. BCD remains 8.1.4 and WebDX web-features remains 3.40.1.

| Exact command                                                                                                                                                                                                                                                                        | Exit | Observed result                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node tools/bootstrap-npm.ts`                                                                                                                                                                                                                                                        | 0    | Fresh reviewed runtime; no fallback.                                                                                                                            |
| `npm install --save-dev --save-exact --package-lock-only --ignore-scripts astro@7.3.6 typescript-eslint@8.71.1`                                                                                                                                                                      | 0    | Exact compatible root patches and owning declarations.                                                                                                          |
| `npm update --package-lock-only --ignore-scripts vite tinybench`                                                                                                                                                                                                                     | 0    | Compatible installed transitive build/test patches.                                                                                                             |
| `npm ci`                                                                                                                                                                                                                                                                             | 0    | 414 packages added, 415 audited; exact script permissions retained.                                                                                             |
| `npm run source-update:preview -- --bcd-package node_modules/@mdn/browser-compat-data/package.json --web-features-package node_modules/web-features/package.json --bcd-data node_modules/@mdn/browser-compat-data/data.json --web-features-data node_modules/web-features/data.json` | 0    | Zero semantic events, no truncation.                                                                                                                            |
| `npm run generate`                                                                                                                                                                                                                                                                   | 0    | 36 selected paths, zero new events; repository formatting restored identical source bytes.                                                                      |
| `npm run test -- --coverage.enabled=false tests/language-audit.test.ts tests/csp-hash-grammar.test.ts tests/report-cli-process.test.ts tests/workflow-boundaries.test.ts`                                                                                                            | 0    | 49 tests in 4 files passed.                                                                                                                                     |
| `npm run verify`                                                                                                                                                                                                                                                                     | 0    | Lint, formatting, tool types, Astro diagnostics, units/coverage, repository audit, generation/schema checks, build, public audit and language audit all passed. |
| `CONTROLCURRENT_DEPLOY_TARGET=github-pages npm run verify`                                                                                                                                                                                                                           | 0    | Complete final staged-tree verification, retaining the local publication-target build.                                                                          |
| `npm audit --audit-level=low --json`                                                                                                                                                                                                                                                 | 0    | Dedicated application audit: zero vulnerabilities.                                                                                                              |
| `npm audit --audit-level=high`                                                                                                                                                                                                                                                       | 0    | Separately documented application gate: zero vulnerabilities.                                                                                                   |
| `npm audit signatures`                                                                                                                                                                                                                                                               | 0    | 414 signatures and 149 attestations verified.                                                                                                                   |
| `npm audit --prefix <fresh-runtime> --audit-level=low --json`                                                                                                                                                                                                                        | 0    | Separate npm runtime audit: zero vulnerabilities.                                                                                                               |
| `npm audit signatures --prefix <fresh-runtime>`                                                                                                                                                                                                                                      | 0    | 147 signatures and 72 attestations verified.                                                                                                                    |
| `CONTROLCURRENT_DEPLOY_TARGET= CONTROLCURRENT_BROWSER_SMOKE=0 npm run test:e2e`                                                                                                                                                                                                      | 0    | Default Chromium/axe: 28 passed, 0 failed/skipped/flaky/retried.                                                                                                |
| `CONTROLCURRENT_DEPLOY_TARGET=github-pages npm run build`                                                                                                                                                                                                                            | 0    | Local publication-target static build; 45 pages.                                                                                                                |
| `CONTROLCURRENT_DEPLOY_TARGET=github-pages npm run audit:public`                                                                                                                                                                                                                     | 0    | Publication tree passed; no deployment.                                                                                                                         |
| `git diff --cached --check` and `git diff --quiet`                                                                                                                                                                                                                                   | 0    | Staged diff clean; worktree matches index before commit.                                                                                                        |
| `npm outdated --json`                                                                                                                                                                                                                                                                | 1    | Only deliberate TypeScript and Node-type compatibility holds remain.                                                                                            |

Full verification passed 354 tests in 41 files with none skipped. Coverage is
89.71% statements, 79.89% branches, 94.72% functions and 90.87% lines; thresholds
are unchanged. Astro checked 66 files with zero errors, warnings or hints.
Repository audit checked 185 tracked/unignored paths, 16 bounded public JSON files
and 5 workflows; six public schemas and all 36 source paths/30 controls matched.
Language audit checked 162 authored files including the staged handoff record.
The ordinary build/public audit checked 45 pages and 71 files (2,446,959 bytes).
The separate publication-target audit checked 71 files (2,463,189 bytes).

Exact temporary runtime paths, machine results, registry metadata, audit JSON,
lock review and logs are retained in the local temporary validation record.
Registry attestations do not constitute a genuine signed application evidence
end-to-end test. The closure matrix and optional status above are source-backed
boundaries; passing the complete suite does not prove every historical acceptance
permutation was executed.

## Validation limits

The final handoff records exact focused/full verification, dependency audits and
Chromium/axe results separately. The initial focused run had one invalid synthetic
fixture (32 responses against a limit of 16); it was corrected to accepted inputs.
No threshold, schema bound or publication gate was weakened. A preliminary lint
run found five issues in the new tests; those were corrected before final verify. An initial full verify passed 351
tests and failed one stale assertion of the old H1 wording; the assertion now
checks the accurate probe/install boundary while retaining provisioning controls.
The first post-refresh verify stopped at formatting: generation expanded JSON
whitespace in two source files. Parsed equality was confirmed before applying
repository formatting, which restored both files byte-for-byte to their retained
versions. Type, unit, build and later audit stages of that attempt were not run.

No hosted checks were dispatched, PR state fetched, CodeQL rerun, branch protections
or environment approvals verified, exact-current-main release demonstrated, real
Sigstore evidence attestation signed, live target collected, or artifact uploaded.
The supplied audit's reviewed-head synthetic-merge CI result is historical: unit
checks passed, language failed, and dedicated application audit/browser jobs were
skipped. It is not current hosted evidence for this local patch. Exact-main checks,
newest run/attempt and successful required jobs remain publication prerequisites,
with a current-main recheck and separately approved least-privilege deployment.
