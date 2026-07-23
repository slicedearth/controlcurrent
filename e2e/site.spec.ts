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
  await expect(page.locator(".result-card")).toHaveCount(29);
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
  for (const path of ["/", "/matrix/", "/planner/", "/changes/"]) {
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
