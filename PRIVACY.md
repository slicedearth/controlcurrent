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

Evidence bundles can also contain supplied HTML, bounded local resource bytes,
selected request headers, and reduced WebAuthn configuration. They remain in
page or process memory and are never uploaded or saved by ControlCurrent. The
HTML parser does not execute markup or load resources. Resource bodies are
decoded and hashed locally, then omitted from the reduced report. Reports also
omit HTML, resource paths and origins, CSP nonces and hashes, inline content,
cookie data, request targets, credentials, WebAuthn challenges, relying-party
identifiers, user identifiers, and credential identifiers.

Bundle labels and reduced WebAuthn selections remain in exported reports. Use
non-identifying labels and review a generated file before sharing it.
Expected-surface IDs and roles also remain in reports, along with the supplied
application ID, environment, revision, optional build ID, producer ID and
version, and capture timestamps. These must remain opaque and non-identifying.
Report comparison uses only reduced exports and stores neither report. Surface
control and composite requirements, source-model provenance, and a SHA-256
reduced-report fingerprint also remain in the export. The fingerprint covers
the canonical reduced report and its identity claims, not raw HTML, resource
bytes, nonce or digest values, cookie identities, request targets, or WebAuthn
identifiers. It does not authenticate who supplied those claims.

Evidence-policy evaluations contain the reduced report fingerprint, evidence
identity, pinned model provenance, the policy profile, freshness calculations,
attestation state, bounded verified certificate issuer and URI identity when
present, decisions, and exception reasons. Complete Sigstore bundles,
certificates, transparency entries, TUF metadata, and dependency diagnostics do
not enter the reduced evaluation. Use non-identifying identifiers and exception
reasons, and review evaluation files before sharing.

Attestation verification is a CLI-only operation. It reads a user-supplied
bundle in process memory, creates a temporary trust cache from the dependency's
packaged TUF seed, disables live refresh, and removes that cache after the
invocation. The static website neither receives nor verifies a bundle.

## Source data

The compatibility dataset contains public technical facts from MDN BCD and Web
Platform Features and no visitor or target information.

## Deletion

Use **Clear saved profile** in the planner or clear the site's storage in the
browser. There is no application-side server copy.
