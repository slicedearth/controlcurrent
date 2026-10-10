# Dependency and source refresh — 11 October 2026

This review starts from merged `main` at
`aa1d54f8d4ee84249022bbaa7dc85c83a3cc50e2`. The checkout was clean before creating
`maintenance/dependency-refresh-2026-10-10`; the branch was created before the
local date changed. Existing PR32 corrections, optional follow-up work and
publication controls are retained. No reset, stash, lockfile replacement or
discard of existing work was used.

## Reviewed updates

| Direct package             | Previous | Updated |
| -------------------------- | -------- | ------- |
| `@mdn/browser-compat-data` | 8.1.4    | 8.1.5   |
| `web-features`             | 3.40.1   | 3.42.0  |
| `astro`                    | 7.3.6    | 7.3.8   |
| `@playwright/test`         | 1.63.0   | 1.64.0  |
| `@types/node`              | 24.19.1  | 24.19.2 |
| `prettier`                 | 3.9.9    | 3.9.10  |
| `prettier-plugin-astro`    | 1.1.0    | 1.1.1   |

Compatible nested updates include `@astrojs/language-server` 2.17.2,
`rolldown` and its platform bindings 1.2.13, `@oxc-project/types` 0.153.0,
`vite` 8.3.4 and `smol-toml` 1.9.1. The browser packages move together to 1.64.0.
The two existing `es-module-lexer` versions, 2.3.2 and 3.0.3, change their
hoisted locations without introducing a new version. The application lock
retains 516 package entries.

The separate npm runtime lock updates only `p-map`, from 7.0.8 to 7.1.0, within
the upstream `^7.0.4` declaration. It retains 147 packages. npm 12.2.0, its
original runtime declarations, archive integrity and activation gates are
unchanged. There are no overrides or forced major upgrades.

The paired security-analysis actions move from 4.38.2 to 4.38.3, pinned to
`24c54180a607b1449ed407dd24f251e4e9147c8d`. The release updates the default
analysis bundle to 2.27.2 and fixes per-language bundle selection. Permissions,
triggers, deployment gates and cache boundaries are unchanged. The separate
setup-node 7.1.0 update remains in PR34, as requested.

Upstream notes reviewed:

- [Framework 7.3.7](https://github.com/withastro/astro/releases/tag/astro%407.3.7)
  and [7.3.8](https://github.com/withastro/astro/releases/tag/astro%407.3.8):
  content, development-server and error-handler fixes; internal transforms move
  to Oxc and Rolldown. The project still builds a static site.
- [Browser runner 1.64.0](https://github.com/microsoft/playwright/releases/tag/v1.64.0):
  browser updates and screen-size forwarding from device descriptors. Existing
  test configuration and fixture boundaries are preserved.
- [Formatter 3.9.10](https://github.com/prettier/prettier/releases/tag/3.9.10)
  and [template plugin 1.1.1](https://github.com/withastro/prettier-plugin-astro/releases/tag/v1.1.1):
  Markdown-table parsing and template-comment fixes.
- [Bundler 1.2.13](https://github.com/rolldown/rolldown/releases/tag/v1.2.13),
  [build tooling 8.3.4](https://github.com/vitejs/vite/releases/tag/v8.3.4),
  [TOML parser 1.9.1](https://github.com/squirrelchat/smol-toml/releases/tag/v1.9.1)
  and [concurrency helper 7.1.0](https://github.com/sindresorhus/p-map/releases/tag/v7.1.0):
  compatible fixes and additions reviewed with their owning dependency ranges.
- [Security action 4.38.3](https://github.com/github/codeql-action/releases/tag/v4.38.3):
  the action tag is used, rather than a separately published bundle tag.

## Source provenance and semantic changes

Candidate source packages were downloaded at exact versions into a temporary
directory with lifecycle scripts disabled. The repository's semantic preview
ran before regeneration.

[BCD 8.1.5](https://github.com/mdn/browser-compat-data/releases/tag/v8.1.5)
has source timestamp `2026-10-08T12:46:21.707Z`. The selected snapshot adds
planned version 158 for Chrome, Chrome Android and WebView Android. In those
three families, 154 becomes retired, 155 current, 156 beta and 157 nightly;
157 also gains the release date 3 November 2026.

[Web Platform Features 3.41.0](https://github.com/web-platform-dx/web-features/releases/tag/v3.41.0)
adds upstream features and associations;
[3.42.0](https://github.com/web-platform-dx/web-features/releases/tag/v3.42.0)
allows multiple features to share compatibility keys. The existing selected
source builder already retains multiple matching associations. For this
catalogue, all 36 selected feature records, 30 control mappings and 28 Baseline
associations are unchanged. The schema fingerprint is unchanged.

Generation preserves all 64 previous change events and appends the three
release-added events, giving 67 events and one new source-history entry.
Release-status changes are also reviewed in the snapshot diff; the three-event
preview is not a complete count of every changed metadata field. The WPT source
revision and catalogue version remain unchanged. No runtime source fetching or
live-target collection was introduced.

The two unsupported CSP nonce/hash mapping notes and browser provenance
assertions now name the reviewed source versions. BCD 8.1.5 still has no
standalone nonce/hash compatibility entries, so their explicit unsupported
mapping state is retained.

## Compatibility, licences and reachability

TypeScript remains at 6.0.3 because `typescript-eslint` 8.71.1 requires
`>=4.8.4 <6.1.0`; the available 7.0.2 compiler is outside that contract.
Node type definitions remain on 24.x to match the supported runtime floor,
rather than moving to the available 26.6.5. The remaining installed updates
reported within broad peer ranges refer only to these two deliberate holds.
Other newer nested releases are outside their owners' ranges or exact pins.
An `npm outdated` exit of 1 records these available releases and is not an audit
failure.

Lockfile engine review accepts Node 24.15.0 for packages applicable to local
macOS arm64 and hosted Linux x64. An initial all-platform inventory flagged
the unchanged optional `@img/sharp-win32-ia32` 0.35.5 declaration (`^20.9.0`).
That binary is restricted to 32-bit Windows and is not installed on either
reviewed target; this refresh does not claim validation of that platform.

Updated packages retain their previous licences. BCD remains CC0-1.0 and
Web Platform Features remains Apache-2.0. The lockfile adds no lifecycle-script
package: the exact esbuild 0.28.2 permission and denied optional fsevents scripts
are unchanged. The reconstructed npm graph has no install-script packages.
Existing third-party notices remain applicable.

The datasets are bounded build inputs; framework, formatter, browser runner and
language tools execute during development or validation. The concurrency helper
is confined to the package-manager runtime. CLI-only signature-verification
dependencies, their trust target and their browser exclusion are unchanged.
Fresh advisory results below report no known vulnerabilities; they do not prove
benign code or reconcile every historical advisory independently.

## Local validation

Commands use Node 26.4.0 and a fresh reviewed npm 12.2.0 reconstruction.
`RUNTIME` denotes the temporary directory printed by the successful bootstrap;
its `executables` directory is first on PATH. Exact paths, outputs and exit codes
are retained in private local command logs. Build checks disable development
telemetry and use `CONTROLCURRENT_DEPLOY_TARGET=github-pages`; browser checks
clear that target and use only controlled loopback fixtures.

| Command                                                                                                                   | Exit | Observed result                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| `env -u GITHUB_PATH -u GITHUB_ENV node tools/bootstrap-npm.ts`                                                            | 0    | Fresh reconstruction passed version, audit and signature gates before activation. |
| `npm ci`                                                                                                                  | 0    | 414 packages installed, 415 audited; zero reported vulnerabilities.               |
| `npm run source-update:preview --` with exact candidate package/data paths                                                | 0    | Three release-added events; complete snapshot diff reviewed separately.           |
| `npm run generate`                                                                                                        | 0    | 36 selected paths and three new events.                                           |
| `npm exec -- vitest run` with the eight focused source, toolchain, workflow, browser-config and language-audit test files | 0    | 78 tests passed in eight files.                                                   |
| `CONTROLCURRENT_DEPLOY_TARGET=github-pages npm run verify`                                                                | 0    | 396 tests in 44 files and every verification stage passed.                        |
| `npm audit --audit-level=high`                                                                                            | 0    | Required application audit: zero vulnerabilities.                                 |
| `npm audit --audit-level=low --json`                                                                                      | 0    | Full application graph: zero vulnerabilities.                                     |
| `npm audit --omit=dev --audit-level=low --json`                                                                           | 0    | Production dependency query: zero vulnerabilities.                                |
| `npm audit signatures`                                                                                                    | 0    | 414 registry signatures and 149 attestations verified.                            |
| `npm audit --prefix "$RUNTIME" --audit-level=low --json`                                                                  | 0    | Separate package-manager graph: zero vulnerabilities.                             |
| `npm audit signatures --prefix "$RUNTIME"`                                                                                | 0    | 147 registry signatures and 72 attestations verified.                             |
| `npm run test:e2e:install`                                                                                                | 0    | Installed matching Chromium and supporting browser binaries.                      |
| `npm exec -- playwright install firefox webkit`                                                                           | 0    | Installed matching optional local browser binaries.                               |

The application advisory metadata covers 516 lock-graph entries, including
optional platform packages; signatures cover 414 installed packages. Toolchain
success is separate from the application audit. Registry attestations are not
application evidence-attestation tests and do not establish truthful collection.

The complete verification includes lint, formatting, strict types, 73 Astro
files with no diagnostics, unit coverage, repository audit, selected-source and
six-schema drift checks, a 45-page static build, public audit and language audit.
Coverage meets the unchanged thresholds: 88.82% statements, 79.32% branches,
94.21% functions and 90.48% lines.

The focused unit command was:

```sh
npm exec -- vitest run tests/source.test.ts tests/source-update-preview.test.ts tests/source-history.test.ts tests/changes.test.ts tests/npm-toolchain.test.ts tests/workflow-boundaries.test.ts tests/browser-config.test.ts tests/language-audit.test.ts
```

Actual launched browser versions are Chromium 156.0.8078.4 (revision 1248),
Firefox 157.0 (1555) and WebKit 27.2 (2370). Browser checks explicitly unset `CI`,
so retries are disabled. The default suite uses
`CONTROLCURRENT_BROWSER_SMOKE=0 CONTROLCURRENT_BROWSER_WORKFLOWS=0` and a cleared
deployment target.

The initial `npm run test:e2e` exited 1 with 36 passes and two failures: source
provenance assertions still expected BCD 8.1.4 and Web Platform Features 3.40.1.
The rendered values correctly matched the refreshed packages. The assertions
were updated without weakening any checks. The focused rerun below exited 0
with both tests passing, followed by a complete default `npm run test:e2e`
with exit 0 and all 38 tests passing, without skips, flakes or retries.

```sh
env -u CI npm run test:e2e -- e2e/site.spec.ts --grep 'renders real source provenance|reduces a multi-surface evidence bundle'
```

The optional workflow run also exited 0: 60 tests passed, 20 each in Chromium,
Firefox and WebKit, without skips, flakes or retries. Its exact command was:

```sh
CONTROLCURRENT_DEPLOY_TARGET= CONTROLCURRENT_BROWSER_SMOKE=0 CONTROLCURRENT_BROWSER_WORKFLOWS=1 env -u CI npm run test:e2e -- --grep '@smoke|@workflow'
```

This covers the existing tagged smoke and workflow cases. Full-suite parity
across all three engines and native 400% browser zoom remain unexecuted. Hosted
browser defaults and schedules are unchanged. The final staged tree must pass
the complete verification command before commit, including the repository and
language audits that enumerate tracked or unignored files.

## Remote state and limits

The six superseded dependency PRs, 12, 13, 16, 20, 22 and 23, were closed using
the `slicedearth` account after verifying their changes were already included
on merged main. PR34 remains open. The current default-branch dependency-alert
query returned zero open alerts.

This record describes local checks. Hosted results must be checked for the
eventual pushed revision; a PR comparison run does not replace exact-main
release verification. Nothing in this refresh merges a PR, approves a deployment
environment, dispatches a hosted workflow, changes an account, scans a live
target or publishes raw evidence. Hashes and signatures retain their existing
limitations, and the maintained npm reconstruction is not an unmodified upstream
distribution. Compressed archive limits are not expanded disk quotas.
