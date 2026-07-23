# Data contract

## Selected snapshot

`data/selected-bcd.json` is a versioned canonical projection, not a source
mirror.

The root contract contains:

| Field                | Meaning                                            |
| -------------------- | -------------------------------------------------- |
| `schemaVersion`      | ControlCurrent selected-snapshot schema             |
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
| Response snapshots per evidence bundle  |               16 |
| HTML documents per evidence bundle      |               16 |
| HTML bytes per document                 |          128 KiB |
| HTML bytes per evidence bundle          |          512 KiB |
| HTML elements per document              |            8,192 |
| Eligible resources per HTML document    |              512 |
| Request snapshots per evidence bundle   |               32 |
| WebAuthn configurations per bundle      |               16 |
| Evidence bundle input                   |            1 MiB |
| Reduced evidence export                 |          512 KiB |
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

Evidence-bundle input schema 1 contains a bounded name and four optional
collections:

- response header snapshots using the established header schema;
- HTML document inputs capped at 128 KiB each;
- request header snapshots used only for selected `Sec-Fetch-*` fields;
- reduced WebAuthn configuration with no raw identifiers or binary values.

HTML reports retain counts for eligible resources, SRI coverage, recognised
hash algorithms, parser errors, resource kinds, and reference classes. They do
not retain HTML, attributes, paths, origins, or resource bytes.

Fetch Metadata reports retain one reduced finding and counts. Credential
headers are refused. WebAuthn reports retain only the explicit reduced
configuration and three catalogue-aligned findings.

The bundle report merges applicable findings per control. Conflicting states
become `inconclusive`; invalid evidence cannot be overridden by a favourable
snapshot. Three project-authored composite candidates report `satisfied`,
`review`, `gap`, or `not_evaluated` independently of browser compatibility.

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
