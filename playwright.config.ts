import { defineConfig, devices } from "@playwright/test";

const crossEngineSmoke = process.env.CONTROLCURRENT_BROWSER_SMOKE === "1";
const fixtureOrigin = `${crossEngineSmoke ? "https" : "http"}://127.0.0.1:4389`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI || crossEngineSmoke ? { workers: 1 } : {}),
  reporter: [["line"]],
  use: {
    baseURL: fixtureOrigin,
    // Context-wide test-only bypass for the disposable loopback certificate;
    // this does not verify production TLS or pin a particular certificate.
    ignoreHTTPSErrors: crossEngineSmoke,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    ...(crossEngineSmoke
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] }, grep: /@smoke/u },
          { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: /@smoke/u }
        ]
      : [])
  ],
  webServer: {
    command: `npm run build && tsx tools/serve-dist.ts${crossEngineSmoke ? " --https-fixture" : ""}`,
    url: fixtureOrigin,
    ignoreHTTPSErrors: crossEngineSmoke,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
