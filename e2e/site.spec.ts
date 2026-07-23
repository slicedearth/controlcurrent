import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders real source provenance and makes no external request", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Can your browser baseline carry the control?" })
  ).toBeVisible();
  await expect(page.getByText("BCD package").locator("..")).toContainText("8.0.7");
  await expect(page.getByText("WebDX data").locator("..")).toContainText("3.34.1");
  await expect(page.getByText("Runtime API").locator("..")).toContainText("none");
  expect(externalRequests).toEqual([]);

  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
});

test("evaluates, stores, clears, and exports a profile locally", async ({ page }) => {
  await page.goto("/planner/");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Evaluate profile" }).click();

  await expect(page.getByRole("heading", { name: "Control availability" })).toBeVisible();
  await expect(page.locator(".result-card")).toHaveCount(30);
  await expect(page.getByText("Profile evaluated locally")).toBeVisible();

  await page.getByRole("button", { name: "Save locally" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("controlcurrent.profile.v1")))
    .not.toBeNull();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("controlcurrent-profile.json");

  await page.getByRole("button", { name: "Clear saved profile" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("controlcurrent.profile.v1")))
    .toBeNull();

  const violations = await new AxeBuilder({ page }).include("#main-content").analyze();
  expect(violations.violations).toEqual([]);
});

test("keeps dense views inside the viewport at 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of [
    "/",
    "/matrix/",
    "/planner/",
    "/assess/",
    "/evidence/",
    "/changes/",
    "/controls/trusted-types/"
  ]) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }

  const matrix = page.locator(".table-wrap");
  await page.goto("/matrix/");
  await expect(matrix).toBeVisible();
  const matrixDimensions = await matrix.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(matrixDimensions.scrollWidth).toBeGreaterThan(matrixDimensions.clientWidth);
});

test("shows pinned WPT mappings without fetching result data", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.goto("/evidence/");
  await expect(
    page.getByRole("heading", { name: "Where browser behaviour is tested" })
  ).toBeVisible();
  await expect(page.locator(".evidence-card")).toHaveCount(30);
  await expect(page.getByText("28")).toBeVisible();
  await expect(page.getByText("af38980d")).toBeVisible();
  await expect(
    page.getByText("No nearby suite is substituted for the missing evidence.")
  ).toHaveCount(2);
  expect(externalRequests).toEqual([]);

  const violations = await new AxeBuilder({ page }).include("#main-content").analyze();
  expect(violations.violations).toEqual([]);
});

test("assesses and clears a redacted header snapshot without a network request", async ({
  page
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.goto("/assess/");
  await page.getByRole("button", { name: "Load redacted example" }).first().click();
  await page.getByRole("button", { name: "Assess headers" }).click();

  await expect(page.getByRole("heading", { name: "Response-header assessment" })).toBeVisible();
  await expect(page.locator(".assurance-card")).toHaveCount(30);
  await expect(page.getByText("Headers assessed locally")).toBeVisible();
  await expect(page.getByText("18")).toBeVisible();
  expect(externalRequests).toEqual([]);

  await page.getByRole("button", { name: "Clear" }).first().click();
  await expect(page.getByRole("heading", { name: "Response-header assessment" })).toBeHidden();
  await expect(page.getByLabel("HTTP response headers")).toHaveValue("");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("reduces a multi-surface evidence bundle without exposing raw inputs", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(request.url());
  });

  await page.goto("/assess/");
  await page.getByRole("button", { name: "Load redacted example" }).last().click();
  await page.getByRole("button", { name: "Assess bundle" }).click();

  const results = page.locator("#bundle-results");
  await expect(page.getByRole("heading", { name: "Reduced evidence report" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Strict CSP candidate" })).toBeVisible();
  await expect(
    results.getByRole("heading", { name: "Cross-origin isolation header candidate" })
  ).toBeVisible();
  await expect(results.getByRole("heading", { name: "Cookie attribute coverage" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Expected surface coverage" })).toBeVisible();
  await expect(results.getByText("Complete: html, request, response, webauthn")).toBeVisible();
  await expect(results.getByRole("heading", { name: "Surface policy · sign-in" })).toBeVisible();
  await expect(
    results.getByText("19 of 19 required controls observed · 3 of 3 required composites satisfied")
  ).toBeVisible();
  await expect(
    results.getByText("No declared surface requires this control.").first()
  ).toBeVisible();
  await expect(results.locator("#bundle-source")).toContainText(
    "example-app · staging · revision 0123456789abcdef0123456789abcdef01234567"
  );
  await expect(results.locator("#bundle-source")).toContainText(
    "captured 2026-07-20T09:05:00.000Z by example-ci (application_ci)"
  );
  await expect(results.locator("#bundle-source")).toContainText(
    "analyser 4.0.0 · catalogue 2.2.0 · BCD 8.0.7"
  );
  await expect(
    results.getByText("Scope inventory · Reviewed application route manifest")
  ).toBeVisible();
  await expect(results.getByText(/framework_manifest · complete/u)).toBeVisible();
  await expect(page.getByText("Compare with a previous reduced report")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Verify the exported report in CI" })
  ).toBeVisible();
  await expect(
    page.getByText("A verified statement authenticates the configured signer")
  ).toBeVisible();
  const reportText = await results.textContent();
  expect(reportText).not.toContain("/assets/app.css");
  expect(reportText).not.toContain("__Host-session");
  expect(reportText).not.toContain("REDACTED");
  expect(externalRequests).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await page.getByRole("button", { name: "Clear" }).last().click();
  await expect(page.getByRole("heading", { name: "Reduced evidence report" })).toBeHidden();
  await expect(page.getByLabel("Evidence bundle JSON")).toHaveValue("");
});

test("shows the reviewed source manifest without inventing review timestamps", async ({ page }) => {
  await page.goto("/changes/");
  await expect(page.getByRole("heading", { name: "Reviewed source states" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Reviewed source states" })).toContainText(
    "3.34.1"
  );
  await expect(page.getByText("It is not the time a reviewer ran ControlCurrent")).toBeVisible();
});

test("does not detect the actual browser or expose a runtime connection surface", async ({
  page,
  request
}) => {
  await page.goto("/planner/");
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(policy).toContain("connect-src 'none'");

  const scripts = await page
    .locator("script[src]")
    .evaluateAll((elements) => elements.map((element) => (element as HTMLScriptElement).src));
  const source = (
    await Promise.all(
      scripts.map(async (script) => {
        const response = await request.get(script);
        expect(response.ok()).toBe(true);
        return response.text();
      })
    )
  ).join("\n");
  expect(source).not.toContain("navigator.userAgent");
  expect(source).not.toContain("userAgentData");
});
