import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import { evaluateProfile } from "../src/evaluate";
import { selectedSnapshotSchema } from "../src/contracts";
import { evidenceIdentity, evidenceSourceContext } from "../tests/helpers";

const selectedSnapshot = selectedSnapshotSchema.parse(
  JSON.parse(readFileSync(new URL("../data/selected-bcd.json", import.meta.url), "utf8")) as unknown
);

async function reportFixture() {
  return inspectEvidenceBundle(
    {
      schemaVersion: 4,
      name: "Synthetic deferred fixture",
      identity: evidenceIdentity,
      surfaces: [
        {
          id: "document",
          role: "document",
          requiredEvidence: ["response"],
          requiredControls: ["content-security-policy"],
          requiredComposites: []
        }
      ],
      responses: [
        {
          schemaVersion: 1,
          name: "Fixture",
          surfaceId: "document",
          headers: { "Content-Security-Policy": "default-src 'none'" }
        }
      ]
    },
    evidenceSourceContext
  );
}

async function deferredInputs(page: Page) {
  await page.addInitScript(() => {
    const gates: { kind: "file" | "hash"; release: () => Promise<void>; reject: () => void }[] = [];
    let activeHandlers = 0;
    const nativeAdd: unknown = Object.getOwnPropertyDescriptor(
      EventTarget.prototype,
      "addEventListener"
    )?.value;
    if (typeof nativeAdd !== "function") throw new Error("Missing native event registration");
    const originalAdd = (
      target: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ) => {
      Reflect.apply(nativeAdd, target, [type, listener, options]);
    };
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (typeof listener !== "function") {
        originalAdd(this, type, listener, options);
        return;
      }
      const wrapped: EventListener = function (this: EventTarget, event) {
        const result: unknown = listener.call(this, event);
        if (result instanceof Promise) {
          activeHandlers++;
          void result.then(
            () => {
              activeHandlers--;
            },
            () => {
              activeHandlers--;
            }
          );
        }
      };
      originalAdd(this, type, wrapped, options);
    };
    const originalText = (file: File) => Blob.prototype.text.call(file);
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let holdHash = false;
    Object.defineProperty(window, "auditDeferred", {
      value: {
        pending: () => gates.map((gate) => gate.kind),
        activeHandlers: () => activeHandlers,
        holdHash: (value: boolean) => {
          holdHash = value;
        },
        release: async (index: number, fail = false) => {
          const gate = gates[index];
          if (gate) {
            if (fail) gate.reject();
            else await gate.release();
          }
        }
      }
    });
    File.prototype.text = function () {
      return new Promise<string>((resolve, reject) =>
        gates.push({
          kind: "file",
          release: () => originalText(this).then(resolve, reject),
          reject: () => reject(new Error("Stale synthetic file error"))
        })
      );
    };
    crypto.subtle.digest = function (algorithm, data) {
      if (!holdHash) return originalDigest(algorithm, data);
      return new Promise<ArrayBuffer>((resolve, reject) =>
        gates.push({
          kind: "hash",
          release: () => originalDigest(algorithm, data).then(resolve, reject),
          reject: () => reject(new Error("Stale synthetic hash error"))
        })
      );
    };
  });
}
async function gate(
  page: Page,
  action: "release" | "holdHash",
  value: number | boolean,
  fail = false
) {
  await page.evaluate(
    async ({ action, value, fail }) => {
      const api = (
        window as unknown as {
          auditDeferred: {
            release(index: number, fail: boolean): Promise<void>;
            holdHash(value: boolean): void;
          };
        }
      ).auditDeferred;
      if (action === "release") await api.release(value as number, fail);
      else api.holdHash(value as boolean);
    },
    { action, value, fail }
  );
}
async function pending(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { auditDeferred: { pending(): string[] } }).auditDeferred.pending()
  );
}

async function settled(page: Page) {
  // Observe completion of the enclosing async event handlers, not just their
  // File.text or digest dependency. No arbitrary race delay is involved.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { auditDeferred: { activeHandlers(): number } }
        ).auditDeferred.activeHandlers()
      )
    )
    .toBe(0);
}

test("profile edits invalidate every derived export, including an empty browser selection", async ({
  page
}) => {
  await page.goto("/planner/");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Check support" }).click();
  await expect(page.locator("#export-profile")).toBeEnabled();
  await page.getByLabel("Profile name").fill("Edited plan");
  await expect(page.locator("#export-profile")).toBeDisabled();
  await expect(page.locator("#profile-results")).toBeHidden();
  await page.getByRole("button", { name: "Check support" }).click();
  await expect(page.locator("#export-profile")).toBeEnabled();
  for (const checkbox of await page.locator('input[name^="include-"]').all())
    await checkbox.uncheck();
  await expect(page.locator("#export-profile")).toBeDisabled();
  await page.getByRole("button", { name: "Check support" }).click();
  await expect(page.locator("#profile-results")).toBeHidden();
});

test("rejects an unavailable imported release without substituting the old select value", async ({
  page
}) => {
  await page.goto("/planner/");
  const prior = await page.locator('select[name="version-chrome"]').inputValue();
  await page.locator("#import-profile").setInputFiles({
    name: "invalid-version.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        name: "Unavailable plan",
        baselines: [{ browser: "chrome", minimumVersion: "999" }]
      })
    )
  });
  await expect(page.locator("#profile-message")).toContainText("cannot evaluate");
  await expect(page.locator('select[name="version-chrome"]')).toHaveValue(prior);
  await expect(page.getByLabel("Profile name")).not.toHaveValue("Unavailable plan");
});

test("supports session-only evaluation with a throwing storage getter", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Synthetic storage denial");
      }
    })
  );
  await page.goto("/planner/");
  await expect(page.locator("#profile-message")).toContainText("unavailable");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Check support" }).click();
  await expect(page.locator("#export-profile")).toBeEnabled();
  await page.getByRole("button", { name: "Save locally" }).click();
  await expect(page.locator("#profile-message")).toContainText("not saved");
});

test("clear and replacement supersede deferred evidence-file successes and errors", async ({
  page
}) => {
  await deferredInputs(page);
  await page.goto("/assess/");
  await page.locator(".advanced-assessment > summary").click();
  await page.locator("#bundle-file").setInputFiles({
    name: "first.json",
    mimeType: "application/json",
    buffer: Buffer.from("first")
  });
  await expect.poll(() => pending(page)).toEqual(["file"]);
  await page.getByRole("button", { name: "Clear" }).last().click();
  await gate(page, "release", 0);
  await settled(page);
  await expect(page.locator("#bundle-block")).toHaveValue("");
  await page
    .locator("#bundle-file")
    .setInputFiles({ name: "old.json", mimeType: "application/json", buffer: Buffer.from("old") });
  await page
    .locator("#bundle-file")
    .setInputFiles({ name: "new.json", mimeType: "application/json", buffer: Buffer.from("new") });
  await expect.poll(() => pending(page)).toEqual(["file", "file", "file"]);
  await gate(page, "release", 2);
  await expect(page.locator("#bundle-block")).toHaveValue("new");
  await gate(page, "release", 1, true);
  await settled(page);
  await expect(page.locator("#bundle-block")).toHaveValue("new");
  await expect(page.locator("#bundle-message")).not.toContainText("Stale synthetic");
});

test("clear during deferred hashing cannot restore the report or its export", async ({ page }) => {
  await deferredInputs(page);
  await page.goto("/assess/");
  await page.locator(".advanced-assessment > summary").click();
  await page.getByRole("button", { name: "Load redacted example" }).last().click();
  await gate(page, "holdHash", true);
  await page.getByRole("button", { name: "Review evidence file" }).click();
  await expect.poll(() => pending(page).then((items) => items.length)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Clear" }).last().click();
  await gate(page, "holdHash", false);
  for (let i = 0; i < (await pending(page)).length; i++) await gate(page, "release", i);
  await settled(page);
  await expect(page.locator("#bundle-results")).toBeHidden();
  await expect(page.locator("#export-bundle")).toBeDisabled();
  await expect(page.locator("#bundle-form")).toHaveAttribute("aria-busy", "false");
});

test("a profile edit cancels a deferred import before any form mutation", async ({ page }) => {
  await deferredInputs(page);
  await page.goto("/planner/");
  await page.locator("#import-profile").setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        name: "Stale import",
        baselines: [{ browser: "chrome", minimumVersion: "120" }]
      })
    )
  });
  await expect.poll(() => pending(page)).toEqual(["file"]);
  await page.getByLabel("Profile name").fill("Current plan");
  await gate(page, "release", 0);
  await settled(page);
  await expect(page.getByLabel("Profile name")).toHaveValue("Current plan");
  await expect(page.locator("#export-profile")).toBeDisabled();
});

test("preserves import-before-evaluation comparison input but clears it on a genuine edit", async ({
  page
}) => {
  await page.goto("/planner/");
  await page.getByRole("button", { name: "Load example" }).click();
  const earlier = evaluateProfile(selectedSnapshot, {
    schemaVersion: 1,
    name: "Example browser baseline",
    baselines: [
      { browser: "chrome", minimumVersion: "120" },
      { browser: "firefox", minimumVersion: "115" },
      { browser: "safari", minimumVersion: "17" }
    ]
  });
  await page.locator("#compare-profile").setInputFiles({
    name: "earlier.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(earlier))
  });
  await expect(page.locator("#profile-message")).toContainText("Earlier evaluation loaded");
  await page.getByRole("button", { name: "Check support" }).click();
  await expect(
    page.getByRole("heading", { name: "What changed since the earlier result" })
  ).toBeVisible();
  await page.getByLabel("Profile name").fill("New plan");
  await page.getByRole("button", { name: "Check support" }).click();
  await expect(
    page.getByRole("heading", { name: "What changed since the earlier result" })
  ).toBeHidden();
});

test("clear during deferred comparison hashing cannot restore comparison exports", async ({
  page
}) => {
  await deferredInputs(page);
  await page.goto("/assess/");
  await page.locator(".advanced-assessment > summary").click();
  await page.getByRole("button", { name: "Load redacted example" }).last().click();
  await page.getByRole("button", { name: "Review evidence file" }).click();
  await expect(page.locator("#bundle-results")).toBeVisible();
  await page.getByText("Compare with an earlier report", { exact: true }).click();
  await page.locator("#previous-report").fill(JSON.stringify(await reportFixture()));
  await gate(page, "holdHash", true);
  await page.locator("#compare-report").click();
  await expect.poll(() => pending(page).then((items) => items.length)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Clear" }).last().click();
  await gate(page, "holdHash", false);
  for (let i = 0; i < (await pending(page)).length; i++) await gate(page, "release", i);
  await settled(page);
  await expect(page.locator("#export-comparison")).toBeDisabled();
  await expect(page.locator("#bundle-results")).toBeHidden();
});

test("profile edits supersede deferred attachment validation and packet export", async ({
  page
}) => {
  await deferredInputs(page);
  await page.goto("/planner/");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Check support" }).click();
  await page
    .getByText("Turn this result into a reviewable browser policy", { exact: true })
    .click();
  await page.getByRole("button", { name: "Check policy" }).click();
  const report = await reportFixture();
  await page.getByLabel("Evidence result JSON").setInputFiles({
    name: "evidence.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report))
  });
  await expect.poll(() => pending(page)).toEqual(["file"]);
  await page.getByLabel("Profile name").fill("Replacement");
  await gate(page, "release", 0);
  await settled(page);
  await expect(page.locator("#export-decision-packet")).toBeDisabled();
  await page.getByRole("button", { name: "Check support" }).click();
  await page.getByRole("button", { name: "Check policy" }).click();
  await page.getByLabel("Evidence result JSON").setInputFiles({
    name: "evidence2.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report))
  });
  await gate(page, "release", 1);
  await expect(page.locator("#export-decision-packet")).toBeEnabled();
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await gate(page, "holdHash", true);
  await page.locator("#export-decision-packet").click();
  await expect.poll(() => pending(page).then((items) => items.length)).toBeGreaterThan(2);
  await page.getByLabel("Profile name").fill("Cancelled export");
  await gate(page, "holdHash", false);
  for (let i = 2; i < (await pending(page)).length; i++) await gate(page, "release", i);
  await settled(page);
  await expect(page.locator("#export-decision-packet")).toBeDisabled();
  expect(downloads).toEqual([]);
});

test("planner remains keyboard-operable at enlarged text @smoke", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/JavaScript eval|unsafe-eval/u.test(message.text())) errors.push(message.text());
  });
  await page.goto("/planner/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.getByRole("button", { name: "Load example" }).focus();
  await expect(page.getByRole("button", { name: "Load example" })).toBeFocused();
  // Exercise native non-submit and submit keyboard actions, without click helpers.
  await page.keyboard.press("Space");
  await expect(page.locator('input[name="include-chrome"]')).toBeChecked();
  await page.getByRole("button", { name: "Check support" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#profile-results")).toBeVisible();
  await page.setViewportSize({ width: 640, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});
