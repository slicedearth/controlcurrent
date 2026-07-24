# Policy as code

ControlCurrent policy profiles turn an explicit browser baseline and a selected
set of required controls into a deterministic CI decision. They do not inspect
an application or certify its security.

## Profile contract

Profiles are bounded JSON documents. The committed
`examples/policy-profile.json` file is a complete example.

Required fields:

- `schemaVersion`: currently `1`;
- `name`: a human-readable policy name;
- `baselines`: one explicit minimum version per selected browser;
- `requiredControls`: catalogue control identifiers;
- `rules`: treatment of qualified, unknown, and unsupported results;
- `exceptions`: deliberate, expiring review records.

Unqualified availability passes. Recorded unavailability and removed support
always fail. Qualified, unknown, and unsupported outcomes follow the configured
rules.

## Website policy builder

After checking a browser plan, the website can turn the result into the same
versioned policy contract used by the command line. The visitor chooses required
controls, decision rules, and optional expiring exceptions. Processing remains
local.

The website exports:

- canonical policy JSON for review or version control; and
- a self-contained printable HTML decision record containing the browser
  minimums, source versions, rules, exceptions, fallbacks, detailed results,
  and explicit limitations.

The report loads no script, image, font, analytics, or remote resource. It
records a browser-policy decision and is not a production security certificate.

## Exceptions

An exception must identify:

- one control;
- one or more outcomes;
- optional browser scope;
- a substantive reason;
- an expiry date.

An active exception converts a failure into a visible review result. It never
creates an unqualified pass. Expired exceptions remain visible and stop
affecting the policy decision.

## Commands

Evaluate a policy:

```sh
npm run cli -- check examples/policy-profile.json --as-of 2026-07-23
```

Treat review findings as a failing CI result:

```sh
npm run cli -- check examples/policy-profile.json --strict-review
```

Emit canonical JSON:

```sh
npm run cli -- check examples/policy-profile.json --json
```

Calculate the earliest recorded releases satisfying selected controls:

```sh
npm run cli -- minimum content-security-policy,referrer-policy \
  --browsers chrome,firefox
```

Qualified support is excluded by default. Add `--allow-qualified` only when the
consumer explicitly accepts source-recorded qualifications.

## Exit codes

- `0`: the policy is satisfied under the selected strictness;
- `1`: one or more findings fail the policy;
- `2`: input, source, or command validation failed.

The default current date affects exception expiry. Supply `--as-of` when a
reproducible historical decision is required.

## Deployment evidence policy

Browser-support policy and deployment-evidence policy are separate contracts.
`examples/evidence-policy.json` defines the latter. It can require:

- an optional or mandatory Sigstore evidence attestation from one exact
  certificate issuer and URI identity;
- an optional or mandatory opaque scope inventory, allowed source kinds,
  completeness, exact semantic fingerprint, maximum age, and exclusion limit;
- exact analyser and catalogue versions;
- an exact BCD version when the consumer wants source pinning;
- an exact application ID and an allowed deployment environment;
- an exact revision when the gate is tied to one release candidate;
- an allowed producer kind and, optionally, a build identifier;
- a maximum capture duration and maximum evidence age;
- specific opaque surfaces and semantic roles;
- evidence kinds expected for each surface;
- controls and project-authored composites required for each surface;
- treatment of missing, report-only, inconclusive, unevaluated, and
  composite-review outcomes;
- bounded exceptions tied to one surface and target.

Generate the stable semantic fingerprint for an independently produced opaque
inventory before placing it in policy:

```sh
npm run cli -- reduce-scope-inventory examples/scope-inventory.json --json
```

The profile is evaluated against an exported schema 7 reduced report, not
against raw evidence:

```sh
npm run cli -- check-evidence examples/evidence-policy.json report.json \
  --as-of 2026-07-23
```

Add `--strict-review` to return exit code 1 for both `review` and `fail`
decisions. Use `--json` for a deterministic machine-readable result.

The policy is intentionally independent of the evidence bundle. A producer
cannot remove a required control, composite, or evidence kind from its bundle
manifest to weaken the consumer's gate. The evaluator recomputes the report
fingerprint before applying policy. Model, application, environment, revision,
producer, build-identity, inventory, freshness, and capture-duration mismatches
fail. The inventory's included IDs must already match the report's assessed
surfaces exactly. Without a verified attestation, identity, inventory, and
timestamps remain unauthenticated producer assertions. Even with one, they
remain signed claims rather than independent collection facts.

Evidence-policy schema 4 can require a Sigstore DSSE attestation. The
certificate issuer and URI identity are owned by the independent policy rather
than the report or bundle. Use `create-attestation-statement` to emit the
canonical in-toto statement and `verify-evidence` to verify an externally
signed bundle before policy evaluation:

```sh
npm --silent run cli -- create-attestation-statement report.json > statement.json

npm run cli -- verify-evidence examples/evidence-policy.json report.json \
  report.sigstore.json --as-of 2026-07-23 --strict-review
```

`check-evidence` supplies an explicit `absent` attestation result. That passes
only when the policy sets `attestation.required` to `false`. A supplied invalid,
unsupported, mismatched, or unverifiable attestation always fails.

Active surface exceptions convert a matching negative finding to `review`,
never `pass`; they cannot exempt attestation, inventory, identity, or freshness.
Expired exceptions remain visible and stop affecting the decision. See
[`attested-evidence.md`](attested-evidence.md) for the trust and signing
boundaries.
