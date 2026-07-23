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

## Updates

Dependabot may propose npm and Actions updates. A merge requires:

- changelog and support-policy review;
- lockfile diff review;
- licence and install-script review;
- Sigstore trust-root, bundle-format, and verifier compatibility review;
- selected BCD path and WebDX association review when applicable;
- unit, type, build, dependency, browser, accessibility, and public-tree checks.

Automatic major-version merges are not configured.
