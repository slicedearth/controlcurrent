# Authorised evidence collection

ControlCurrent includes a deliberately narrow CLI collector for public,
unauthenticated routes on a website you own or are explicitly authorised to
assess. It converts a reviewed manifest into the existing evidence-bundle
contract and writes the result only to a private local path.

The collector is not a general website scanner.

## Safety boundary

Collection requires all of the following:

- an explicit manifest file;
- one fixed HTTPS origin;
- one to 16 exact same-origin paths without query strings or fragments;
- `--confirm-authorised-target`;
- an output path outside the repository or under ignored `private-data/` or
  `.private-data/`;
- public DNS answers only, unless loopback testing is separately enabled;
- a new output filename that does not already exist.

The collector:

- resolves and validates every target host before connecting;
- rejects a host if any returned address is private, loopback, link-local,
  carrier-grade NAT, documentation, benchmarking, multicast or reserved space;
- pins one validated address for the request while retaining the original TLS
  server name and `Host` header;
- follows at most five redirects and only when they remain on the exact origin;
- records a cross-origin redirect relationship but does not follow it;
- performs bounded `GET` requests only;
- caps each response body at 128 KiB;
- caps retained HTML at 512 KiB in total;
- reserves one response slot per remaining surface, limiting redirect expansion
  to the 16-response bundle budget; an exhausted chain remains an explicit
  redirect observation rather than a successful final response;
- uses one absolute ten-second deadline per surface, including DNS, headers,
  response streaming and all redirect hops; trickled bytes do not restart it;
- does not run JavaScript;
- does not submit forms;
- does not use cookies, credentials, browser profiles or authentication state;
- does not download linked resources;
- redacts redirect locations and cookie values before writing the private
  bundle;
- discards non-HTML response bodies.

Repeated response-header values are limited to eight. Overflow produces an
explicit transport error, never a successful observation of a sliced subset.
Cookie reduction preserves the most-specific `__Host-Http-`, `__Http-`,
`__Host-` or `__Secure-` prefix class while removing the actual name and value.
Derived labels reserve suffix space within 80 characters; the complete opaque
surface ID remains the association key. Injected transports that exceed the
body or aggregate budgets fail instead of producing a complete bundle.

Loopback HTTP is available only for deliberate local fixture testing with
`--allow-loopback`. It does not permit other private addresses.

## Manifest

Start from
[`examples/collector-manifest.example.json`](../examples/collector-manifest.example.json).
Use opaque surface IDs. The collector does not copy the configured origin or
paths into dedicated bundle fields. Captured headers and HTML can still contain
locations, so the generated bundle remains private. Reduced reports discard raw
headers, HTML and locations.

`completeness` is a producer claim:

- `complete` means the reviewed manifest claims to contain every intended
  public unauthenticated surface for this capture;
- `unknown` makes no completeness claim.

The initial collector does not accept `partial`, because its generated inventory
contains no excluded route details. Use an independently produced scope
inventory when exclusions must be represented.

The `authentication` field accepts only `anonymous` or `unknown`. Authenticated
collection is intentionally absent: adding credentials, browser sessions or
cookie state would require a separate threat model and secret-handling design.

## Run

```sh
npm run cli -- collect-evidence private-data/collector/manifest.json \
  --output private-data/collector/evidence-2026-07-24.json \
  --confirm-authorised-target
```

The repository boundary is the real directory containing this CLI's checkout,
even when the command is invoked from a different working directory. Relative
output arguments are still relative to that working directory. Before any target
request, the command refuses public repository destinations, existing output
files and symlink parents beneath the repository's private directories. External
destinations are resolved through their existing parent directory before new
children are created; an alias back into the publication tree is refused.

Output directories are created with mode `0700` and temporary files with mode
`0600` where supported. Complete, flushed bytes are published with an atomic
same-directory hard link. An existing destination makes that operation fail;
competing writers cannot replace the winner. Temporary files are removed after
write or publication failures. A filesystem without hard-link support fails
closed; there is no overwrite-capable rename fallback. No output is committed
or uploaded.

Use directories controlled by the operator. Parent validation prevents existing
aliases; it does not provide a sandbox against another local process that can
rename or replace those directories concurrently. Defending against a malicious
same-user directory swap would require a reviewed directory-handle strategy and
platform-specific support. Restrictive file modes alone do not make a public
publication directory safe.

Inspect the resulting private bundle separately:

```sh
npm run cli -- inspect-bundle \
  private-data/collector/evidence-2026-07-24.json \
  --json > private-data/collector/report-2026-07-24.json
```

Review the reduced report before deliberately copying it anywhere. A report
contains no path or origin, but opaque IDs and deployment metadata can still be
sensitive in some organisations.

## What it establishes

The collector can establish that, at its observation time:

- a configured same-origin path returned a bounded response, redirect, HTTP
  error or reduced transport error;
- selected response headers were present;
- a final response declared a broad content class;
- an HTML response contained the markup captured under the body limit;
- the supplied route manifest produced the exact opaque surface inventory in
  the bundle.

It cannot establish:

- complete production route coverage;
- an authenticated user's experience;
- runtime JavaScript behaviour;
- server-side enforcement;
- resource integrity against downloaded assets;
- WebAuthn ceremony behaviour;
- cache correctness;
- that a cross-origin redirect target is safe;
- that the operator's authorisation or completeness claim is truthful;
- continuous compliance after the capture.

Transport errors remain explicit and do not satisfy required response evidence.
Missing, failed or oversized collection is never converted into a favourable
security conclusion.
