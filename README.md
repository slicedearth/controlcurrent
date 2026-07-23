# ControlCurrent

**Which browser security controls can you safely deploy today?**

ControlCurrent is a security-specific browser compatibility and deployment
planning application. It maps a curated catalogue of defensive browser controls
to exact paths in MDN Browser Compatibility Data (BCD), preserves support
qualifications, and evaluates explicit browser minimums entirely in the browser.

It is not a general compatibility index and it does not scan websites.

## What it provides

- A versioned catalogue of 29 browser security and privacy controls
- Exact BCD path mappings and explicit unsupported mappings
- Nine desktop and mobile browser families normalised explicitly
- Exact WebDX feature associations and Baseline adoptability context
- Preservation of partial support, flags, prefixes, alternative names, notes,
  removals, and unknown source values
- A local deployment-profile planner with no browser detection or telemetry
- Version-controlled policy profiles with expiring, visible exceptions
- A local CLI for policy checks, explanations, and minimum-baseline calculation
- An offline response-header inspector with redacted evidence and no URL fetch
- Current-channel compatibility matrix and browser release views
- Deterministic selected-source snapshots, change events, and source history
- Static pages suitable for GitHub Pages
- Original deployment guidance, fallbacks, and limitations

Compatibility is not configuration assurance. A supported feature can still be
configured incorrectly, implemented with defects, or insufficient for an
application's threat model. The optional offline inspector can establish that
recognised policy syntax was present in one supplied response snapshot, but it
does not certify effectiveness across an application.

## Data source

The current release uses `@mdn/browser-compat-data` 8.0.7 and `web-features`
3.34.1. The selected snapshot contains only the 33 BCD paths required by the
current catalogue, bounded release metadata for nine browser families, and
exact Baseline associations declared for those paths.

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
- no automatic profile persistence.

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

| Command                  | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `npm run generate`       | Regenerate the selected BCD subset and append deterministic changes  |
| `npm run generate:check` | Verify the selected subset matches the locked package                |
| `npm run lint`           | Run strict ESLint checks                                             |
| `npm run format:check`   | Verify repository formatting                                         |
| `npm run typecheck`      | Type-check source, tools, and tests                                  |
| `npm run check`          | Run Astro diagnostics                                                |
| `npm run cli -- ...`     | Evaluate policies, explain controls, and calculate minimum baselines |
| `npm test`               | Run fixture-driven unit tests with coverage                          |
| `npm run build`          | Verify the source snapshot and build the static site                 |
| `npm run audit:public`   | Inspect the public build for bounds and prohibited content           |
| `npm run test:e2e`       | Run local browser and accessibility tests                            |
| `npm run verify`         | Run the non-browser verification suite                               |

Inspect a redacted local header snapshot:

```sh
npm run cli -- inspect-headers examples/headers.example.json --json
```

The command exits non-zero for invalid or ambiguous header evidence. Add
`--fail-missing` when a policy gate should also fail for controls not observed
in that one response.

## Architecture

```text
Locked BCD and Web Platform Features packages
                    |
                    v
        exact selected-path resolver
                    |
                    v
 validated compatibility and Baseline subset
          |                         |
          v                         v
  versioned catalogue          change events
          |
          v
 browser-policy evaluation
          |
          v
       static Astro site
```

The selected data is a build input. The deployed site makes no runtime request
for compatibility data.

## Documentation

- [Architecture](docs/architecture.md)
- [Data contract](docs/data-contract.md)
- [Policy as code](docs/policy-as-code.md)
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
