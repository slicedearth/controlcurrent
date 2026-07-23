# Data contract

## Selected snapshot

`data/selected-bcd.json` is a versioned canonical projection, not a source
mirror.

The root contract contains:

| Field                | Meaning                                            |
| -------------------- | -------------------------------------------------- |
| `schemaVersion`      | ControlCurrent selected-snapshot schema            |
| `bcdVersion`         | Locked BCD package version                         |
| `bcdTimestamp`       | BCD package build timestamp                        |
| `webFeaturesVersion` | Locked Web Platform Features package version       |
| `catalogueVersion`   | Project-authored mapping version                   |
| `schemaFingerprint`  | SHA-256 of the selected structural shape           |
| `browsers`           | Bounded release metadata for nine browser families |
| `controlMappings`    | Stable mapping state, rule, and selected paths     |
| `features`           | Exact selected BCD compatibility statements        |

## Feature statements

Each feature retains:

- exact path;
- source file;
- bounded description when present;
- MDN and specification URLs;
- source status fields;
- browser support statements.
- exact WebDX feature associations and Baseline status metadata.

Support statements retain:

- `version_added`;
- `version_removed`;
- `version_last`;
- prefix;
- alternative name;
- flags;
- implementation URL;
- partial implementation;
- bounded notes.

The current BCD schema uses strings and `false` for `version_added`. The
normaliser also has explicit behaviour for historic or fixture `true` and
`null` values so unknown semantics cannot become support accidentally.

## Bounds

| Collection                              |            Bound |
| --------------------------------------- | ---------------: |
| Selected features                       |               64 |
| BCD path segments                       |               12 |
| BCD paths per control                   |                8 |
| Browsers per profile                    |                9 |
| Releases per browser                    |              500 |
| Support statements per browser and path |               32 |
| Flags per statement                     |               16 |
| Notes per statement                     |               32 |
| Source and note strings                 | 2,048 characters |
| Stored profile                          |      4,096 bytes |
| Profile export                          |          512 KiB |
| Change events                           |           10,000 |
| Source-history entries                  |              512 |
| Header snapshot bytes                   |           64 KiB |
| Header snapshot lines                   |              256 |
| Header names                            |               64 |
| Values per header name                  |                8 |
| Assurance findings                      |               64 |
| Evidence application ID                 |    80 characters |
| Evidence environment                    |    40 characters |
| Evidence revision and build IDs         |   128 characters |
| Evidence producer ID                    |    80 characters |
| Evidence capture window                 |           7 days |
| Response snapshots per evidence bundle  |               16 |
| HTML documents per evidence bundle      |               16 |
| HTML bytes per document                 |          128 KiB |
| HTML bytes per evidence bundle          |          512 KiB |
| HTML elements per document              |            8,192 |
| Eligible resources per HTML document    |              512 |
| Expected surfaces per evidence bundle   |               32 |
| Local resource bodies per bundle        |               32 |
| Decoded bytes per local resource        |          256 KiB |
| Decoded resource bytes per bundle       |            1 MiB |
| Request snapshots per evidence bundle   |               32 |
| WebAuthn configurations per bundle      |               16 |
| Evidence bundle input                   |            2 MiB |
| Reduced evidence export                 |          512 KiB |
| Reduced comparison events emitted       |              512 |
| Evidence-policy exceptions              |              128 |
| Evidence-policy findings                |            4,096 |
| Sigstore bundle input                   |          512 KiB |
| Encoded DSSE statement                  |           64 KiB |
| Decoded attestation statement           |           48 KiB |
| Attestation certificate identity        | 1,024 characters |
| WPT mappings                            |               64 |
| WPT suites per control                  |                4 |
| Public file                             |            2 MiB |
| Public build                            |           25 MiB |

## Compatibility outcomes

The normalised outcome vocabulary is:

- `available_unqualified`;
- `available_with_qualification`;
- `unavailable`;
- `removed`;
- `unknown`;
- `unsupported_mapping`;
- `source_inconsistent`.

Missing or incompatible source data never becomes `unavailable` or
`available_unqualified`.

## Versioning

Future schema versions are refused. Selected snapshot schema 2 adds Web Platform
Features provenance, exact Baseline associations, and five mobile browser
families. Catalogue changes use a separate catalogue version. Source package
changes preserve their package versions and BCD timestamp. Algorithm changes
that alter results must change the catalogue or relevant contract version and
add regression fixtures.

## Source history

`data/source-history.json` records the reviewed source states that produced
committed snapshots. Each entry contains the exact BCD, Web Platform Features,
and catalogue versions; the structural fingerprint; selected browser, control,
path, and Baseline-association counts; and the number of associated change events
emitted for that state.

Entry identifiers are content-derived. Re-running generation for an identical
source state does not append another entry. The bounded manifest does not
reconstruct source versions that ControlCurrent never retained.

## Offline header assurance

Header snapshot schema 1 accepts a name and a bounded record of response-header
values. Names are validated against the HTTP token grammar. `Authorization`,
`Cookie`, and proxy credential fields are refused. Assurance report schema 2
keeps enforcement and uncertainty states distinct.

Assurance findings use six states:

- `observed`: recognised applicable syntax was present in an enforced policy or
  response header;
- `missing`: the relevant declaration was not present;
- `invalid`: duplicate, malformed, or ambiguous evidence prevented a reliable
  observation;
- `report_only`: the relevant CSP evidence appeared only in a report-only
  policy and was not enforced;
- `inconclusive`: bounded evidence was present but cannot support a single
  conclusion without more context;
- `not_evaluated`: response headers cannot establish the control, or the
  response did not contain the context needed for that check.

Reports contain bounded summaries and redacted evidence only. They never
contain a raw header value, cookie name, or cookie value.

## Evidence bundle

Evidence-bundle input schema 4 contains a bounded name, required evidence
identity, an optional opaque scope inventory, a required manifest of one to 32
expected surfaces, and five bounded collections. Identity contains:

- an opaque application ID and environment;
- a bounded revision and optional build ID;
- capture start and completion timestamps, ordered and no more than seven days
  apart;
- a producer kind (`application_ci`, `manual`, or `other`), opaque ID, and
  optional version.

These values are producer assertions. The schema validates and preserves them
but does not authenticate their origin.

- an optional schema 1 scope inventory with a bounded source kind, generation
  time, completeness claim, and at most 256 opaque entries;
- each inventory entry has only an opaque ID, included or excluded disposition,
  and one bounded exclusion reason when excluded;
- included inventory IDs must match declared evidence-surface IDs exactly;
- inventory generation must not follow evidence capture start;

- expected surfaces with an opaque ID, semantic role, unique required evidence
  kinds, explicit required control IDs, and explicit required composite IDs;

- response header snapshots using the established header schema;
- HTML document inputs capped at 128 KiB each;
- up to 32 local resource bodies, each linked by an opaque resource ID, surface
  ID, and exact in-document reference;
- request header snapshots used only for selected `Sec-Fetch-*` fields;
- reduced WebAuthn configuration with no raw identifiers or binary values.

HTML reports retain counts for eligible resources, SRI coverage, recognised
hash algorithms, parser errors, resource kinds, and reference classes. They do
not retain HTML, attributes, paths, origins, nonces, hashes, or resource bytes.
Resource inputs are base64-decoded under per-resource and total byte limits,
hashed locally, and reduced to verified, mismatched, invalid, and unmatched
counts. CSP/markup reports retain only matched and unmatched counts, broad
source-expression counts, and cross-document nonce-reuse counts.

Fetch Metadata reports retain one reduced finding and counts. Credential
headers are refused. WebAuthn reports retain only the explicit reduced
configuration and three catalogue-aligned findings.

Bundle report schema 6 evaluates each surface against its declared control and
composite applicability before producing a bounded cross-surface merge.
Conflicting applicable states become `inconclusive`; invalid evidence cannot be
overridden by a favourable snapshot. Controls and composites required by no
surface are `not_applicable`, which is distinct from missing evidence and from
an unevaluated required control.

The report contains:

- an absent state or a reduced scope inventory containing only its name, kind,
  generation time, completeness, semantic fingerprint, and counts;
- surface coverage and surface-scoped policy assessments;
- bounded reduced subreports;
- the application, environment, revision, optional build, producer, and
  capture-window identity supplied with the bundle;
- analyser, catalogue, BCD, Web Platform Features, and selected-schema
  provenance;
- a SHA-256 fingerprint over the canonical reduced report before the
  fingerprint field is added.

The scope-inventory fingerprint is calculated from its version, kind,
completeness, and sorted opaque entry semantics. It intentionally excludes the
display name and generation time, so an identical semantic inventory is stable
across collection runs. Raw inventory entries and exclusion reasons do not enter
the reduced report.

The report fingerprint identifies the complete reduced report and binds its
retained identity and reduced inventory, not the raw evidence or an
authenticated producer. Raw HTML, resource bytes, request targets, nonce
values, digest values, cookie identities, inventory entries, exclusion reasons,
and WebAuthn identifiers do not enter the report fingerprint.
Comparison and evidence-policy evaluation recompute this fingerprint and refuse
modified report content.

Evidence comparison schema 3 accepts two validated schema 6 reports and emits at
most 512 deterministic events while retaining bounded total counts. Analyser or
catalogue model mismatches make the reports semantically incomparable. Reports
for different application IDs, environments, inventory presence, or semantic
inventory fingerprints are also incomparable; revision, build, producer,
inventory generation time, and capture differences remain visible context
rather than false configuration changes.
Compatible comparisons detect state changes, surface-policy and coverage
changes, and changes in retained reduced detail even when a state remains the
same. Events contain stable keys and before/after states, not original headers,
HTML, resource data, or private identifiers.

Evidence policy schema 4 is independent of the submitted evidence bundle. It
pins expected analyser, catalogue, and optionally BCD versions; requires an
application ID, allowed environments and producer kinds, optional exact
revision, optional build ID presence, maximum capture duration, and maximum
evidence age; configures an exact Sigstore certificate issuer and URI identity;
can require a scope inventory, allowed source kinds, complete coverage, an exact
semantic fingerprint, maximum inventory age, and an exclusion-count limit; then
declares required surfaces, evidence kinds, controls, composites, rules, and at
most 128 expiring exceptions. Future-dated, stale, overlong,
identity-mismatched, inventory-mismatched, partial, unknown, or excessively
excluded evidence fails when policy requires the stronger state. Active surface
exceptions can downgrade a matching negative finding to `review`; they never
apply to attestation, inventory, identity, or freshness and never create a
pass. Expired exceptions remain visible and no longer affect the decision.

## Evidence attestation

Attestation statement schema 2 is an in-toto Statement v1 with exactly one
`controlcurrent-evidence-report` subject. Its SHA-256 subject digest must equal
the validated report fingerprint. Its bounded predicate repeats the report
schema, name, application, environment, revision, optional build, producer, and
capture window plus the reduced scope inventory, so a verified statement for
another deployment or inventory cannot be reused.

Attestation verification schema 1 retains only:

- one explicit verification state;
- the report fingerprint and predicate type;
- the ControlCurrent verifier algorithm version;
- the bounded certificate issuer and URI identity after successful
  verification;
- one reduced explanation.

Complete Sigstore bundles, certificates, transparency entries, trust metadata,
and dependency diagnostics are not retained in a verification result. Evidence
policy evaluation schema 4 contains this reduced result. An absent attestation
passes only when policy explicitly sets `required` to `false`; every supplied
but unsuitable attestation fails and cannot receive a surface exception.

## WPT evidence registry

The WPT registry is a versioned project-authored contract rather than an
upstream result mirror. Its review metadata contains:

- schema version;
- repository identity;
- exact 40-character source revision;
- review date;
- source licence.

Each control has exactly one mapping with a `mapped` or `not_mapped` state,
zero to four exact suite paths, a bounded scope statement, and a bounded
limitation. Source links are pinned to the reviewed revision. Dashboard links
are visibly current and do not enter compatibility calculations.
