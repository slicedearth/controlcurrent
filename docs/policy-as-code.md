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
