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

### Package-manager bootstrap limitation

The npm executable and its bundled dependencies are outside the project
lockfile's audit. A clean project audit must not be described as an audit of the
package manager itself. The reviewed npm 12.0.1 declaration, newer stable 12.2.0
and maintained 11.21.0 release still have reported bundled-dependency issues;
12.2.0 reports three high and one moderate issue. Bundled packages cannot be
repaired by an ordinary `npm audit fix` without replacing upstream bundle
contents. These versions must not be described as vulnerability-free.

No additional workflow bootstrap pin is installed while that review remains
unresolved. A replacement needs its own isolated installation, bundled-tree
audit, signature verification and clean-reinstall testing. Repacking or
separately patching the executable is a distinct toolchain-maintenance change,
not a silent override in the application lockfile. Workflow npm selection still
comes from the Node runner and is not enforced by `packageManager` alone.

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
