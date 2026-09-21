import { expect, test } from "@playwright/test";

import { installFrameFixture } from "./fixtures/frame.ts";

// This case needs the disposable image built with the failing-viewer and
// invalid-viewer modules, which the ordinary browser run does not contain.
// Against the ordinary image both paths are a 404 and every assertion below
// would pass for the wrong reason, so the whole file is skipped unless that
// deployment is named.
test.skip(
  process.env.GENIE_FAILING_VIEWER !== "1",
  "needs the failing-provider image on E2E_BASE_URL"
);

/** The policy a viewer document keeps when its origin provider fails or lies. */
const DENIED =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'";

for (const moduleId of ["failing-viewer", "invalid-viewer"]) {
  test(`a failed provider leaves the ${moduleId} frame blocked`, async ({
    page,
  }) => {
    const fixture = await installFrameFixture(
      page,
      "https://embed.placeholder.example.com"
    );

    const response = await page.goto(`/viewer/${moduleId}`);

    // The response the browser received is still restrictive, and it carries
    // exactly one policy. A widened or duplicated policy fails here.
    expect(response?.headers()["content-security-policy"]).toBe(DENIED);

    await page.waitForTimeout(1000);

    // No request for the fixture origin was issued and nothing from it is
    // displayed, because the frame never became permitted.
    expect(fixture.requests()).toBe(0);
    await expect(page.frameLocator("iframe").locator("#fixture")).toHaveCount(
      0
    );
  });
}
