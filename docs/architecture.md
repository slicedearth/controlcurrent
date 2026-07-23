# Architecture

## System boundary

ControlCurrent is a static security-compatibility application. Its only primary
data dependency is the locked `@mdn/browser-compat-data` package used during
development and build verification.

```text
package-lock.json
      |
      v
@mdn/browser-compat-data
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
```

The browser receives only static HTML, CSS, JavaScript, and the selected data
bundled by the build. There is no runtime source request.

## Source selection

The catalogue owns every requested BCD path. The generator:

1. loads the exact package selected by the lockfile;
2. validates package version and timestamp;
3. resolves each path through own properties only;
4. requires a `__compat` statement;
5. retains only Chrome, Edge, Firefox, and Safari statements;
6. validates bounded source fields;
7. retains bounded release metadata for explicit version choices;
8. emits canonical JSON and a structural schema fingerprint.

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
minimum.

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

## Change history

The first generated selected subset creates a baseline event. Later package or
catalogue updates compare the previous complete subset with the new subset and
append deterministic events. Event identifiers are content-derived. A build
does not invent history for BCD versions that were never retained.

## Deployment

Astro produces directory-form static routes. GitHub Pages configuration is
enabled only in the manually dispatched Pages workflow. The site uses a
repository base path in GitHub Actions and root paths in local development.

No scheduled update or write-capable data workflow is present.
