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
exact commit SHA reported by the successful CI run and additionally requires
successful analysis and current-main checks. The workflow separates two trust
levels:

1. the build job checks out source, installs locked dependencies, runs the full
   verification suite, and uploads the generated artifact with read-only
   repository, workflow-metadata and Pages access;
2. the dependency-free deployment job receives `pages: write` and
   `id-token: write`, plus read-only source and workflow-metadata access for a
   sparse release-guard checkout and final verification, then deploys the
   already generated artifact.

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

### Manual-dispatch verification parity

Both publication paths require the exact release commit to be current `main`,
with successful main-branch **push** runs of CI and CodeQL. The latest matching
run and its latest attempt must contain successful `verify`, `browser` and
`analyse` jobs; old successes, PR checks, skipped jobs and incomplete metadata
cannot authorise publication. A manual Pages dispatch on another branch is
refused. If required checks are pending, the build gate waits with a bounded
polling budget; failed, cancelled or unavailable results fail closed.
The build gate has a ten-minute absolute network/polling budget and the final
gate a ten-second budget. A later successful analysis does not itself dispatch
Pages: after a bounded wait expires, review both pipelines and explicitly rerun
the publication workflow rather than weakening the gate.

The dependency-free native TypeScript guard uses only fixed-origin, read-only
API requests with redirect refusal, ten-second request limits, bounded response
bodies and complete result counts. It rechecks current `main` during each pass.
Before deploying, after any environment approval, a sparse checkout retrieves
only the same commit's guard. A second gate permits no pending-check wait and
revalidates the exact build SHA, current `main` and required checks. No package
installation or project build runs in the credential-bearing deployment job.
Checks are point-in-time observations, not an atomic lock on future branch
updates; branch protection and environment governance remain necessary.

Manual Pages dispatch checks out its exact `github.sha` and runs `npm run verify`,
`npm audit --audit-level=high`, installs the locked Chromium build, and runs
`npm run test:e2e` before uploading. There is no emergency verification bypass:
a failed audit or browser check prevents artifact upload and deployment. The
build job has a bounded 30-minute timeout to accommodate both verification
stages. Automatic publication retains its successful exact-SHA CI prerequisite
and does not repeat the additional manual-only checks.

Browser tests deliberately clear the deployment target for their loopback root
fixture. They rebuild `dist`, so the manual path then rebuilds and audits the
publication target with the Pages base path restored before upload. A local
fixture build can never be uploaded as the deployment artifact by this path.

Workflow contract tests retain the event-SHA binding, ordered gates and
read-only build boundary. The manual path has verification-command parity with
the current CI workflow, not proof that hosted execution has succeeded. Local
workflow edits do not change the deployed workflow until reviewed publication;
no dispatch or deployment is required to test this contract locally.

Node 24 remains the hosted compatibility line. Every dependency-installing job
first restores the reviewed CLI and separately locked runtime graph through
`node tools/bootstrap-npm.ts`, without using runner npm for reconstruction,
installation, audit or signature verification, or executing upstream bundled
modules. The pinned `setup-node` action still probes available node, npm and
yarn with `--version` inside the trusted action/runner boundary.
It audits and verifies that graph before activating PATH. Pre-bootstrap npm
caching is disabled and failed restoration cannot fall back to runner npm.
The guard-only deployment job needs Node but neither npm installation nor
dependency caching. See the dependency policy for bootstrap trust assumptions;
a clean application audit alone does not audit the toolchain.

### Organisation-specific origin review

Use a separate dedicated origin, not a shared project-site path, for sensitive
local assessment. A header-capable static host should serve the existing
reviewed `_headers` policy, including response CSP and frame restrictions that
cannot be supplied by a meta element. Review TLS, origin isolation, resource
integrity, zero telemetry and cross-origin request behaviour using synthetic
fixtures before approval. Keep actual evidence on the device and out of build
artifacts. A host/origin/DNS/account change and any evidence publication need
separate explicit approval; no such change is performed by local tests.

The migration plan is:

1. Choose an organisation-controlled dedicated hostname and a static host that
   serves response headers. Do not select an account or domain implicitly.
2. Configure the canonical URL and root base path for that origin in a separate
   reviewed change; the current production configuration remains the public
   project site. Keep the existing public deployment available for public data.
3. Build the same locked static application with no private evidence, accounts,
   telemetry or runtime collection. Translate `_headers` only if required by the
   selected host; preserve every restriction and review host-added scripts.
4. Review host access, deployment permissions, logging and retention. Imported
   evidence must never enter host logs, build artefacts or deployment storage;
   ordinary navigation metadata may still be logged by the host.
5. Before sensitive use, verify actual response headers on document, asset and
   error routes, TLS, canonical URLs, frame rejection and absence of external
   requests with synthetic fixtures. The presence of `_headers` alone is not a
   delivery check. Review browser storage origin separation and provide a clear
   local-data clearing path.
6. Approve account, DNS and deployment changes explicitly, retain a rollback
   route to the previous public site, and do not move organisation evidence into
   either public repository or deployment artefact. Choose HSTS separately.

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
node tools/bootstrap-npm.ts
# Apply the printed PATH export before the commands below.
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

Optional local cross-engine smoke checks use the locked browser package without
changing recurring hosted CI or uploading additional artefacts:

```sh
npx playwright install chromium firefox webkit
CONTROLCURRENT_BROWSER_SMOKE=1 npx playwright test --grep @smoke
```

The smoke fixture uses HTTPS with a disposable, locally generated certificate
because WebKit upgrades loopback subresources under the site's existing CSP.
It requires local `openssl`; the certificate and key are deleted after reading
them into the loopback server. Certificate-error checks are disabled in the
smoke browser context and readiness probe, not pinned to a single certificate.
This is a local test-only limitation, not production TLS verification; the built
site's CSP is not weakened.

The cross-engine smoke jobs run serially to avoid local browser resource
contention. Shared schema validation disables dynamic compilation, including
the schema library's caught capability probe, instead of allowing `unsafe-eval`.

The smoke scenario checks keyboard use and enlarged text. The complete
Chromium suite remains the default; a smoke pass is not equivalent to complete
Firefox or WebKit coverage.

The broader local workflow selection is separately opt-in:

```sh
CONTROLCURRENT_DEPLOY_TARGET= CONTROLCURRENT_BROWSER_WORKFLOWS=1 \
  npm run test:e2e -- --grep '@smoke|@workflow'
```

It uses the same disposable HTTPS fixture and runs serially across Chromium,
Firefox and WebKit. It covers profile/policy imports, Blob downloads, denied
storage, evidence file drop, non-executing markup, pending-operation supersession,
bounded export failures, source context, restrictive CSP/framing behaviour, axe
checks and 320-pixel reflow. The original smoke flag still selects only the
keyboard/enlarged-text smoke for the optional engines. Neither flag changes
recurring hosted workflows or uploads artefacts.

The reflow fixture uses a 320 CSS-pixel viewport and the keyboard fixture uses
200% root font size. Neither is native 400% browser zoom. A manual zoom check
should set a 1280-pixel browser window to 400% in the browser UI, then exercise
planner inputs, imports, result disclosure, evidence review and downloads while
checking focus visibility and horizontal scrolling. Record the browser/version
and actual zoom setting; do not substitute a CSS transform or device scale factor.

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
