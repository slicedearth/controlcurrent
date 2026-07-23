# Architecture

## System boundary

ControlCurrent is a static security-compatibility application. Its locked source
dependencies are `@mdn/browser-compat-data` for browser-specific support
statements and `web-features` for exact feature associations and Baseline
adoptability context. A separate project-authored registry maps controls to
exact Web Platform Tests suite paths at a pinned reviewed revision.

```text
package-lock.json
      |
      +--> @mdn/browser-compat-data
      |
      +--> web-features
      |
      v
fixed selected-path importer
      |
      +--> schema validation
      +--> explicit bounds
      +--> schema fingerprint
      |
      v
data/selected-bcd.json
      |
      +--> control catalogue
      |          |
      |          v
      |   profile evaluation
      |
      +--> previous selected subset
                 |
                 v
          immutable change events
                 |
                 v
           static Astro build

pinned WPT revision
      |
      v
exact suite-path registry
      |
      +--> pinned source links
      +--> current wpt.fyi links
      +--> per-control evidence limits
      |
      v
static Astro build
```

The browser receives only static HTML, CSS, JavaScript, and the selected data
bundled by the build. There is no runtime source request.

## Source selection

The catalogue owns every requested BCD path. The generator:

1. loads the exact packages selected by the lockfile;
2. validates package versions and the BCD timestamp;
3. resolves each path through own properties only;
4. requires a `__compat` statement;
5. retains nine explicit desktop and mobile browser families;
6. associates only WebDX features that explicitly declare the selected BCD path;
7. validates bounded source fields;
8. retains bounded release metadata for explicit version choices;
9. emits canonical JSON and a structural schema fingerprint.

Prototype-related segments and excessive path depth are refused.

## Catalogue

The versioned catalogue separates project-authored security guidance from BCD
facts. A control contains:

- stable identity and category;
- threat classes and explicit non-claims;
- prerequisites and fallback;
- mapping state;
- exact BCD paths;
- `all` or `any` combination rule;
- specification links.

Unsupported mappings remain first-class catalogue entries. They do not produce a
guessed support result.

## Evaluation

Feature evaluation preserves:

- multiple support statements;
- exact, imprecise, unknown, false, and removed support versions;
- last-supported versions;
- partial implementation;
- flags;
- prefix and alternative name;
- bounded notes.

Control evaluation combines path outcomes according to the catalogue. Profile
evaluation applies the same calculation independently to each selected browser
minimum. Baseline status is displayed as secondary adoptability evidence and
does not alter a browser-specific compatibility outcome.

## Client boundary

The profile planner imports the selected data and pure evaluator into a bundled
client module. It creates result DOM nodes with `textContent`; it does not
insert source data through `innerHTML`.

The planner does not use:

- `navigator.userAgent`;
- browser feature detection;
- network fetches;
- server storage;
- market share.

Local persistence is opt-in and limited to one schema-versioned key.

## Offline assurance boundary

The response-header inspector accepts at most 64 KiB and 256 lines. It rejects
folded headers, request credentials, invalid names, excessive duplicate values,
and future contract versions. Recognised policy parsers emit one bounded
finding per catalogue control.

The inspector:

- makes no URL or network request;
- stores no input;
- renders findings with `textContent`;
- omits raw header values, cookie names, and cookie values from reports;
- distinguishes observed, not observed, invalid, report-only, inconclusive, and
  not evaluated states;
- evaluates CSP source expressions only through applicable directive fallback
  chains and does not merge multiple enforced policies optimistically;
- evaluates only the final response block when a redirect-style paste contains
  more than one HTTP status line.

Controls that require HTML, DOM, request, WebAuthn, or runtime evidence remain
`not_evaluated`.

## Evidence-bundle boundary

The evidence-bundle path combines up to 16 response snapshots, 16 HTML
documents, 32 request snapshots, and 16 reduced WebAuthn configurations. Its
dependency direction is:

```text
bounded local inputs
      |
      +--> response-header assurance
      +--> parse5 HTML tree without execution or fetch
      +--> selected Sec-Fetch-* request reduction
      +--> strict reduced WebAuthn configuration
      |
      v
per-surface redacted reports
      |
      v
control-level consistency merge
      |
      v
project-authored composite candidates
```

The HTML parser retains only counts, recognised integrity algorithms, parse
error counts, and relative/absolute/other reference counts. It never serialises
resource locations or page content into the report. Request inspection refuses
credential fields and emits only selected Fetch Metadata values. WebAuthn input
accepts no challenge, relying-party identifier, user identifier, or credential
identifier.

Composite candidates are deterministic derived guidance. They do not change
BCD compatibility outcomes and do not claim browser execution, resource hash
matching, server-side enforcement, ceremony success, or complete route
coverage.

## Conformance evidence boundary

`src/wpt-evidence.ts` covers every catalogue control exactly once. Mapped
controls identify bounded exact suite paths. Unmapped controls carry an
explicit reason and never inherit a nearby suite.

Pinned repository links make the mapping review reproducible. Current wpt.fyi
links are navigational only: no result data, pass rate, test log, or browser
binary enters the build. The registry does not affect compatibility or offline
assurance outcomes.

## Change history

The first generated selected subset creates a baseline event. Later package or
catalogue updates compare the previous complete subset with the new subset and
append deterministic events. Event identifiers are content-derived. A build
does not invent history for BCD versions that were never retained.

`data/source-history.json` separately records every reviewed package pair and
selected structural fingerprint. It is append-only and bounded. Its timestamp
is the BCD package timestamp, not a claim about the exact time a reviewer or
browser changed state.

## Deployment

Astro produces directory-form static routes. GitHub Pages configuration is
enabled only in the manually dispatched Pages workflow. The site uses a
repository base path in GitHub Actions and root paths in local development.

A weekly read-only source review compares the locked BCD and Web Platform
Features packages with npm registry metadata. It fails visibly when a newer
version needs review, but cannot edit packages or data, open issues, commit,
push, or deploy. The manual dry run has the same no-write boundary.
