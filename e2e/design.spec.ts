import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { selectedSnapshotSchema, changeEventSchema } from "../src/contracts";
import { evaluateProfile } from "../src/evaluate";
import { BROWSER_IDS } from "../src/browsers";
import { browserNames, outcomeLabels } from "../src/format";
import { SECURITY_CONTROLS } from "../src/catalogue";

const selectedSnapshot = selectedSnapshotSchema.parse(
  JSON.parse(readFileSync(new URL("../data/selected-bcd.json", import.meta.url), "utf8")) as unknown
);
const changeEvents = changeEventSchema
  .array()
  .parse(
    JSON.parse(
      readFileSync(new URL("../data/change-events.json", import.meta.url), "utf8")
    ) as unknown
  );
const currentProfile = {
  schemaVersion: 1 as const,
  name: "Current source fixture",
  baselines: BROWSER_IDS.map((browser) => {
    const release = selectedSnapshot.browsers[browser].releases
      .filter((item) => item.status === "current")
      .at(-1);
    if (!release) throw new Error(`Current release missing: ${browser}`);
    return { browser, minimumVersion: release.version };
  })
};
const currentEvaluation = evaluateProfile(selectedSnapshot, currentProfile);
test("the support instrument keeps every bundled browser result and explanation @workflow", async ({
  page
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  await page.goto("/");
  const selector = page.getByLabel("Choose a protection", { exact: true });
  await expect(selector.locator("option")).toHaveCount(SECURITY_CONTROLS.length);
  const outcomes = new Set<string>();
  for (const control of SECURITY_CONTROLS) {
    await selector.selectOption(control.id);
    const evaluations = currentEvaluation.results[control.id];
    if (!evaluations) throw new Error(`Missing source fixture: ${control.id}`);
    await expect(page.locator(".circuit-board h2")).toHaveText(control.name);
    await expect(page.locator("#circuit-selection-status")).toContainText(control.shortName);
    const terminals = page.locator("[data-circuit-browser]");
    await expect(terminals).toHaveCount(BROWSER_IDS.length);
    const readings = await terminals.evaluateAll((buttons) =>
      buttons.map((button) => ({
        browser: (button as HTMLElement).dataset.circuitBrowser,
        name: button.querySelector(".terminal-name > span")?.textContent.trim(),
        version: button.querySelector(".terminal-name strong")?.textContent.trim(),
        outcome: button.querySelector(".circuit-status > span")?.textContent.trim()
      }))
    );
    expect(readings).toEqual(
      evaluations.map((result) => ({
        browser: result.browser,
        name: browserNames[result.browser],
        version: result.minimumVersion,
        outcome: outcomeLabels[result.outcome]
      }))
    );
    for (const result of evaluations) outcomes.add(result.outcome);
    const result = evaluations.find((item) => item.browser === "firefox");
    if (!result) throw new Error("The Firefox source fixture is missing.");
    await page.locator('[data-circuit-browser="firefox"]').click();
    await expect(page.locator('[data-circuit-browser][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator("[data-reading-heading]")).toHaveText(
      `Firefox ${result.minimumVersion} · ${outcomeLabels[result.outcome]}`
    );
    await expect(page.locator("[data-reading-body]")).toHaveText(result.explanation);
    await expect(page.locator(".circuit-source-link")).toHaveAttribute(
      "href",
      `/controls/${control.id}/`
    );
  }
  expect(outcomes.has("unknown")).toBe(true);
  expect(outcomes.has("unavailable")).toBe(true);
  expect(outcomes.has("available_unqualified")).toBe(true);
  expect(externalRequests).toEqual([]);
});

test("the protection dial supports keyboard steps, pointer selection and narrow layouts @workflow", async ({
  page
}) => {
  await page.goto("/");
  const selector = page.getByLabel("Choose a protection", { exact: true });
  const first = SECURITY_CONTROLS[0];
  const last = SECURITY_CONTROLS.at(-1);
  if (!last) throw new Error("The catalogue fixture is empty.");
  await selector.selectOption(first.id);
  await page.getByRole("button", { name: "Previous protection", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(selector).toHaveValue(last.id);
  await expect(page.locator("#circuit-dial-number")).toHaveText(String(SECURITY_CONTROLS.length));
  await page.getByRole("button", { name: "Next protection", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(selector).toHaveValue(first.id);
  await expect(page.locator("#circuit-dial-number")).toHaveText("01");
  await page.locator(".dial-tick").nth(5).click();
  await expect(selector).toHaveValue(SECURITY_CONTROLS[5].id);
  await page.locator('[data-circuit-browser="safari"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-circuit-browser="safari"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await selector.selectOption("csp-nonces");
  await expect(page.locator('[data-circuit-browser][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator("[data-reading-heading]")).toHaveText("Open a browser reading.");
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(selector).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("both planning tasks remain reachable through the section navigation @workflow", async ({
  page
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Plan", exact: true })
    .click();
  await expect(page.locator("#profile-form")).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Plan pages" });
  await expect(tabs.getByRole("link", { name: "Choose browser versions" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await tabs.getByRole("link", { name: "Find minimum versions" }).click();
  await expect(page).toHaveURL(/\/minimums\/$/u);
  await expect(page.locator("#minimum-form")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Plan pages" })
      .getByRole("link", { name: "Find minimum versions" })
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Find oldest versions" }).click();
  await expect(page.locator("#minimum-result-list .result-card")).toHaveCount(4);
});

test("the grouped index filters empty groups and reveals all nine browser results with the keyboard", async ({
  page
}) => {
  await page.goto("/controls/");
  const groups = page.locator("[data-control-group]");
  const count = await groups.count();
  expect(count).toBeGreaterThan(1);
  await page.getByLabel("Search features").fill("clickjacking");
  await expect(page.locator("[data-control-group]:visible")).toHaveCount(1);
  const entry = page.locator("[data-control-card]:visible");
  await entry.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(entry.locator(".mini-results > span")).toHaveCount(9);
  await expect(entry.locator(".mini-results")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("[data-control-group]:visible")).toHaveCount(count);
  await expect(page.locator("[data-control-card]:visible")).toHaveCount(SECURITY_CONTROLS.length);
});

test("update-log pagination preserves complete totals, order and keyboard focus", async ({
  page
}) => {
  await page.goto("/changes/");
  const pager = page.getByRole("navigation", { name: "Update log pages", exact: true });
  const total = changeEvents.length;
  const pages = Math.ceil(total / 20);
  await expect(page.locator("[data-event-row]")).toHaveCount(total);
  await expect(pager.getByRole("button", { name: "Previous" })).toBeDisabled();
  const summaries: string[] = [];
  for (let index = 0; index < pages; index += 1) {
    const start = index * 20;
    await expect(pager).toContainText(
      `Events ${String(start + 1)}–${String(Math.min(start + 20, total))} of ${String(total)}`
    );
    await expect(page.locator("[data-event-row]:visible")).toHaveCount(Math.min(20, total - start));
    summaries.push(...(await page.locator("[data-event-row]:visible h3").allTextContents()));
    if (index < pages - 1) {
      await pager.getByRole("button", { name: "Next" }).click();
      await expect(page.locator("#timeline-heading")).toBeFocused();
    }
  }
  expect(summaries).toEqual([...changeEvents].reverse().map((item) => item.summary));
  await expect(pager.getByRole("button", { name: "Next" })).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Update log pages, bottom", exact: true })
    .getByRole("button", { name: "Previous" })
    .click();
  await expect(pager).toContainText(`Page ${String(pages - 1)} of ${String(pages)}`);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("navigation, catalogue details and the complete update log work without JavaScript", async ({
  browser,
  baseURL
}) => {
  if (!baseURL) throw new Error("The controlled browser fixture origin is unavailable.");
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find the break." })).toBeVisible();
  await expect(page.locator("[data-circuit-browser]")).toHaveCount(BROWSER_IDS.length);
  await expect(page.getByLabel("Choose a protection", { exact: true })).toBeDisabled();
  const fallback = page
    .locator(".instrument-input")
    .getByRole("link", { name: "feature index", exact: true });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute("href", "/controls/");
  await page.goto("/controls/");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.locator("[data-control-card]:visible")).toHaveCount(SECURITY_CONTROLS.length);
  await page.locator(".control-support summary").first().click();
  await expect(page.locator(".mini-results").first()).toBeVisible();
  await page.goto("/changes/");
  await expect(page.locator("[data-event-row]:visible")).toHaveCount(changeEvents.length);
  await expect(page.locator(".event-pagination").first()).toBeHidden();
  await context.close();
});

for (const path of [
  "/minimums/",
  "/data/",
  "/methodology/",
  "/privacy/",
  "/controls/trusted-types/"
]) {
  test(`reference and planning layout passes accessibility checks: ${path}`, async ({ page }) => {
    await page.goto(path);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
