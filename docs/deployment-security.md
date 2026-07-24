# Deployment security

## Deployment verdict

ControlCurrent is designed for a public static deployment containing public
compatibility data and deliberately redacted examples. It has no application
server, runtime API, account, analytics, remote script, or public scanning
surface.

The site may be deployed to GitHub Pages for its catalogue, planner, and
redacted local assessment workflow. Organisation-specific evidence should be
handled only from a dedicated, reviewed origin. GitHub Pages project sites can
share an origin with other repositories owned by the same account, so a project
path is not an origin-isolation boundary.

## Build and deployment boundary

The Pages workflow runs after CI completes successfully for a push to `main`
and may also be dispatched manually. Automatic publication is bound to the
exact commit SHA reported by the successful CI run. The workflow separates two
trust levels:

1. the build job checks out source, installs locked dependencies, runs the full
   verification suite, and uploads the generated artifact with read-only
   repository and Pages access;
2. the dependency-free deployment job receives only `pages: write` and
   `id-token: write`, then deploys the already generated artifact.

Every third-party action is pinned to an immutable commit SHA. The repository
audit refuses mutable action references, `pull_request_target`, self-hosted
runners, `write-all`, missing reviewed version comments, or deployment
credentials in the build job.

The workflow does not commit, push, create issues, publish packages, or expose a
runtime secret. Pull-request, failed, cancelled, manually dispatched CI, and
non-`main` runs cannot start automatic publication.

The manual source-update preview installs candidate browser-data packages only
under temporary runner storage with npm lifecycle scripts disabled. It reads
fixed package and data paths through explicit byte limits, rebuilds only the
selected public subset in memory, and writes a bounded semantic summary. It
does not alter the checked-out repository or trigger deployment.

## Browser boundary

Every generated HTML page carries a restrictive meta Content Security Policy:

- scripts, styles, images, and fonts are limited to the static site's needs;
- connections, frames, workers, media, forms, and object embedding are denied;
- inline scripts, inline event handlers, and inline style attributes are denied;
- base URLs remain same-origin;
- insecure requests are upgraded.

`frame-ancestors` is not effective in a meta policy; browsers enforce it only
from an HTTP response header. GitHub Pages does not provide project-controlled
response headers. ControlCurrent therefore detects framing and refuses
interactive use as defence in depth. That client check is not a replacement for
a response-header policy or a dedicated origin.

The repository also ships `public/_headers`, a portable response-header policy
understood by hosts such as
[Netlify](https://docs.netlify.com/manage/routing/headers/) and
[Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/).
It carries the full production CSP at response level, including
`frame-ancestors 'none'`, plus no-referrer, MIME-sniffing, legacy anti-framing,
capability restriction, and same-origin resource controls. The generated-site
audit requires that file and fails if its critical directives disappear or
become permissive.

GitHub Pages ignores `_headers`. Its presence in the Pages artifact is
preparation for a deliberate hosting change, not evidence that the current live
origin serves those headers. Do not describe the portable policy as enforced
until the deployed response has been inspected.

The generated-site audit fails on:

- production source maps;
- inline scripts or event handlers;
- executable URL schemes;
- external active resources;
- browser network APIs;
- missing restrictive policy directives;
- secrets, local development URLs, or insecure HTTP links;
- unexpectedly large files or builds.

## Evidence handling

The public deployment never fetches a target. Header and evidence-bundle inputs
remain in the current page's memory, are reduced locally, and are omitted from
the generated public artifact.

Before using the public assessment:

- replace secrets and identifying values with `REDACTED`;
- use opaque application, environment, surface, build, and producer IDs;
- do not paste production cookies, authorisation headers, personal data,
  internal URLs, non-public hostnames, or complete private source material;
- clear the input after use;
- review every downloaded report before sharing or committing it.

Use the CLI in a controlled local or CI environment for organisation-specific
evidence and attestation verification.

## Repository settings required before publication

Review these remote settings in GitHub before treating a deployment as
production-governed:

- keep the repository public only if the selected data and source are intended
  for public release;
- set Pages to deploy through GitHub Actions;
- protect `main` with pull-request review and required successful CI and
  CodeQL checks;
- prevent force pushes and branch deletion on `main`;
- require approval for the `github-pages` environment if the account plan
  supports it;
- enable private vulnerability reporting;
- enable Dependabot alerts and security updates;
- retain the workflow's default read-only token policy;
- do not add a Pages secret or runtime credential.

For organisation-specific evidence, configure a dedicated custom domain or
another host that provides a distinct origin and supports response headers.
Use the committed `_headers` policy where the host supports that format, or
translate it exactly into the host's response-header configuration. At minimum,
confirm delivery of:

```text
Content-Security-Policy: default-src 'self'; ...; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()
```

The existing meta policy remains useful defence in depth on that host. Do not
add HSTS mechanically: its host and subdomain effects require a separate
domain-level decision.

## Release verification

Before a deployment commit:

```sh
npm ci
npm run verify
npm audit --omit=dev --audit-level=low
npm audit --audit-level=low
npm audit signatures
npm run test:e2e
CONTROLCURRENT_DEPLOY_TARGET=github-pages npm run build
CONTROLCURRENT_DEPLOY_TARGET=github-pages npm run audit:public
git diff --check
```

After deployment:

1. compare the deployed commit with the reviewed local commit;
2. confirm the canonical URL and `/controlcurrent/` base path;
3. inspect delivery headers and TLS, for example:

   ```sh
   curl --fail --silent --show-error --dump-header - --output /dev/null \
     https://example.invalid/
   ```

   Verify the actual response rather than the presence of `_headers` in the
   repository;

4. confirm the browser console contains no CSP violation on normal navigation;
5. confirm the Network panel contains no third-party request;
6. repeat the keyboard, narrow-viewport, accessibility, profile, assessment,
   export, and framed-use browser tests against the deployed origin;
7. retain the deployment URL and verification time in the release notes.

Merging or pushing a reviewed change to `main` authorises publication only
after that exact commit passes CI. A successful local audit, pull-request check,
or read-only source review does not publish anything. Manual workflow dispatch
remains an explicit remote deployment action.

Local source changes and commits cannot configure branch protection, private
vulnerability reporting, the Pages source, environment approval, Dependabot,
or repository token defaults. Those remain separately reviewed remote actions.
