<p align="center">
  <img src="public/logo.svg" width="520" alt="ControlCurrent">
</p>

**Which browser security controls can you safely deploy today?**

ControlCurrent is a security-specific browser compatibility and deployment
planning application. It maps a curated catalogue of defensive browser controls
to exact paths in MDN Browser Compatibility Data (BCD), preserves support
qualifications, and evaluates explicit browser minimums entirely in the browser.

It is not a general compatibility index and it does not scan websites.

## What it provides

- A versioned catalogue of 30 browser security and privacy controls
- Exact BCD path mappings and explicit unsupported mappings
- Nine desktop and mobile browser families normalised explicitly
- Exact WebDX feature associations and Baseline adoptability context
- Exact Web Platform Tests suite mappings pinned to a reviewed source revision
- Preservation of partial support, flags, prefixes, alternative names, notes,
  removals, and unknown source values
- A local deployment-profile planner with no browser detection or telemetry
- Version-controlled policy profiles with expiring, visible exceptions
- A local CLI for policy checks, explanations, and minimum-baseline calculation
- An offline response-header inspector with redacted evidence and no URL fetch
- A bounded evidence bundle for route variation, CSP-to-markup correlation,
  local SRI byte verification, Fetch Metadata request context, and reduced
  WebAuthn configuration
- An optional privacy-minimised scope inventory that reduces up to 256 opaque
  entries to a semantic fingerprint, counts, provenance, and completeness state
- An expected-surface manifest bound exactly to the inventory's included
  entries, distinguishing missing evidence from explicitly excluded scope and
  declaring which controls and composites apply to each assessed surface
- Subject-identified reduced reports with application, environment, revision,
  build, producer, and capture-window context inside deterministic SHA-256
  fingerprints
- Detail-aware reduced-report comparison with explicit model compatibility,
  regressions, resolutions, other changes, and incomparable evidence
- An independent evidence-policy profile and CI exit code with identity,
  scope-inventory fingerprint, completeness, producer, capture-duration,
  freshness, and expiring-exception requirements
- Optional CLI-only Sigstore attestation verification that binds an exact
  certificate identity to the reduced report fingerprint and deployment
  identity
- Project-authored composite checks that keep candidate deployment recipes
  separate from browser support and production assurance
- Current-channel compatibility matrix and browser release views
- Deterministic selected-source snapshots, change events, and source history
- Static pages suitable for GitHub Pages
- Original deployment guidance, fallbacks, and limitations

Compatibility is not configuration assurance. A supported feature can still be
configured incorrectly, implemented with defects, or insufficient for an
application's threat model. The optional offline assessment can establish that
recognised policy syntax or reduced configuration evidence was present in
supplied snapshots, but it does not certify effectiveness across an
application.

## Data source

The current release uses `@mdn/browser-compat-data` 8.0.7 and `web-features`
3.34.1. The selected snapshot contains only the 36 BCD paths required by the
current catalogue, bounded release metadata for nine browser families, and
exact Baseline associations declared for those paths.

The conformance-evidence registry maps 28 controls to exact Web Platform Tests
suite paths at revision `af38980d2fcd74af19a226f5f651051cc15940ed`.
HSTS and HttpOnly remain explicitly unmapped. ControlCurrent links to current
wpt.fyi results but does not ingest or simplify pass rates.

MDN Browser Compatibility Data is published under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Web
Platform Features is published under
[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0). ControlCurrent source
code is licensed separately under MIT. See [NOTICE](NOTICE) and
[legal and licensing](docs/legal-and-licensing.md).

## Privacy boundary

The deployed site has:

- no account or authentication;
- no analytics, advertising, or tracking;
- no browser fingerprinting or user-agent detection;
- no runtime API or application database;
- no website scanning;
- no URL fetch in the offline header inspector;
- no HTML execution or resource loading in evidence-bundle analysis;
- no automatic profile persistence.

Sigstore verification is CLI-only. It uses a temporary cache and the trust
snapshot packaged with the locked TUF dependency, with live refresh disabled.
The static website never receives an attestation bundle.

A supplied scope inventory is reduced in memory. The public report retains its
kind, completeness, generation time, counts, and semantic fingerprint, but not
the opaque inventory entries or exclusion reasons.

A profile is saved to one bounded, versioned `localStorage` key only after the
visitor selects **Save locally**. JSON exports are generated in the browser.

## Local development

Requirements:

- Node.js 24.15 or later supported releases
- npm 11.17 or 12

Install and verify:

```sh
npm ci
npm run verify
```

Start the local site:

```sh
npm run dev
```

The ordinary test and build paths do not access live services.

## Updating source data

Source updates are deliberate:

1. Review the new BCD or Web Platform Features release, schema changes,
   licences, and selected mappings.
2. Update the exact package version in `package.json`.
3. Run `npm install` with the repository's npm version.
4. Run `npm run generate`.
5. Inspect `data/selected-bcd.json` and `data/change-events.json`.
6. Inspect the appended `data/source-history.json` entry.
7. Run the complete verification suite.

The weekly source-review workflow is read-only. It reports when either locked
source package is behind npm registry metadata and does not edit files, open
issues, commit, push, or deploy.

`npm run generate:check` fails when the locked package and committed selected
snapshot differ. A missing configured path fails generation rather than
silently becoming supported.

## Commands

| Command                  | Purpose                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `npm run generate`       | Regenerate the selected BCD subset and append deterministic changes |
| `npm run generate:check` | Verify the selected subset matches the locked package               |
| `npm run lint`           | Run strict ESLint checks                                            |
| `npm run format:check`   | Verify repository formatting                                        |
| `npm run typecheck`      | Type-check source, tools, and tests                                 |
| `npm run check`          | Run Astro diagnostics                                               |
| `npm run cli -- ...`     | Evaluate policies, inspect evidence, and compare reduced reports    |
| `npm test`               | Run fixture-driven unit tests with coverage                         |
| `npm run build`          | Verify the source snapshot and build the static site                |
| `npm run audit:public`   | Inspect the public build for bounds and prohibited content          |
| `npm run audit:language` | Enforce ControlCurrent naming and Australian-English terminology    |
| `npm run test:e2e`       | Run local browser and accessibility tests                           |
| `npm run verify`         | Run the non-browser verification suite                              |

Inspect a redacted local header snapshot:

```sh
npm run cli -- inspect-headers examples/headers.example.json --json
```

The command exits non-zero for invalid or ambiguous header evidence. Add
`--fail-missing` when a policy gate should also fail for controls not observed
in that one response.

Inspect a bounded multi-surface evidence bundle:

```sh
npm run cli -- inspect-bundle examples/evidence-bundle.example.json --json
```

Reduce an independently produced opaque scope inventory and obtain the exact
fingerprint for evidence policy:

```sh
npm run cli -- reduce-scope-inventory examples/scope-inventory.json --json
```

Compare two exported reduced reports and fail only for classified regressions:

```sh
npm run cli -- compare-reports before.json after.json --fail-regression --json
```

Evaluate an exported report against an independently maintained evidence
policy:

```sh
npm run cli -- check-evidence examples/evidence-policy.json report.json \
  --as-of 2026-07-23 --strict-review
```

Create the canonical in-toto statement for external signing:

```sh
npm --silent run cli -- create-attestation-statement report.json > statement.json
```

Verify an externally signed Sigstore DSSE bundle and then apply evidence policy:

```sh
npm run cli -- verify-evidence examples/evidence-policy.json report.json \
  report.sigstore.json --as-of 2026-07-23 --strict-review
```

The bundle command exits non-zero for invalid or inconsistent evidence. Add
`--fail-missing` to include absent controls, or `--strict-composites` to require
each applicable project-authored composite candidate to avoid a review or gap
state. Controls outside every declared surface policy are `not_applicable`, not
failures. Evidence policy requirements come from a separate file, so weakening
the submitted bundle cannot weaken the CI gate. The example gate also requires
the expected inventory fingerprint, complete scope, application, environment,
revision, CI producer, build ID, capture duration, and maximum inventory and
evidence age. These are fingerprinted producer claims, not authenticated
provenance unless the separate attestation verifier accepts the signed
statement and exact policy-selected signer. A signed complete inventory still
does not prove that its source discovered every production route or state.

## Architecture

```text
Locked BCD and Web Platform Features packages
                    |
                    v
        exact selected-path resolver
                    |
                    v
 validated compatibility and Baseline subset
          |                         |                 pinned WPT revision
          v                         v                         |
  versioned catalogue          change events                 v
          |                                          evidence registry
          +----------------------------+---------------------+
          |
          v
 browser-policy evaluation
          |
          v
       static Astro site

opaque scope inventory plus local response, HTML,
request, resource, and WebAuthn inputs
          |
          v
 non-executing bounded evidence reduction
          |
          v
inventory fingerprint plus surface-scoped findings
          and composite candidates
          |
          v
subject-identified, provenance-stamped reduced report
          |
          +--> compatible detail-aware comparison
          |
          +--> independent evidence-policy gate
          |
          +--> canonical in-toto statement
                         |
                         v
                external DSSE signing
                         |
                         v
             CLI-only Sigstore verification
```

The selected data is a build input. The deployed site makes no runtime request
for compatibility data.

## Documentation

- [Architecture](docs/architecture.md)
- [Data contract](docs/data-contract.md)
- [Policy as code](docs/policy-as-code.md)
- [Scope inventory](docs/scope-inventory.md)
- [Attested evidence](docs/attested-evidence.md)
- [Conformance evidence](docs/conformance-evidence.md)
- [Methodology](docs/methodology.md)
- [Threat model](docs/threat-model.md)
- [Dependency policy](docs/dependency-policy.md)
- [Legal and licensing](docs/legal-and-licensing.md)
- [Engineering case study](docs/engineering-case-study.md)
- [Security policy](SECURITY.md)
- [Privacy policy](PRIVACY.md)

## Corrections

Catalogue mappings, calculations, accessibility issues, and source
interpretations can be reported through the repository issue tracker. Reports
should identify the control, browser baseline, BCD version and path, expected
result, and supporting primary source. Source-data problems should also follow
the MDN BCD contribution process.
