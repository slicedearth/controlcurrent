import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("renders real source provenance and makes no external request", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Choose security features your supported browsers can handle"
    })
  ).toBeVisible();
  await expect(
    page.getByText("MDN browser data", { exact: true }).first().locator("..")
  ).toContainText("8.0.7");
  await expect(page.getByText("Web feature data").locator("..")).toContainText("3.34.1");
  await expect(page.getByText("Server connection").locator("..")).toContainText("none");
  expect(externalRequests).toEqual([]);

  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
});

test("evaluates, stores, clears, and exports a profile locally", async ({ page }) => {
  await page.goto("/planner/");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Check support" }).click();

  await expect(
    page.getByRole("heading", { name: "What your browser choices can support" })
  ).toBeVisible();
  await expect(page.locator(".result-card")).toHaveCount(30);
  await expect(page.getByRole("heading", { name: /Ready to use/u })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Works with known limitations/u })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Not enough information/u })).toBeVisible();
  await expect(page.getByText("What should I do next?").first()).toBeVisible();
  const firstExplanation = page.locator(".result-card__why").first();
  await firstExplanation.locator("summary").click();
  await expect(firstExplanation.locator("li").first()).toBeVisible();
  await expect(page.getByText("Support checked on this device")).toBeVisible();

  await page.getByLabel(/Remember the latest result/u).check();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("controlcurrent.evaluation.v1")))
    .not.toBeNull();

  await page.getByLabel("Show blockers only").check();
  await expect(page.locator(".result-group--ready")).toBeHidden();
  expect(await page.locator("[data-result-card]:visible").count()).toBeLessThan(30);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("[data-result-card]:visible")).toHaveCount(30);

  await page.getByRole("button", { name: "Save locally" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("controlcurrent.profile.v1")))
    .not.toBeNull();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("controlcurrent-profile.json");
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("The exported profile path is unavailable.");
  const exportedEvaluation = await readFile(downloadPath);

  const chromeMinimum = page.locator('select[name="version-chrome"]');
  const options = await chromeMinimum
    .locator("option")
    .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
  const currentValue = await chromeMinimum.inputValue();
  const changedValue = options.find((value) => value !== currentValue);
  if (!changedValue) throw new Error("A second Chrome baseline is required for comparison.");
  await chromeMinimum.selectOption(changedValue);
  await page.getByLabel("Profile name").fill("Changed profile");
  await page.getByRole("button", { name: "Check support" }).click();

  await page.getByLabel("Compare with an earlier result").setInputFiles({
    name: "earlier.json",
    mimeType: "application/json",
    buffer: exportedEvaluation
  });
  await expect(
    page.getByRole("heading", { name: "What changed since the earlier result" })
  ).toBeVisible();
  await expect(page.locator("#comparison-events .result-card")).toHaveCount(30);

  const reportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export readable report" }).click();
  const report = await reportPromise;
  expect(report.suggestedFilename()).toBe("controlcurrent-engineering-report.md");

  await page.getByLabel("Import a saved plan or result").setInputFiles({
    name: "profile.json",
    mimeType: "application/json",
    buffer: exportedEvaluation
  });
  await expect(page.getByText("Plan imported on this device")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What your browser choices can support" })
  ).toBeHidden();
  await page.getByRole("button", { name: "Check support" }).click();
  await expect(
    page.getByRole("heading", { name: "What your browser choices can support" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete saved plan" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("controlcurrent.profile.v1")))
    .toBeNull();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("controlcurrent.evaluation.v1")))
    .toBeNull();

  const violations = await new AxeBuilder({ page }).include("#main-content").analyze();
  expect(violations.violations).toEqual([]);
});

test("imports explicit browser minimums and builds a local policy report", async ({ page }) => {
  await page.goto("/planner/");
  await page.locator("#import-browser-config").setInputFiles({
    name: "package.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ browserslist: ["chrome >= 120", "firefox >= 115", "safari >= 17"] })
    )
  });
  await expect(page.getByText("3 explicit browser minimums imported locally")).toBeVisible();
  await expect(page.locator('input[name="include-chrome"]')).toBeChecked();
  await expect(page.locator('select[name="version-chrome"]')).toHaveValue("120");

  await page.getByRole("button", { name: "Check support" }).click();
  await page
    .getByText("Turn this result into a reviewable browser policy", { exact: true })
    .click();
  await page.getByRole("button", { name: "Check policy" }).click();
  await expect(page.getByRole("heading", { name: "Policy decision" })).toBeVisible();
  await expect(page.locator("#policy-json")).toContainText('"requiredControls"');

  const policyPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export policy JSON" }).click();
  expect((await policyPromise).suggestedFilename()).toBe("controlcurrent-policy.json");

  const reportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export printable decision report" }).click();
  const report = await reportPromise;
  expect(report.suggestedFilename()).toBe("controlcurrent-decision-report.html");
  const reportPath = await report.path();
  if (!reportPath) throw new Error("The printable report path is unavailable.");
  const reportText = await readFile(reportPath, "utf8");
  expect(reportText).toContain("ControlCurrent engineering decision record");
  expect(reportText).toContain("connect-src 'none'");
  expect(reportText).not.toContain("<script");

  await page.locator("#import-browser-config").setInputFiles({
    name: ".browserslistrc",
    mimeType: "text/plain",
    buffer: Buffer.from("last 2 versions")
  });
  await expect(page.getByText(/Unsupported browser query/u)).toBeVisible();

  const violations = await new AxeBuilder({ page }).include("#main-content").analyze();
  expect(violations.violations).toEqual([]);
});

test("calculates minimum browser baselines without a network request", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.goto("/planner/");
  await page.getByRole("button", { name: "Find oldest versions" }).click();

  await expect(page.getByRole("heading", { name: "Minimum browser versions" })).toBeVisible();
  await expect(page.locator("#minimum-result-list .result-card")).toHaveCount(4);
  await expect(page.getByText("Minimums calculated locally")).toBeVisible();
  expect(externalRequests).toEqual([]);

  const violations = await new AxeBuilder({ page }).include("#minimum-form").analyze();
  expect(violations.violations).toEqual([]);
});

test("keeps dense views inside the viewport at 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of [
    "/",
    "/controls/",
    "/glossary/",
    "/matrix/",
    "/planner/",
    "/assess/",
    "/evidence/",
    "/changes/",
    "/browsers/",
    "/data/",
    "/privacy/",
    "/limitations/",
    "/corrections/",
    "/methodology/",
    "/controls/trusted-types/",
    "/404.html"
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

test("stacks homepage actions evenly on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const actions = page.locator(".hero-actions .button");
  await expect(actions).toHaveCount(3);
  const boxes = await actions.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    })
  );

  expect(new Set(boxes.map((box) => box.x)).size).toBe(1);
  expect(new Set(boxes.map((box) => box.width)).size).toBe(1);
  expect(new Set(boxes.map((box) => box.height)).size).toBe(1);
  const [first, second, third] = boxes;
  if (!first || !second || !third) throw new Error("Expected three homepage actions.");
  expect(first.y).toBeLessThan(second.y);
  expect(second.y).toBeLessThan(third.y);
});

test("uses a contained mobile navigation menu without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const toggle = page.locator(".nav-toggle");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });

  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText(/Menu/u);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveText(/Close/u);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveCount(8);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const violations = await new AxeBuilder({ page }).include(".site-header").analyze();
  expect(violations.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveText(/Menu/u);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await expect(navigation).toBeHidden();
});

test("shows pinned WPT mappings without fetching result data", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.goto("/evidence/");
  await expect(
    page.getByRole("heading", { name: "See the public tests behind browser behaviour" })
  ).toBeVisible();
  await expect(page.locator(".evidence-card")).toHaveCount(30);
  await expect(page.getByText("28")).toBeVisible();
  await expect(page.getByText("af38980d")).toBeVisible();
  await expect(
    page.getByText("No similar test is substituted when an exact link is unavailable.")
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
  await page.getByRole("button", { name: "Review headers" }).click();

  await expect(page.getByRole("heading", { name: "Security header results" })).toBeVisible();
  await expect(page.locator(".assurance-card")).toHaveCount(30);
  await expect(page.getByText("Headers reviewed on this device")).toBeVisible();
  await expect(page.getByText("18")).toBeVisible();
  expect(externalRequests).toEqual([]);

  await page.getByRole("button", { name: "Clear" }).first().click();
  await expect(page.getByRole("heading", { name: "Security header results" })).toBeHidden();
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
  await page.locator(".advanced-assessment > summary").click();
  await page.getByRole("button", { name: "Load redacted example" }).last().click();
  const localEvidence = await page.getByLabel("Evidence bundle JSON").inputValue();
  await page.getByRole("button", { name: "Clear" }).last().click();
  await page.locator("#bundle-file").setInputFiles({
    name: "authorised-evidence.json",
    mimeType: "application/json",
    buffer: Buffer.from(localEvidence)
  });
  await expect(page.getByText("Evidence file loaded on this device")).toBeVisible();
  await page.getByRole("button", { name: "Review evidence file" }).click();

  const results = page.locator("#bundle-results");
  await expect(
    page.getByRole("heading", { name: "Privacy-reduced evidence report" })
  ).toBeVisible();
  await expect(
    results.getByRole("heading", { name: "Strong Content Security Policy" })
  ).toBeVisible();
  await expect(
    results.getByRole("heading", { name: "Cross-origin isolation headers" })
  ).toBeVisible();
  await expect(results.getByRole("heading", { name: "Cookie protection settings" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Expected page coverage" })).toBeVisible();
  await expect(results.getByText("Complete: html, request, response, webauthn")).toBeVisible();
  await expect(
    results.getByRole("heading", { name: "Requirements for page · sign-in" })
  ).toBeVisible();
  await expect(
    results.getByText("19 of 19 required features found · 3 of 3 combined checks met")
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
    "analyser 5.0.0 · catalogue 2.2.0 · BCD 8.0.7"
  );
  await expect(
    results.getByText("Supplied page list · Reviewed application route manifest")
  ).toBeVisible();
  await expect(results.getByText(/framework_manifest · complete/u)).toBeVisible();
  await expect(page.getByText("Compare with an earlier report")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Confirm who produced a report in continuous integration (CI)"
    })
  ).toBeVisible();
  await expect(
    page.getByText("A valid signature proves who signed that exact report")
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
  await expect(page.getByRole("heading", { name: "Privacy-reduced evidence report" })).toBeHidden();
  await expect(page.getByLabel("Evidence bundle JSON")).toHaveValue("");
});

test("shows the reviewed source manifest without inventing review timestamps", async ({ page }) => {
  await page.goto("/changes/");
  await expect(page.getByRole("heading", { name: "Reviewed source versions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Reviewed source versions" })).toContainText(
    "3.34.1"
  );
  await expect(page.getByText("It is not the date a reviewer ran ControlCurrent")).toBeVisible();
});

test("publishes third-party licence notices with the static site", async ({ page, request }) => {
  await page.goto("/data/");
  const noticeLink = page.getByRole("link", {
    name: "Read the deployed third-party notices and licence terms"
  });
  await expect(noticeLink).toBeVisible();

  const href = await noticeLink.getAttribute("href");
  expect(href).not.toBeNull();
  if (!href) throw new Error("Third-party notice link is missing its destination.");
  const response = await request.get(href);
  expect(response.ok()).toBe(true);
  const notices = await response.text();
  expect(notices).toContain("Apache License");
  expect(notices).toContain("Zod");
  expect(notices).toContain("parse5");
  expect(notices).toContain("entities");
});

test("states capability maturity without numerical assurance scores", async ({ page }) => {
  await page.goto("/limitations/");

  await expect(
    page.getByRole("heading", { name: "How far each part of the tool can go" })
  ).toBeVisible();
  const maturity = page.getByRole("region", { name: "ControlCurrent usefulness by task" });
  await expect(maturity.getByRole("row")).toHaveCount(8);
  await expect(maturity.getByText("Test live browser and server behaviour")).toBeVisible();
  await expect(maturity.getByText("Not provided").first()).toBeVisible();
  await expect(maturity.getByText("Certify a production website")).toBeVisible();
  await expect(page.getByText(/\/10/u)).toHaveCount(0);

  const violations = await new AxeBuilder({ page }).include("#main-content").analyze();
  expect(violations.violations).toEqual([]);
});

test("filters security features locally without hiding the full static catalogue", async ({
  page
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.goto("/controls/");
  await expect(page.locator("[data-control-card]")).toHaveCount(30);
  await page.getByLabel("Search features").fill("clickjacking");
  await expect(page.locator("[data-control-card]:visible")).toHaveCount(1);
  await expect(page.getByText("Showing 1 of 30 features.")).toBeVisible();

  await page.getByLabel("Security area").selectOption("Authentication");
  await expect(page.locator("[data-control-card]:visible")).toHaveCount(0);
  await expect(page.getByText("No features match those filters.")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("[data-control-card]:visible")).toHaveCount(30);
  expect(externalRequests).toEqual([]);

  const violations = await new AxeBuilder({ page }).include("#main-content").analyze();
  expect(violations.violations).toEqual([]);
});

test("publishes share metadata, a social card, robots guidance, and the glossary", async ({
  page,
  request
}) => {
  await page.goto("/");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /ControlCurrent/u
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://slicedearth.github.io/controlcurrent/og.png"
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image"
  );

  const socialCard = await request.get("/og.png");
  expect(socialCard.ok()).toBe(true);
  expect([...(await socialCard.body()).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain(
    "Sitemap: https://slicedearth.github.io/controlcurrent/sitemap-index.xml"
  );

  await page.goto("/glossary/");
  await expect(page.getByRole("heading", { name: "ControlCurrent glossary" })).toBeVisible();
  await expect(page.getByText("Browser Compatibility Data (BCD)")).toBeVisible();
  await expect(page.getByText("Subresource Integrity (SRI)")).toBeVisible();
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

test("publishes a restrictive meta policy and refuses embedded interaction", async ({ page }) => {
  await page.goto("/assess/");
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(policy).toContain("script-src-attr 'none'");
  expect(policy).toContain("style-src-attr 'none'");
  expect(policy).toContain("connect-src 'none'");
  expect(policy).toContain("frame-src 'none'");
  expect(policy).toContain("worker-src 'none'");
  expect(policy).not.toContain("frame-ancestors");

  await page.route("http://127.0.0.1:4389/__frame-test.html", async (route) => {
    await route.fulfill({
      body: '<iframe title="Embedded ControlCurrent" src="/assess/"></iframe>',
      contentType: "text/html"
    });
  });
  await page.goto("http://127.0.0.1:4389/__frame-test.html");
  const embedded = page.frameLocator('iframe[title="Embedded ControlCurrent"]');
  await expect(embedded.getByRole("alert")).toContainText("Open ControlCurrent directly");
  await expect(embedded.getByLabel("HTTP response headers")).toBeHidden();
});
