import { expect, test } from "@playwright/test";

import { installFrameFixture } from "./fixtures/frame.ts";

const PERMITTED = "https://embed.placeholder.example.com";

const UNLISTED = "https://not-permitted.example.com";

test("the viewer loads the permitted frame after a full document navigation", async ({
  page,
}) => {
  const fixture = await installFrameFixture(page, PERMITTED);

  await page.goto("/");

  // A full document navigation, so the response installs the policy first.
  await page.goto("/viewer/placeholder");

  const frame = page.frameLocator("iframe");

  await expect(frame.locator("#fixture")).toBeVisible();
  await expect(frame.locator("#fixture")).toHaveText("permitted frame content");
  expect(fixture.requests()).toBeGreaterThan(0);
});

test("an ordinary page cannot load the same frame", async ({ page }) => {
  const fixture = await installFrameFixture(page, PERMITTED);

  await page.goto("/");

  await page.evaluate((src) => {
    const frame = document.createElement("iframe");

    frame.src = `${src}/fixture`;
    frame.id = "injected";
    document.body.append(frame);
  }, PERMITTED);

  await page.waitForTimeout(1000);

  // The policy denies frames, so the browser never issues the request.
  expect(fixture.requests()).toBe(0);
  await expect(page.frameLocator("#injected").locator("#fixture")).toHaveCount(
    0
  );
});

test("the viewer refuses an unlisted origin", async ({ page }) => {
  const unlisted = await installFrameFixture(page, UNLISTED);

  await page.goto("/viewer/placeholder");

  await page.evaluate((src) => {
    const frame = document.createElement("iframe");

    frame.src = `${src}/fixture`;
    frame.id = "unlisted";
    document.body.append(frame);
  }, UNLISTED);

  await page.waitForTimeout(1000);

  expect(unlisted.requests()).toBe(0);
});

test("another page cannot frame the application", async ({ page, baseURL }) => {
  await page.setContent(`<iframe id="outer" src="${baseURL}/"></iframe>`);

  await page.waitForTimeout(1000);

  // frame-ancestors 'none' blocks the embed, so the document never renders.
  await expect(page.frameLocator("#outer").getByRole("heading")).toHaveCount(0);
});

test("object content is blocked", async ({ page }) => {
  await page.goto("/");

  const loaded = await page.evaluate(async () => {
    const element = document.createElement("object");

    element.data = "/probe.txt";
    document.body.append(element);
    await new Promise((settle) => setTimeout(settle, 500));

    return element.contentDocument !== null;
  });

  expect(loaded).toBe(false);
});

test("a cross-origin base element cannot change URL resolution", async ({
  page,
}) => {
  await page.goto("/");

  const resolved = await page.evaluate(() => {
    const base = document.createElement("base");

    base.href = "https://attacker.example.com/";
    document.head.append(base);

    const anchor = document.createElement("a");

    anchor.href = "relative";

    return anchor.href;
  });

  // base-uri 'self' means the injected base is ignored.
  expect(resolved).not.toContain("attacker.example.com");
});
