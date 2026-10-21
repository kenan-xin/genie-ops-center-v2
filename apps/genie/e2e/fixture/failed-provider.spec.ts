import { expect, test, type Page, type Response } from "@playwright/test";

import { installFrameFixture } from "../fixtures/frame.ts";
import { logsUntil } from "./stack.ts";

/**
 * The failed, invalid and permitted provider proof (AC-25), restored as a
 * repeatable gate. It runs only through `playwright.fixture.config.ts` against
 * `genie-s005:fixture`, which `tools/build-fixture-image.ts` assembles outside
 * the repository, carrying the failing-viewer, invalid-viewer and
 * permitted-viewer fixture modules.
 *
 * No assertion here is satisfiable by an ordinary image: each case requires an
 * HTTP 200 document with exactly the one expected iframe, and a provider
 * invocation line for that module in the app service's own log. On an image
 * without the fixture modules every route is a 404 — no iframe, no provider
 * line — so these cases fail there instead of passing vacuously. The permitted
 * case additionally requires the frame's content to have actually loaded, so a
 * route interception that swallowed requests would fail it, and one that
 * intercepted nothing would fail the two denial cases.
 */

/** The policy a viewer document keeps when its origin provider fails or lies. */
const DENIED =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'";

/** The policy when the provider resolves the one permitted origin. */
const PERMITTED =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://embed.placeholder.example.com";

const FIXTURE_ORIGIN = "https://embed.placeholder.example.com";

/** The document, the iframe, and the provider line every case requires. */
async function assertRealViewerDocument(
  page: Page,
  moduleId: string
): Promise<Response | null> {
  const response = await page.goto(`/viewer/${moduleId}`);

  // A 404 or an error page is not the proof; the route must really serve.
  expect(response?.status()).toBe(200);

  // The viewer document embeds exactly the one frame, at the one src. A page
  // that never mounted the module renders no iframe at all.
  const frame = page.locator("iframe");
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute("src", `${FIXTURE_ORIGIN}/fixture`);

  // The provider ran for this module on this image — read from the app
  // service's own log, not inferred from the header.
  const logs = await logsUntil((seen) =>
    seen.includes('"moduleId":"' + moduleId + '"')
  );

  expect(logs).toContain("frame origin provider invoked");
  expect(logs).toContain(`"moduleId":"${moduleId}"`);

  return response;
}

for (const moduleId of ["failing-viewer", "invalid-viewer"]) {
  test(`a failed provider leaves the ${moduleId} frame blocked`, async ({
    page,
  }) => {
    const fixture = await installFrameFixture(page, FIXTURE_ORIGIN);

    const response = await assertRealViewerDocument(page, moduleId);

    // The response the browser received is still restrictive, and it carries
    // exactly one policy. A widened or duplicated policy fails here.
    expect(response?.headers()["content-security-policy"]).toBe(DENIED);

    // The failing provider's own failure line — the denial is its result.
    if (moduleId === "failing-viewer") {
      const logs = await logsUntil((seen) =>
        seen.includes("frame origin provider failed")
      );

      expect(logs).toContain('"moduleId":"failing-viewer"');
    }

    // No request for the fixture origin was issued and nothing from it is
    // displayed, because the frame never became permitted.
    expect(fixture.requests()).toBe(0);
    await expect(page.frameLocator("iframe").locator("#fixture")).toHaveCount(
      0
    );
  });
}

// The positive control, on the same harness and the same image: a provider
// that resolves a valid origin genuinely permits the frame.
test("the permitted-viewer provider permits its frame", async ({ page }) => {
  const fixture = await installFrameFixture(page, FIXTURE_ORIGIN);

  const response = await assertRealViewerDocument(page, "permitted-viewer");

  expect(response?.headers()["content-security-policy"]).toBe(PERMITTED);

  await expect(page.frameLocator("iframe").locator("#fixture")).toHaveText(
    "permitted frame content"
  );

  expect(fixture.requests()).toBeGreaterThanOrEqual(1);
});
