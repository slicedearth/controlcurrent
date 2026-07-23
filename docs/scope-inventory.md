# Scope inventory

ControlCurrent can bind a reduced evidence report to an independently produced
list of opaque application surfaces. This makes the evidence scope reviewable
without adding a website crawler, retaining route locations, or claiming that
the list is exhaustive.

## Intended sources

The schema distinguishes four producer claims:

- `declared`: a deliberately maintained application list;
- `framework_manifest`: output derived from a framework's route or entry-point
  manifest;
- `authorised_crawl`: output derived from a separately authorised collection
  process;
- `test_suite`: surfaces represented by an application test suite.

The kind describes the supplied inventory's provenance. ControlCurrent does not
run or validate the external producer.

## Privacy-minimised input

Use opaque IDs such as `sign-in`, `account-settings`, or
`administration-shell`. Do not include URLs, query strings, customer names,
personal identifiers, or free-form route descriptions.

```json
{
  "schemaVersion": 1,
  "name": "Reviewed application route manifest",
  "kind": "framework_manifest",
  "generatedAt": "2026-07-20T08:55:00.000Z",
  "completeness": "partial",
  "entries": [
    {
      "id": "sign-in",
      "disposition": "included"
    },
    {
      "id": "administration",
      "disposition": "excluded",
      "exclusionReason": "requires_separate_capture"
    }
  ]
}
```

Input is bounded to 256 unique entries and must contain at least one included
entry. Included entries cannot have an exclusion reason. Excluded entries
require one enumerated reason. A `complete` inventory cannot contain
exclusions, while a `partial` inventory must identify at least one. `unknown`
remains available when the producer cannot make either claim.

When an inventory is included in an evidence bundle, its included entry IDs
must equal the declared evidence-surface IDs exactly. An unlisted assessed
surface and an included but unassessed inventory entry both fail validation.
The inventory generation time must not follow the evidence capture start.

## Reduction and fingerprint

```sh
npm run cli -- reduce-scope-inventory examples/scope-inventory.json --json
```

The semantic fingerprint covers:

- schema version;
- source kind;
- completeness;
- sorted entry IDs, dispositions, and exclusion reasons.

The display name and generation time are excluded from the semantic fingerprint
so an unchanged list retains its identity across collection runs. They remain
separate reduced fields for attribution and freshness policy.

The reduced report retains only:

- name;
- kind;
- generation time;
- completeness;
- semantic fingerprint;
- included, excluded, and total counts.

Entry IDs and exclusion reasons do not enter the reduced report or attestation
predicate.

## Independent policy

Evidence policy can:

- require an inventory;
- allow only selected producer kinds;
- require the `complete` claim;
- require one exact semantic fingerprint;
- limit inventory age;
- limit excluded entries.

Inventory findings are report-level trust and coverage decisions. They cannot
receive a surface exception.

Reports with different inventory presence or semantic fingerprints are
incomparable. This prevents a route-set change from being misclassified as a
control regression or resolution.

## What this establishes

The feature can establish that:

- the evidence report contains one validated reduced inventory;
- its included IDs match assessed surfaces;
- its semantic content matches an independently configured fingerprint;
- its producer claim, completeness, age, and exclusion count meet policy;
- an optional verified attestation signed the matching reduced inventory as
  part of the report claim.

It cannot establish that:

- the external inventory source discovered every production route or state;
- a framework manifest represents dynamic or permission-dependent routes;
- an authorised crawl authenticated correctly or reached every branch;
- an excluded entry is acceptable for the application threat model;
- a signed inventory claim is truthful;
- controls worked at runtime.
