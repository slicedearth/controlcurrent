# Security policy

## Supported versions

Security fixes are applied to the current `main` branch. No released support
window is promised before the first published release.

## Reporting a vulnerability

Do not disclose an unpatched vulnerability in a public issue.

Use GitHub private vulnerability reporting when it becomes available for the
repository. Until then, contact the repository owner privately through the
GitHub profile. Include:

- the affected commit or version;
- the vulnerable component or route;
- the security impact;
- minimal reproduction steps;
- any relevant browser and operating-system details.

Do not include real secrets, personal data, or unrelated private application
information.

## Security architecture

ControlCurrent is a static application:

- no production server, database, account, or authentication;
- no website scanning or arbitrary URL input;
- bounded offline parsing of user-supplied response headers, HTML, selected
  request headers, and reduced WebAuthn configuration;
- no runtime compatibility API;
- no browser fingerprinting;
- no analytics or third-party script;
- no remote font or script CDN;
- restrictive static Content Security Policy;
- `connect-src 'none'` for the deployed application;
- bounded, deliberate local profile storage;
- escaped text rendering for source-derived values;
- no raw header, cookie name, or cookie value in assurance reports;
- no HTML execution, resource loading, or resource-location retention in
  evidence reports;
- bounded application, environment, revision, build, producer, and capture
  identity inside the reduced-report fingerprint;
- fail-closed independent policy for attestation, identity, and evidence
  freshness;
- optional CLI-only Sigstore verification with exact issuer and URI identity,
  bounded DSSE input, a hash-pinned packaged trust target, and no trust-material
  network request.

The build treats the BCD package as hostile structured input. Selected paths,
string lengths, statement counts, browser releases, schema versions, and output
sizes are bounded and validated. A missing configured path or incompatible
schema stops publication.

## Source and dependency boundaries

- BCD is loaded from the exact package version in the lockfile.
- The generator executes no upstream script or source code.
- Ordinary tests and CI make no live source request.
- Dependencies are installed from the committed lockfile.
- Sigstore verification uses maintained libraries rather than project-authored
  cryptography and is excluded from the browser build.
- GitHub Actions use immutable action revisions; deployment credentials exist
  only in the dependency-free Pages deployment job.
- The repository audit refuses mutable action references, privileged triggers,
  self-hosted runners, and deployment credentials in the build job.
- The public-tree audit checks size, secrets, executable URL schemes, inline
  scripts and event handlers, runtime network APIs, restrictive CSP markers,
  source maps, unsafe source links, and local development URLs.

## Not a security assessment

ControlCurrent does not fetch or test an application or browser. The offline
assessment can compare supplied response snapshots, reduce an HTML resource
inventory, bind assessed surfaces to a supplied opaque scope inventory,
recognise selected request context, and inspect a strict reduced WebAuthn
configuration. Neither a compatibility result nor an evidence
observation is a vulnerability finding, compliance result, or assurance that a
control is effective across an application. A report fingerprint detects edits
to retained content but is not a signature by itself. A verified attestation
authenticates the matching signed statement, configured signer identity, and
reduced inventory. It does not prove that the inventory source discovered every
route or state, that collection claims were truthful, that controls worked at
runtime, or that the signer was uncompromised.
