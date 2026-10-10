import { defineConfig, devices } from "@playwright/test";

const crossEngineSmoke = process.env.CONTROLCURRENT_BROWSER_SMOKE === "1";
const crossEngineWorkflows = process.env.CONTROLCURRENT_BROWSER_WORKFLOWS === "1";
const crossEngine = crossEngineSmoke || crossEngineWorkflows;
const optionalTests = crossEngineWorkflows ? /@(?:smoke|workflow)/u : /@smoke/u;
const fixtureOrigin = `${crossEngine ? "https" : "http"}://127.0.0.1:4389`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI || crossEngine ? { workers: 1 } : {}),
  reporter: [["line"]],
  use: {
    baseURL: fixtureOrigin,
    // Context-wide test-only bypass for the disposable loopback certificate;
    // this does not verify production TLS or pin a particular certificate.
    ignoreHTTPSErrors: crossEngine,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    ...(crossEngine
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] }, grep: optionalTests },
          { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: optionalTests }
        ]
      : [])
  ],
  webServer: {
    command: `npm run build && tsx tools/serve-dist.ts${crossEngine ? " --https-fixture" : ""}`,
    url: fixtureOrigin,
    ignoreHTTPSErrors: crossEngine,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
