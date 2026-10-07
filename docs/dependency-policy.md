# Dependency policy

## Principles

Dependencies must be:

- necessary for source validation, deterministic calculation, testing, or the
  static site;
- supported on the documented Node.js compatibility floor;
- available under a compatible open-source licence;
- fixed by the committed lockfile;
- free of an unexplained runtime network dependency;
- reviewed before a major upgrade.

## Runtime dependencies

`@mdn/browser-compat-data` is the browser-specific compatibility source.
`web-features` supplies exact path associations and Baseline adoptability
metadata. Zod validates selected source and public calculation contracts.
parse5 provides a maintained WHATWG-compatible HTML parser so supplied markup
can be inspected as a tree without browser execution or resource loading.
`@sigstore/bundle`, `@sigstore/protobuf-specs`, `@sigstore/tuf`, and
`@sigstore/verify` provide maintained bundle parsing, trust-root conversion,
packaged trust material, certificate and transparency verification, and
signature-policy enforcement for the CLI-only evidence-attestation path.
ControlCurrent does not implement its own cryptography.

The deployed application has no server runtime dependency.

The Sigstore libraries are excluded from the browser build. Verification reads
the reviewed `trusted_root.json` target directly from the lockfile-pinned
`@sigstore/tuf` package, verifies its project-pinned SHA-256 digest, converts it
with `@sigstore/protobuf-specs`, and never starts the TUF client. Trust refresh,
signing, OIDC acquisition, and transparency-log publication are not part of the
verifier.

## Development dependencies

Astro builds static pages. TypeScript, ESLint, Prettier, Vitest, Playwright, and
axe support type safety, formatting, unit testing, browser verification, and
accessibility testing.

## Lifecycle scripts

The repository uses npm's `allowScripts` field:

- the exact `esbuild` install script is allowed because the static build depends
  on its platform binary;
- optional `fsevents` install scripts are denied because they are not required
  for correctness.

Changes to lifecycle-script packages require explicit review.

The publication guard runs with native Node.js TypeScript support and no project
dependencies, including in the final deployment job.

### Separately locked package-manager runtime

The npm executable and its dependencies are outside the application lockfile's
audit. The official npm 12.2.0 archive still bundles reported vulnerable versions
of brace-expansion, http-cache-semantics, ip-address and undici. An ordinary
application audit or `npm audit fix` does not repair that bundle.

`node tools/bootstrap-npm.ts` does not use runner npm for reconstruction,
installation, audit or signature verification. It uses the
supported native Node runtime and the host's `tar` executable to download the
fixed official CLI archive, check its pinned SHA-512 integrity, and restore only
CLI code, documentation and licence files. The upstream `node_modules` bundle
is excluded. Its runtime dependency declarations must exactly match the
reviewed manifest in `tools/npm-toolchain/package.json`.

A separate `tools/npm-toolchain/package-lock.json` fixes every runtime package
to a registry URL and SHA-512 integrity. All packages remain within their owning
dependency ranges; there are no cross-major overrides. The refreshed graph uses
brace-expansion 5.0.12, http-cache-semantics 4.3.0, ip-address 10.7.3 and undici
8.11.2. It is materialised directly without lifecycle scripts, npm installation,
global changes, or copying bundled modules. The CLI's development, workspace and
bundle declarations are omitted from the reconstructed runtime manifest.

The bootstrap refuses redirects, non-registry URLs, path traversal, links,
special archive entries, bundled modules and script-bearing runtime packages.
It caps archives, metadata, members, graph size, total downloads, concurrency
and duration. A fresh temporary directory is used for each invocation. The
reconstructed CLI audits that graph at every severity and verifies registry
signatures before its npm and npx executables are added to workflow PATH.
This is a project-maintained runtime reconstruction, not an unmodified upstream
distribution or an assurance that unknown vulnerabilities cannot exist.

Every dependency-installing workflow performs this bootstrap before project
installation or dependency audit. Pre-bootstrap package-manager caching is
disabled. A failure cannot fall back to the runner's npm. The deployment job
performs no project install or build.

Pinned `setup-node` still invokes available node, npm and yarn with `--version`
before cache handling; disabling package-manager caching does not disable these probes.
The action and its environment probes remain inside the trusted runner and
provisioning boundary. No vulnerable execution path or compromise was established
by a version probe. The Node runtime, system extraction tool, runner and registry
signing roots remain trusted bootstrap components. Application lifecycle-script permissions are unchanged.
Executable selection is not enforced by `packageManager` alone.

Review a CLI version change together with its archive integrity, original
runtime declarations and separate lock. Audit and verify both dependency graphs,
test a fresh reconstruction and application reinstall, and run ordinary unit,
build and browser checks. Dependabot may propose runtime graph updates, but
manifest, lock and compatibility tests must remain consistent.

## Updates

Dependabot may propose npm and Actions updates. A merge requires:

- changelog and support-policy review;
- lockfile diff review;
- licence and install-script review;
- Sigstore trust-root, bundle-format, and verifier compatibility review;
- selected BCD path and WebDX association review when applicable;
- unit, type, build, dependency, browser, accessibility, and public-tree checks.

Automatic major-version merges are not configured.

## Compatibility holds

TypeScript remains on the supported 6.0 release line while the reviewed
`typescript-eslint` peer range requires a version below 6.1. A newer compiler
major must not be forced through that constraint. Keep the Node.js type
definitions on the 24.x line to match the documented runtime compatibility
floor, even when a newer runtime has its own type definitions.

Nested dependencies follow their owning package's declared ranges. Refresh
compatible nested releases through the lockfile rather than adding blanket
overrides for unrelated newer majors. Review runtime floors, licences and
lifecycle-script changes before a locked reinstall.

The reviewed formatting plugin's 1.x line uses the same compiler generation as
the static framework's 7.x line and supports the project runtime and formatter.
Its compiler rewrite requires a formatting pass and the normal build and browser
checks; formatting changes must not introduce unrelated behaviour changes.
