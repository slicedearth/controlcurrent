# Legal and licensing

## Project code

ControlCurrent source code is licensed under the MIT License.

## MDN Browser Compatibility Data

The selected compatibility subset is transformed from:

- **Source:** MDN Browser Compatibility Data
- **Repository:** <https://github.com/mdn/browser-compat-data>
- **Package:** `@mdn/browser-compat-data`
- **Licence:** CC0 1.0 Universal

The project records the exact package version and timestamp in every selected
snapshot. Attribution is retained as a source-quality practice even though CC0
does not require it.

ControlCurrent does not copy MDN article prose or diagrams. Project-authored
security explanations link to MDN feature pages and primary specifications.

## Web Platform Features

Selected Baseline metadata is transformed from:

- **Source:** Web Platform Features
- **Repository:** <https://github.com/web-platform-dx/web-features>
- **Package:** `web-features`
- **Licence:** Apache License 2.0

ControlCurrent retains the exact package version and only the feature identity,
compatibility-path association, Baseline status, and associated dates required
for its selected paths. It does not reproduce the complete package.

## Specifications

Specifications remain subject to the terms of their respective publishers.
Links do not incorporate specification text into the project licence.

## Web Platform Tests

ControlCurrent includes project-authored factual mappings to suite paths in:

- **Source:** Web Platform Tests
- **Repository:** <https://github.com/web-platform-tests/wpt>
- **Reviewed revision:** `af38980d2fcd74af19a226f5f651051cc15940ed`
- **Licence:** BSD 3-Clause

The project does not copy WPT source, test bodies, expectations, or wpt.fyi
result data. It retains exact suite paths, pinned source links, current
dashboard links, and original scope and limitation statements. Links do not
incorporate WPT or dashboard content into the project licence.

## Client-side HTML parsing

The offline evidence inspector uses:

- **parse5:** MIT, copyright Ivan Nikulin;
- **entities:** BSD 2-Clause, copyright Felix Böhm.

The applicable copyright and licence notices are reproduced in `NOTICE`.
ControlCurrent uses the parser only to create a bounded, non-executing syntax
tree from user-supplied markup. It does not load resources or redistribute
submitted HTML.

## Evidence-attestation verification

The CLI-only verifier uses:

- **@sigstore/bundle:** Apache License 2.0;
- **@sigstore/tuf:** Apache License 2.0;
- **@sigstore/verify:** Apache License 2.0;
- their locked transitive dependencies under the licences recorded in
  `package-lock.json`.

The libraries parse and verify user-supplied Sigstore bundles against the
packaged public-good trust snapshot. They are not bundled into the static
website. ControlCurrent does not copy Sigstore documentation, issue
certificates, sign statements, obtain OIDC tokens, or publish transparency-log
entries.

## Licence separation

The MIT licence applies to ControlCurrent source code. It does not relicense:

- the selected BCD-derived data;
- selected Web Platform Features metadata;
- linked WPT source and result data;
- linked MDN documentation;
- linked standards;
- dependency source code.

## Data redistribution

The public repository retains a compact selected subset rather than the
complete upstream packages. The subset includes only fields needed for
attribution, support calculations, Baseline context, release selection, source
review, and change history.
