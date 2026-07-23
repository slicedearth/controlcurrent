# Attested evidence

ControlCurrent can verify that a reduced evidence report was signed by the
exact Sigstore certificate identity selected by an independent evidence policy.
This is an optional CLI trust layer. The static website neither signs nor
verifies bundles.

## Trust chain

```text
schema 5 reduced evidence report
          |
          v
canonical SHA-256 report fingerprint
          |
          v
in-toto Statement v1 subject and bounded predicate
          |
          v
externally produced Sigstore DSSE bundle
          |
          v
offline Sigstore cryptographic verification
          |
          +--> exact certificate issuer
          +--> exact certificate URI identity
          +--> certificate-transparency evidence
          +--> transparency-log evidence
          +--> statement digest and deployment identity
          |
          v
schema 3 evidence-policy decision
```

The statement uses:

- `_type`: `https://in-toto.io/Statement/v1`;
- subject name: `controlcurrent-evidence-report`;
- subject digest: the report's canonical SHA-256 fingerprint;
- predicate type:
  `https://github.com/slicedearth/controlcurrent/attestations/evidence-report/v1`;
- predicate: the report name, schema version, application, environment,
  revision, optional build, producer, and capture window.

The predicate deliberately contains no raw HTML, headers, request targets,
resource bytes, credentials, cookies, WebAuthn identifiers, or source
diagnostics.

## Create the statement

First export a schema 5 reduced report. Then create its canonical statement:

```sh
npm --silent run cli -- create-attestation-statement report.json > statement.json
```

ControlCurrent does not sign the statement. Signing requires an independently
reviewed CI identity and external Sigstore tooling. It can contact an identity
provider, certificate authority, and transparency log, so signing remains
outside the read-only verifier and outside ordinary tests.

## Configure trust policy

Evidence-policy schema 3 contains:

```json
{
  "attestation": {
    "required": true,
    "certificateIssuer": "https://token.actions.githubusercontent.com/",
    "certificateIdentity": "https://github.com/example/example/.github/workflows/evidence.yml@refs/heads/main"
  }
}
```

Both values are exact HTTPS identities. ControlCurrent escapes the certificate
identity before passing an anchored pattern to the Sigstore verifier. Policy
values cannot contain credentials, query strings, or fragments.

The issuer and workflow identity belong to the evidence consumer's policy, not
the submitted report or bundle. A producer therefore cannot choose which
signer the gate trusts.

## Verify and evaluate

```sh
npm run cli -- verify-evidence \
  examples/evidence-policy.json \
  report.json \
  report.sigstore.json \
  --as-of 2026-07-23 \
  --strict-review
```

Verification is bounded to a 512 KiB bundle and a 48 KiB decoded statement.
The verifier requires a DSSE envelope with the in-toto payload type, a supported
Sigstore bundle, one certificate-transparency verification, one transparency-log
verification, and the exact policy identity.

The CLI uses the Sigstore libraries' packaged TUF seed with live refresh
disabled. It creates a temporary trust cache for one invocation and removes it
after verification. Updating the locked Sigstore dependencies is therefore a
deliberate trust-material review.

Reduced verification states are:

- `verified`;
- `absent`;
- `invalid_bundle`;
- `verification_failed`;
- `signer_mismatch`;
- `statement_invalid`;
- `digest_mismatch`;
- `identity_mismatch`;
- `trust_unavailable`;
- `unsupported`.

Raw certificates, complete bundles, transparency entries, and dependency error
messages do not enter the reduced policy result.

## Security meaning

A verified result establishes that:

- the Sigstore bundle passed the configured cryptographic and transparency
  checks;
- its certificate matched the exact issuer and URI identity in policy;
- its signed statement named the supplied report fingerprint;
- its bounded deployment predicate matched the validated report.

It does not establish that:

- the producer collected every route, state, environment, or response;
- the signed evidence was truthful before signing;
- the named workflow or identity was uncompromised;
- a control worked at runtime;
- an application is secure, compliant, or certified.

Sigstore itself separates cryptographic identity from the decision to trust
that identity. ControlCurrent makes the trust decision explicit in the
independent evidence policy and fails closed when the bundle, signer, digest,
identity, or trust material is unsuitable.

## Primary references

- [Sigstore bundle format](https://docs.sigstore.dev/about/bundle/)
- [Sigstore JavaScript client](https://docs.sigstore.dev/language_clients/javascript/)
- [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md)
- [Sigstore threat model](https://docs.sigstore.dev/about/threat-model/)
