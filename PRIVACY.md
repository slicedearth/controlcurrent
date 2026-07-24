# Privacy

ControlCurrent is designed to avoid collecting visitor or target data.

## Information collected

The deployed application collects no information. It has no:

- analytics or advertising;
- user account;
- form submission;
- application server;
- runtime API;
- browser fingerprinting;
- user-agent detection;
- website scanner;
- telemetry endpoint.

Static hosting infrastructure may produce its own ordinary delivery logs. Those
logs are outside ControlCurrent's application architecture and are not consumed
by the project.

The separate CLI includes an opt-in authorised collector. It is not reachable
from the deployed site and performs no collection unless a local operator
supplies a fixed manifest, a private output path and the explicit
`--confirm-authorised-target` flag.

## Deployment profiles

Profile calculations run in the browser.

By default, a profile exists only in page memory. Selecting **Save locally**
writes the profile to one key:

```text
controlcurrent.profile.v1
```

The value is:

- versioned;
- limited to 4,096 bytes;
- limited to nine explicit browser minimums;
- never sent to a server;
- never included in analytics;
- clearable from the planner.

Future-version values are left untouched and refused rather than migrated
silently. Invalid and oversized values are ignored.

## Exports

JSON exports are generated locally from the displayed calculation. They contain
the selected browser profile, BCD version, catalogue version, and calculated
results. They contain no visitor identifier or browser telemetry.

## Offline deployment assessment

Pasted response headers remain in page memory. ControlCurrent does not fetch a
URL, upload the text, save it to local storage, or include raw header values in
the calculated report. Clear removes the textarea and report from the page.

Request credentials such as `Authorization` and `Cookie` are refused. A
`Set-Cookie` field can be parsed to count security attributes, but reports omit
cookie names and values. Replace values and other secrets with `REDACTED`
before pasting because the browser still has to hold the input temporarily to
parse it.

Evidence bundles can also contain an opaque scope inventory, supplied HTML,
bounded local resource bytes, selected request headers, and reduced WebAuthn
configuration. They remain in page or process memory and are never uploaded or
saved by ControlCurrent. The
HTML parser does not execute markup or load resources. Resource bodies are
decoded and hashed locally, then omitted from the reduced report. Reports also
omit HTML, resource paths and origins, CSP nonces and hashes, inline content,
cookie data, request targets, credentials, WebAuthn challenges, relying-party
identifiers, user identifiers, and credential identifiers.

Bundle labels and reduced WebAuthn selections remain in exported reports. Use
non-identifying labels and review a generated file before sharing it.
Expected-surface IDs and roles also remain in reports, along with the supplied
application ID, environment, revision, optional build ID, producer ID and
version, and capture timestamps. Scope inventory entry IDs and exclusion reasons
do not remain; reports retain only the inventory name, kind, completeness,
generation time, counts, and semantic fingerprint. All retained values must
remain opaque and non-identifying.
Report comparison uses only reduced exports and stores neither report. Surface
control and composite requirements, source-model provenance, and a SHA-256
reduced-report fingerprint also remain in the export. The report fingerprint
covers the canonical reduced report, its identity claims, and the reduced
inventory. The inventory fingerprint represents sorted opaque entry semantics
without retaining them. Neither fingerprint contains raw HTML, resource bytes,
nonce or digest values, cookie identities, request targets, or WebAuthn
identifiers. Neither authenticates who supplied those claims.

Evidence-policy evaluations contain the reduced report and scope fingerprints,
evidence identity, pinned model provenance, the policy profile, freshness
calculations, attestation state, bounded verified certificate issuer and URI
identity when present, decisions, and exception reasons. Complete Sigstore bundles,
certificates, transparency entries, TUF metadata, and dependency diagnostics do
not enter the reduced evaluation. Use non-identifying identifiers and exception
reasons, and review evaluation files before sharing.

The standard local export filenames are ignored at the repository root.
`npm run audit:repository` also refuses tracked files with those names and
scans the bounded public JSON directories for credential-like values, personal
email addresses, and private-network locations. Store real assessment material
under the ignored `private-data/` directory rather than forcing an export into
Git history.

Authorised collection manifests contain a target origin and exact paths, so
they are private operational inputs even when the target is public. Generated
bundles do not add those locations as dedicated metadata, redact redirect
locations and cookie values, and retain only opaque surface IDs, bounded
response context, headers, and optional HTML needed for local reduction. Those
headers and HTML can still contain locations. The CLI refuses authenticated
collection and does not carry cookies or credentials. Manifests and bundles
should remain under ignored private storage; only a separately reviewed reduced
report should be considered for sharing.

Attestation verification is a CLI-only operation. It reads a user-supplied
bundle in process memory, loads the reviewed `trusted_root.json` target directly
from the lockfile-pinned `@sigstore/tuf` package, verifies its project-pinned
SHA-256 digest, and performs no TUF or network refresh. The static website
neither receives nor verifies a bundle.

The static site refuses interactive use when it detects that it is embedded in
a frame. This is defence in depth rather than a substitute for a response-header
`frame-ancestors` policy. On a shared hosting origin, enter only deliberately
redacted examples; use a dedicated origin before handling organisation-specific
evidence.

## Source data

The compatibility dataset contains public technical facts from MDN BCD and Web
Platform Features and no visitor or target information.

## Deletion

Use **Clear saved profile** in the planner or clear the site's storage in the
browser. There is no application-side server copy.
