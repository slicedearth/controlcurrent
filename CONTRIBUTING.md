# Contributing

Contributions should preserve ControlCurrent's narrow security-compatibility
scope, static architecture, source provenance, and privacy boundary.

## Before changing a control

Document:

- the security problem the control addresses;
- what it does not establish;
- exact BCD paths;
- whether every path or any path is required;
- specification links;
- prerequisites and fallback posture;
- source qualifications that must remain visible.

Do not infer compatibility from a related API when BCD cannot support the
intended claim. Use an unsupported mapping instead.

## Verification

Run:

```sh
npm ci
npm run verify
npm run test:e2e
git diff --check
```

Ordinary tests must use committed fixtures or the locked local BCD package.
They must not depend on a live service.

## Source updates

BCD package updates require review of:

- release and schema changes;
- every selected path;
- generated change events;
- licensing and attribution;
- dependency audit;
- unit, build, browser, accessibility, and public-tree checks.

Do not combine a broad catalogue redesign with a source update unless the
changes cannot be reviewed independently.

## Reports and language

Use neutral compatibility language. A source-data correction is not
automatically a browser regression or fix. A new qualification is not proof of
insecurity. A supported control is not proof of correct application
configuration.
