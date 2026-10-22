import { expect, test } from "@playwright/test";

import { installFrameFixture } from "./fixtures/frame.ts";

const PERMITTED = "https://embed.placeholder.example.com";

// AC-25 from a page. The policy each response carries, including the frame, object, ancestor and
// base-uri directives the browser enforces, is asserted per route by
// `testing/headers.integration.test.ts`.
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
