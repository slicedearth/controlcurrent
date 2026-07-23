# Data contract

## Selected snapshot

`data/selected-bcd.json` is a versioned canonical projection, not a source
mirror.

The root contract contains:

| Field               | Meaning                                            |
| ------------------- | -------------------------------------------------- |
| `schemaVersion`     | ControlCurrent selected-snapshot schema             |
| `bcdVersion`        | Locked BCD package version                         |
| `bcdTimestamp`      | BCD package build timestamp                        |
| `catalogueVersion`  | Project-authored mapping version                   |
| `schemaFingerprint` | SHA-256 of the selected structural shape           |
| `browsers`          | Bounded release metadata for four browser families |
| `controlMappings`   | Stable mapping state, rule, and selected paths     |
| `features`          | Exact selected BCD compatibility statements        |

## Feature statements

Each feature retains:

- exact path;
- source file;
- bounded description when present;
- MDN and specification URLs;
- source status fields;
- browser support statements.

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
| Browsers per profile                    |                4 |
| Releases per browser                    |              500 |
| Support statements per browser and path |               32 |
| Flags per statement                     |               16 |
| Notes per statement                     |               32 |
| Source and note strings                 | 2,048 characters |
| Stored profile                          |      4,096 bytes |
| Profile export                          |          512 KiB |
| Change events                           |           10,000 |
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

Future schema versions are refused. Catalogue changes use a separate catalogue
version. Source package changes preserve their BCD version and timestamp.
Algorithm changes that alter results must change the catalogue or relevant
contract version and add regression fixtures.
