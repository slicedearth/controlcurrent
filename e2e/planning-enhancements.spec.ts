import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { selectedSnapshotSchema, type DeploymentProfile } from "../src/contracts";
import { planFragment } from "../src/plan-transfer";
import { PLAN_LIBRARY_KEY } from "../src/plan-library";

const selectedSnapshot = selectedSnapshotSchema.parse(
  JSON.parse(readFileSync(new URL("../data/selected-bcd.json", import.meta.url), "utf8")) as unknown
);

test("minimum results transfer the complete selected scope without persistence @workflow", async ({
  page
}) => {
  await page.goto("/minimums/");
  for (const checkbox of await page.locator('input[name="minimum-control"]').all())
    await checkbox.uncheck();
  for (const checkbox of await page.locator('input[name="minimum-browser"]').all())
    await checkbox.uncheck();
  await page.locator('input[name="minimum-control"][value="referrer-policy"]').check();
  await page.locator('input[name="minimum-browser"][value="chrome"]').check();
  await page.getByRole("button", { name: "Find oldest versions" }).click();
  await expect(page.locator("#minimum-result-list")).toContainText("Version 56");
  await page.getByRole("link", { name: "Use these minimums" }).click();
  await expect(page.locator('select[name="version-chrome"]')).toHaveValue("56");
  await expect(page.locator('input[name="include-chrome"]')).toBeChecked();
  await expect(page.locator('input[name="required-control"]:checked')).toHaveCount(1);
  await expect(
    page.locator('input[name="required-control"][value="referrer-policy"]')
  ).toBeChecked();
  expect(await page.evaluate(() => ({ hash: location.hash, stored: localStorage.length }))).toEqual(
    { hash: "", stored: 0 }
  );
  await page.goto("/minimums/");
  await page.locator('input[name="minimum-control"][value="csp-nonces"]').check();
  await page.getByRole("button", { name: "Find oldest versions" }).click();
  await expect(page.locator("#use-minimums")).toBeHidden();
  await expect(page.locator("#minimum-transfer-status")).toContainText("every selected browser");
});

test("editable plan comparisons retain complete totals through filtering and export @workflow", async ({
  page
}) => {
  await page.goto("/compare/");
  await page.locator('[name="before-version-chrome"]').selectOption("40");
  await page.getByRole("button", { name: "Copy A to B" }).click();
  await expect(page.locator("#live-comparison-totals")).toContainText("0 gained · 0 lost");
  await page.locator('[name="after-version-chrome"]').selectOption("120");
  await expect(page.locator("#live-comparison-totals")).toContainText(/[1-9]\d* gained/u);
  const totals = await page.locator("#live-comparison-totals").textContent();
  await page.locator("#comparison-changes-only").uncheck();
  await expect(page.locator("#live-comparison-rows tr:visible")).toHaveCount(108);
  await expect(page.locator("#live-comparison-totals")).toHaveText(totals ?? "");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export comparison JSON" }).click();
  const downloaded = await downloadPromise;
  const path = await downloaded.path();
  if (!path) throw new Error("Missing comparison download");
  const output = JSON.parse(await readFile(path, "utf8")) as {
    summary: { gained: number };
    events: unknown[];
  };
  expect(output.summary.gained).toBeGreaterThan(0);
  expect(output.events.length).toBe(36);
  await page.locator('[name="after-include-firefox"]').uncheck();
  await expect(page.locator("#live-comparison-totals")).toContainText("36 scope removals");
  await page.locator('[name="after-name"]').fill("Changed name");
  await expect(page.locator("#live-comparison")).toBeHidden();
});

test("suggested increases preserve browsers and refuse unmapped feature guesses @workflow", async ({
  page
}) => {
  await page.goto("/compare/");
  await page.locator('[name="after-version-chrome"]').selectOption("40");
  await page.getByText("Choose required features", { exact: true }).click();
  await page.locator('[name="upgrade-control"][value="referrer-policy"]').check();
  await page.getByRole("button", { name: "Find the required increases" }).click();
  await expect(page.locator("#upgrade-status")).toContainText("Chrome 56");
  await page.getByRole("button", { name: "Apply proposed minimums to B" }).click();
  await expect(page.locator('[name="after-version-chrome"]')).toHaveValue("56");
  await expect(page.locator('[data-plan-side="after"] input[type="checkbox"]:checked')).toHaveCount(
    3
  );
  await page.locator('[name="upgrade-control"][value="csp-nonces"]').check();
  await page.getByRole("button", { name: "Find the required increases" }).click();
  await expect(page.locator("#apply-upgrade")).toBeDisabled();
  await expect(page.locator("#upgrade-status")).toContainText("CSP nonces");
});

test("named plans save, rename, duplicate, export and delete independently @workflow", async ({
  page
}) => {
  await page.goto("/planner/");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByRole("button", { name: "Save current as a new plan" }).click();
  await expect(page.locator("#saved-plan option")).toHaveCount(2);
  await page.locator("#saved-plan-name").fill("<script>Literal plan</script>");
  await page.getByRole("button", { name: "Rename selected" }).click();
  await expect(page.locator("#saved-plan option:checked")).toHaveText(
    "<script>Literal plan</script>"
  );
  await page.getByRole("button", { name: "Duplicate selected" }).click();
  await expect(page.locator("#saved-plan option")).toHaveCount(3);
  await page.getByRole("button", { name: "Load selected" }).click();
  await expect(page.locator('[name="profile-name"]')).toHaveValue(
    "<script>Literal plan</script> (copy)"
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export selected" }).click();
  const downloaded = await downloadPromise;
  const path = await downloaded.path();
  if (!path) throw new Error("Missing plan download");
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
    schemaVersion: 1,
    name: "<script>Literal plan</script> (copy)"
  });
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(page.locator("#saved-plan option")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("#saved-plan option")).toHaveCount(2);
  await page.goto("/compare/");
  await expect(page.locator('[data-saved-side="before"] option')).toHaveCount(2);
  await page
    .locator('[data-saved-side="before"]')
    .selectOption({ label: "<script>Literal plan</script>" });
  await expect(page.locator('[name="before-name"]')).toHaveValue("<script>Literal plan</script>");
});

for (const side of ["before", "after"]) {
  for (const failure of ["deleted", "unavailable release"]) {
    test(`saved plan ${failure} on ${side} keeps the load error and invalidates outputs @workflow`, async ({
      page,
      context
    }) => {
      const id = "11111111-1111-4111-8111-111111111111";
      await page.goto("/compare/");
      await page.evaluate(
        ({ key, id, version }) => {
          localStorage.setItem(
            key,
            JSON.stringify({
              schemaVersion: 1,
              plans: [
                {
                  id,
                  profile: {
                    schemaVersion: 1,
                    name: "Saved fixture",
                    baselines: [{ browser: "chrome", minimumVersion: version }]
                  }
                }
              ]
            })
          );
        },
        { key: PLAN_LIBRARY_KEY, id, version: failure === "deleted" ? "56" : "9999" }
      );
      await page.reload();
      await page.locator('[name="after-version-chrome"]').selectOption("40");
      await page.getByText("Choose required features", { exact: true }).click();
      await page.locator('[name="upgrade-control"][value="referrer-policy"]').check();
      await page.getByRole("button", { name: "Find the required increases" }).click();
      await expect(page.locator("#apply-upgrade")).toBeEnabled();
      await expect(page.locator("#live-comparison")).toBeVisible();
      const fields = page.locator("#compare-plans-form input, #compare-plans-form select[name]");
      const before = await fields.evaluateAll((elements) =>
        elements.map((element) => ({
          value: (element as HTMLInputElement).value,
          checked: (element as HTMLInputElement).checked,
          disabled: (element as HTMLInputElement).disabled
        }))
      );
      const saved = page.locator(`[data-saved-side="${side}"]`);
      await saved.focus();
      if (failure === "deleted") {
        const otherTab = await context.newPage();
        await otherTab.goto("/privacy/");
        await otherTab.evaluate((key) => localStorage.removeItem(key), PLAN_LIBRARY_KEY);
        await otherTab.close();
        await expect(saved.locator(`option[value="${id}"]`)).toHaveCount(1);
      }
      await saved.selectOption(id);
      await expect(page.locator("#compare-plans-status")).toContainText(
        failure === "deleted" ? "no longer available" : "no selectable chrome 9999 release"
      );
      await expect(page.locator("#live-comparison")).toBeHidden();
      await expect(page.locator("#export-plan-comparison")).toBeDisabled();
      await expect(page.locator("#use-plan-a")).not.toHaveAttribute("href");
      await expect(page.locator("#use-plan-b")).not.toHaveAttribute("href");
      await expect(page.locator("#apply-upgrade")).toBeDisabled();
      await expect(page.locator("#upgrade-status")).toBeEmpty();
      expect(
        await fields.evaluateAll((elements) =>
          elements.map((element) => ({
            value: (element as HTMLInputElement).value,
            checked: (element as HTMLInputElement).checked,
            disabled: (element as HTMLInputElement).disabled
          }))
        )
      ).toEqual(before);
      const downloads: string[] = [];
      page.on("download", (download) => downloads.push(download.suggestedFilename()));
      await page.locator("#export-plan-comparison").dispatchEvent("click");
      await expect(page.locator("#compare-plans-status")).toContainText(
        "Compare the current plans before exporting"
      );
      expect(downloads).toEqual([]);
      await page.locator('[name="after-version-chrome"]').selectOption("56");
      await expect(page.locator("#live-comparison")).toBeVisible();
      await expect(page.locator("#export-plan-comparison")).toBeEnabled();
    });
  }
}

test("saved plans update each comparison side independently and allow manual changes @workflow", async ({
  page
}) => {
  await page.goto("/compare/");
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        plans: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            profile: {
              schemaVersion: 1,
              name: "Single browser plan",
              baselines: [{ browser: "chrome", minimumVersion: "56" }]
            }
          }
        ]
      })
    );
  }, PLAN_LIBRARY_KEY);
  await page.reload();
  await page.locator('[data-saved-side="before"]').selectOption({ label: "Single browser plan" });
  await expect(page.locator('[name="before-name"]')).toHaveValue("Single browser plan");
  await expect(page.locator('[name="before-version-chrome"]')).toHaveValue("56");
  await expect(page.locator('[data-plan-side="before"] input:checked')).toHaveCount(1);
  await expect(page.locator('[name="after-name"]')).toHaveValue("Proposed browser plan");
  await expect(page.locator('[data-plan-side="after"] input:checked')).toHaveCount(3);
  await page.locator('[data-saved-side="after"]').selectOption({ label: "Single browser plan" });
  await expect(page.locator("#live-comparison-totals")).toContainText("36 unchanged");
  await expect(page.locator('[name="after-version-chrome"]')).toHaveValue("56");
  await page.locator('[name="after-version-chrome"]').selectOption("40");
  await expect(page.locator("#live-comparison-totals")).toContainText(/[1-9]\d* lost/u);
  await expect(page.locator('[name="before-version-chrome"]')).toHaveValue("56");
  await expect(page.locator("#compare-plans-status")).toContainText("Both plans evaluated locally");
  await expect(page.locator("#use-plan-a")).toHaveAttribute("href", /\/planner\/#plan=/u);
  await expect(page.locator("#export-plan-comparison")).toBeEnabled();
});

test("inspection separates header declarations from plan compatibility and clears stale results @workflow", async ({
  page
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1") external.push(request.url());
  });
  const inspectionPlan: DeploymentProfile = {
    schemaVersion: 1,
    name: "Inspection plan",
    baselines: [
      { browser: "chrome", minimumVersion: "120" },
      { browser: "firefox", minimumVersion: "115" }
    ]
  };
  const fragment = planFragment(selectedSnapshot, inspectionPlan);
  await page.goto(`/assess/${fragment}`);
  await expect(page.locator("#inspector-plan-status")).toContainText("Inspection plan");
  await page
    .locator("#header-block")
    .fill("Content-Security-Policy: default-src 'none'\nX-Content-Type-Options: nosniff");
  await page.getByRole("button", { name: "Review headers", exact: true }).click();
  await expect(page.locator(".inspection-compatibility")).toHaveCount(36);
  await expect(page.locator(".inspection-compatibility").first()).toContainText("Chrome 120");
  expect(await page.evaluate(() => ({ hash: location.hash, stored: localStorage.length }))).toEqual(
    { hash: "", stored: 0 }
  );
  await page.locator("#header-block").fill("X-Content-Type-Options: nosniff");
  await expect(page.locator("#header-results")).toBeHidden();
  await page.getByRole("button", { name: "Review headers", exact: true }).click();
  await page.getByRole("button", { name: "Clear browser plan" }).click();
  await expect(page.locator("#header-results")).toBeHidden();
  await page.getByRole("button", { name: "Review headers", exact: true }).click();
  await expect(page.locator(".inspection-compatibility")).toHaveCount(0);
  await page.locator("#inspector-plan-file").setInputFiles({
    name: "browser-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(inspectionPlan))
  });
  await expect(page.locator("#inspector-plan-status")).toContainText("Inspection plan");
  await expect(page.locator("#header-results")).toBeHidden();
  await page.getByRole("button", { name: "Review headers", exact: true }).click();
  await expect(page.locator(".inspection-compatibility").first()).toContainText("Firefox 115");
  await page.locator("#inspector-plan-file").setInputFiles({
    name: "invalid-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...inspectionPlan, rawHeaders: "private fixture" }))
  });
  await expect(page.locator("#inspector-plan-status")).toContainText("Choose a valid browser plan");
  await expect(page.locator("#header-results")).toBeHidden();
  await page.getByRole("button", { name: "Review headers", exact: true }).click();
  await expect(page.locator(".inspection-compatibility")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.evaluate((profile) => {
    localStorage.setItem(
      "controlcurrent.plans.v1",
      JSON.stringify({
        schemaVersion: 1,
        plans: [{ id: "11111111-1111-4111-8111-111111111111", profile }]
      })
    );
  }, inspectionPlan);
  await page.reload();
  await page.locator("#inspector-plan").selectOption({ label: "Inspection plan" });
  await expect(page.locator("#inspector-plan-status")).toContainText("Chrome 120");
  await page.locator("#header-block").fill("X-Content-Type-Options: nosniff");
  await page.getByRole("button", { name: "Review headers", exact: true }).click();
  await expect(page.locator(".inspection-compatibility")).toHaveCount(36);
  expect(external).toEqual([]);
});

test("release traces keep Safari removal gaps and no-script access @workflow", async ({
  page,
  browser
}) => {
  await page.goto("/controls/partitioned-cookies/");
  await page.getByLabel("Timeline browser").selectOption("safari");
  const history = page.locator('[data-timeline-browser="safari"]');
  await expect(history).toContainText("No longer supported");
  await expect(history).toContainText("26.2");
  await expect(page.locator("[data-timeline-browser]:visible")).toHaveCount(1);
  const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  try {
    const offline = await context.newPage();
    await offline.goto(page.url());
    await expect(offline.locator("[data-timeline-browser]:visible")).toHaveCount(9);
  } finally {
    await context.close();
  }
});

test("dependency circuits expose alternatives, unresolved data and separate review claims @workflow", async ({
  page
}) => {
  await page.goto("/circuits/");
  await expect(page.locator(".dependency-terminal")).toHaveCount(2);
  await page.locator("#circuit-alternative").selectOption("alternative");
  await expect(page.locator(".dependency-terminal").nth(1)).toContainText("credentialless");
  await page.locator("#circuit-goal").selectOption("script-loading");
  await page.locator("#circuit-alternative").selectOption("alternative");
  await page.locator(".dependency-terminal").nth(1).click();
  await expect(page.locator("#dependency-detail-title")).toHaveText("CSP hash sources");
  await expect(page.locator(".dependency-terminal").nth(1)).toContainText(
    "Not enough browser data"
  );
  await page.locator("#dependency-reviews input").first().check();
  await expect(page.locator("#dependency-review-status")).toContainText(
    "1 of 4 checks marked reviewed by you"
  );
  await page.locator("#circuit-goal").selectOption("logout");
  await expect(page.locator("#dependency-review-status")).toContainText("0 of 4");
  await expect(page.locator(".dependency-terminal")).toHaveCount(3);
  await expect(page.locator("#dependency-caveat")).toContainText("separate clearing instructions");
});

test("public test snapshots show exact runs and complete file/subtest totals @workflow", async ({
  page
}) => {
  await page.goto("/evidence/");
  await expect(page.locator(".wpt-suite")).toHaveCount(5);
  await page
    .getByText("Exact browser builds, systems and source revision", { exact: true })
    .click();
  await expect(page.locator(".wpt-run-details")).toContainText("6218298311311360");
  await expect(page.locator(".wpt-run-details")).toContainText(
    "cc74d2669f5de548e808779877d1d33339ec5115"
  );
  const permissions = page.locator(".wpt-suite").first();
  await expect(permissions.getByRole("columnheader", { name: "File outcomes" })).toBeVisible();
  await expect(page.locator(".wpt-snapshot")).toContainText(
    "Pass and Fail can also describe tests without a harness"
  );
  await expect(permissions).toContainText("118 test files retained from 161");
  await permissions.getByText("Read all 118 retained file results", { exact: true }).click();
  await expect(permissions.locator(".wpt-file-results tbody tr")).toHaveCount(118);
  await expect(permissions).toContainText("Timeout");
});

for (const [id, files, chromeTotals, scope] of [
  ["permissions-policy-camera", 4, "4 / 4", "potential-violation"],
  ["permissions-policy-microphone", 2, "2 / 2", "media-test automation"],
  ["permissions-policy-geolocation", 2, "1 / 2", "location availability"],
  ["clear-site-data-cache", 4, "21 / 29", "tentative partitioning"],
  ["clear-site-data-cookies", 2, "2 / 2", "response header ordering"],
  ["clear-site-data-storage", 1, "10 / 10", "backends available in that browser"]
] as const) {
  test(`directive evidence for ${id} shows exact file totals and scope @workflow`, async ({
    page
  }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname !== "127.0.0.1") externalRequests.push(request.url());
    });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/controls/${id}/`);
    const suite = page.locator(".wpt-suite");
    await expect(suite).toHaveCount(1);
    await expect(suite).toContainText(
      `${String(files)} of ${String(files)} selected test files have retained results.`
    );
    await expect(page.locator(".wpt-selection-scope")).toContainText(scope);
    await expect(page.locator(".wpt-selection-scope")).toContainText(
      "not isolated directive pass counts or application evidence"
    );
    const totals = suite.locator(":scope > .table-wrap tbody tr");
    await expect(totals).toHaveCount(3);
    await expect(totals.filter({ hasText: "chrome" })).toContainText(chromeTotals);
    await suite
      .getByText(`Read all ${String(files)} retained file results`, { exact: true })
      .click();
    await expect(suite.locator(".wpt-file-results tbody tr")).toHaveCount(files);
    await suite.getByText("Source-response fingerprint", { exact: true }).click();
    await expect(suite).toContainText("complete downloaded directory response");
    const sources = page.locator("aside").getByRole("link", { name: "reviewed test source" });
    await expect(sources).toHaveCount(files);
    for (const link of await sources.all())
      await expect(link).toHaveAttribute(
        "href",
        /^https:\/\/github\.com\/web-platform-tests\/wpt\/blob\/cc74d2669f5de548e808779877d1d33339ec5115\//u
      );
    const dimensions = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(externalRequests).toEqual([]);
  });
}

test("new workflows remain usable with blocked storage and narrow layouts @workflow", async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      }
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/planner/",
    "/compare/",
    "/circuits/",
    "/controls/permissions-policy-camera/"
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  }
  await page.goto("/planner/");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByRole("button", { name: "Save current as a new plan" }).click();
  await expect(page.locator("#library-status")).toContainText("unavailable");
  await page.getByRole("button", { name: "Check support", exact: true }).click();
  await expect(page.locator("#profile-results")).toBeVisible();
});
