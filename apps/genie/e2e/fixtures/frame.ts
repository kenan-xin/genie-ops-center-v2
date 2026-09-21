import type { Page } from "@playwright/test";

export type FrameFixture = { readonly requests: () => number };

/**
 * Serves controlled content for the permitted origin. Policy enforcement stays
 * with the browser: when the policy denies the frame, no request is issued and
 * the counter stays at zero.
 */
export async function installFrameFixture(
  page: Page,
  origin: string
): Promise<FrameFixture> {
  let count = 0;

  await page.route(`${origin}/**`, async (route) => {
    count += 1;

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><html><body><p id="fixture">permitted frame content</p></body></html>',
    });
  });

  return { requests: () => count };
}
