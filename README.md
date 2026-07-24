<p align="center">
  <img src="public/logo.svg" width="520" alt="ControlCurrent">
</p>

<p align="center">
  <a href="https://slicedearth.github.io/controlcurrent/"><strong>Open the live application</strong></a>
  ·
  <a href="https://slicedearth.github.io/controlcurrent/methodology/">How it works</a>
  ·
  <a href="https://slicedearth.github.io/controlcurrent/limitations/">Limitations</a>
</p>

<p align="center">
  <a href="https://github.com/slicedearth/controlcurrent/actions/workflows/ci.yml"><img src="https://github.com/slicedearth/controlcurrent/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <a href="https://github.com/slicedearth/controlcurrent/actions/workflows/codeql.yml"><img src="https://github.com/slicedearth/controlcurrent/actions/workflows/codeql.yml/badge.svg?branch=main" alt="CodeQL status"></a>
  <a href="https://github.com/slicedearth/controlcurrent/actions/workflows/pages.yml"><img src="https://github.com/slicedearth/controlcurrent/actions/workflows/pages.yml/badge.svg?branch=main" alt="GitHub Pages deployment status"></a>
</p>

# ControlCurrent

ControlCurrent helps web teams decide which browser security features they can
use without breaking the oldest browsers they still support.

Choose browser minimums such as Chrome 120, Firefox 115 and Safari 17. The site
then shows which security features:

- should work across that browser plan;
- work with a known limitation;
- are not supported; or
- do not have enough dependable browser data for a firm answer.

The result is planning evidence, not a security grade. ControlCurrent does not
claim that a website is secure just because a browser supports a feature.

## Who it is for

ControlCurrent is most useful for:

- web developers choosing security headers and browser APIs;
- security engineers reviewing browser-support policy;
- architects documenting why a fallback is still required;
- delivery teams preparing a browser-support change; and
- students learning how browser compatibility affects security controls.

The public website is not a live scanner, penetration-testing tool, compliance
checker or certification service.

## What you can do on the website

### Plan browser support

- Choose minimum versions for nine desktop and mobile browser families.
- Import explicit minimums from a local `.browserslistrc` or `package.json`.
- Search and filter the result, including a blockers-only view.
- Save a browser plan locally or export it as JSON.
- Opt in to remembering one result so a later data update can be compared.
- Compare an exported result with a newer result from the same source version.

### Record an engineering decision

- Choose the security features your project requires.
- Decide whether known limitations, unknown data and unmapped features require
  review or fail the policy.
- Add visible, expiring exceptions with a reason.
- Import an existing policy for local editing and re-evaluation.
- Search and filter the individual policy findings.
- Export the policy as deterministic JSON.
- Export a self-contained, printable HTML decision report with canonical
  record fingerprints.
- Generate a command-line hand-off for continuous-integration checks.
- Attach a privacy-reduced evidence result as a separate lane in a fingerprinted
  two-part decision packet.

### Explore the source data

- Read plain-language pages for 30 browser security and privacy features.
- Compare current browser support in a matrix.
- See exact source mappings, qualifications and known data gaps.
- Review source changes and pinned Web Platform Tests links.
- Find the oldest browser versions that support a selected group of features.

### Review evidence locally

- Paste a redacted HTTP response-header snapshot.
- Choose or drop a bounded JSON evidence file from an authorised collection.
- Review page, header, request, passkey and local resource evidence without
  executing supplied markup or loading its resources.
- Export a privacy-reduced result that omits the raw evidence.

The advanced command-line workflow can collect bounded, unauthenticated
same-origin evidence from a website you are authorised to assess. It cannot be
started from the public website.

## What ControlCurrent cannot prove

Browser support does not establish that:

- a feature is configured correctly;
- the whole application uses it consistently;
- the browser has no implementation defect;
- the selected control fits the application’s threat model;
- every important page was included in supplied evidence; or
- a production website is secure or compliant.

Evidence review can show that recognised settings were present in a supplied
snapshot. It cannot prove complete runtime enforcement. The
[limitations page](https://slicedearth.github.io/controlcurrent/limitations/)
states how far each part of the tool can go.

## Privacy

The deployed site is static. It has no account system, analytics, advertising,
application database or public scanning endpoint.

Browser plans, imported configuration, evidence files, policy drafts and
exports are processed on the visitor’s device. A plan is saved only after
selecting **Save locally**. Remembering the latest result is a separate opt-in
choice. Both can be deleted from the planner.

The website does not detect the visitor’s browser version. It uses the browser
minimums the visitor enters. See [PRIVACY.md](PRIVACY.md) for the complete
boundary.

## Data and licensing

The current selected dataset is generated from:

- `@mdn/browser-compat-data` 8.0.7;
- `web-features` 3.34.1; and
- exact Web Platform Tests suite paths pinned to revision
  `af38980d2fcd74af19a226f5f651051cc15940ed`.

Only the bounded fields needed by the catalogue are included in the static
site. Compatibility data is a build input; the deployed planner makes no
runtime request for it.

Source qualifications are kept rather than simplified into a misleading
supported/not-supported flag. An absent or unsuitable mapping remains explicit.
See [legal and licensing](docs/legal-and-licensing.md) and the deployed
third-party notices for attribution and licence details.

## Run locally

Requirements:

- Node.js 24.15 or a compatible later supported release;
- npm 11.17–12; and
- dependencies installed from the committed lockfile.

```bash
npm ci
npm run dev
```

The local development server prints its URL. The static production build is:

```bash
npm run build
npm run preview
```

## Verification

The main local verification command runs linting, formatting checks, strict
type checks, Astro checks, unit tests, repository and public-output audits,
the production build, and Australian-English checks:

```bash
npm run verify
```

Browser tests run separately:

```bash
npm run test:e2e
```

Ordinary tests use local fixtures and do not scan websites or depend on live
services.

## Advanced command-line use

The command-line tool supports policy checks, minimum-browser calculations,
private evidence reduction, bounded authorised collection and optional
signature verification. Start with:

```bash
npm run cli -- --help
```

Live collection requires an explicit confirmation flag and a fixed authorised
manifest. Raw collections can contain sensitive application details and must
remain outside the public repository. Read
[authorised collection](docs/authorised-collection.md) and
[deployment security](docs/deployment-security.md) first.

## Hosting

The public site is suitable for static GitHub Pages hosting. It needs no
runtime secret, server or database. Changes to `main` deploy only after the
complete CI workflow succeeds.

GitHub Pages does not apply the generated `_headers` file, so the current public
site relies on its restrictive meta Content Security Policy and framing guard.
A dedicated header-capable origin is recommended before using the interface
with organisation-specific evidence.

## Documentation

- [Architecture](docs/architecture.md)
- [Data contract](docs/data-contract.md)
- [Methodology](docs/methodology.md)
- [Policy as code](docs/policy-as-code.md)
- [Scope inventory](docs/scope-inventory.md)
- [Attested evidence](docs/attested-evidence.md)
- [Conformance evidence](docs/conformance-evidence.md)
- [Authorised collection](docs/authorised-collection.md)
- [Threat model](docs/threat-model.md)
- [Deployment security](docs/deployment-security.md)
- [Dependency policy](docs/dependency-policy.md)
- [Legal and licensing](docs/legal-and-licensing.md)
- [Engineering case study](docs/engineering-case-study.md)
- [Security policy](SECURITY.md)

## Corrections

Report catalogue mappings, calculation problems, accessibility issues or source
interpretations through the repository issue tracker. Include the security
feature, browser minimum, source version, expected result and supporting primary
source. Upstream data problems should also follow the relevant source project’s
correction process.
