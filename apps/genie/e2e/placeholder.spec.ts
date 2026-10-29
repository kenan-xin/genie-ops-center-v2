import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  e2ePlaceholderUngrantedEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

// The record page (Spec 7 AC-1, R-1, R-1a, R-2) is proved by "opens a record page by its route
// parameter with its trail and title, and touches the record from the browser" and "refuses a
// person without placeholder:use before the record loads", at both viewports with axe.

// The navigation filter, the refused route and the granted read (Spec 0 AC-11, R-34, R-35) are
// proved signed in by `done-when.spec.ts`; the admin guard and the WCAG 2.1 AA scan of a refused
// page by `section-2-screens.spec.ts`; the anonymous RPC envelope by
// `testing/rpc-unauthenticated.integration.test.ts`.

// The unscoped baseline, on the one screen that carries a level-one heading.
// Every axe rule, best-practice included, is asserted here; the WCAG 2.1 AA scans
// (DEC-21) of the other screens run in `section-2-screens.spec.ts`.
test("the ordinary document passes the unscoped axe baseline", async ({
  page,
}) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

// The criterion is "the policy strips nothing" (DEC-31 as amended: no nonce, and
// no `script-src`, `style-src` or `default-src` either). Both halves are observed
// through the browser's own refusals, because the rendered page cannot show
// either one: a policy that blocked the framework's inline bootstrap would leave
// the server-rendered markup and the computed margin exactly as they are, with
// hydration simply never running. That is the case this test exists for, and a
// `pageerror` listener cannot see it — a refused script never executes, so it
// never throws. The `securitypolicyviolation` events and the console refusals
// are what the browser emits instead.
declare global {
  interface Window {
    /** Written by the init script below and read back by `cspViolations`. */
    genieCspViolations?: string[];
  }
}

// The console wording this Chromium actually emits, measured against a policy
// that blocks the framework's inline bootstrap: "Executing inline script violates
// the following Content Security Policy directive 'script-src 'self'' … The
// action has been blocked." The older "Refused to execute …" phrasing is kept
// too, so a Chromium that reverts to it is still caught.
const CSP_REFUSAL =
  /violates the following Content Security Policy directive|Refused to (execute|apply|load)/i;

const cspViolations = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.genieCspViolations ?? []);

test("the policy strips no stylesheet and no script", async ({ page }) => {
  // Installed before the document's first script runs, so a refusal on the first
  // load cannot precede the listener.
  await page.addInitScript(() => {
    window.genieCspViolations = [];

    document.addEventListener("securitypolicyviolation", (event) => {
      window.genieCspViolations?.push(
        `${event.violatedDirective} ${event.blockedURI}`
      );
    });
  });

  const refusals: string[] = [];

  page.on("console", (message) => {
    if (CSP_REFUSAL.test(message.text())) {
      refusals.push(message.text());
    }
  });

  await page.goto("/");

  // The stylesheet half. Tailwind's preflight sets `body { margin: 0 }` while the
  // browser's own user-agent stylesheet leaves it at `8px`, so `0px` is a value
  // only the application stylesheet produces. `margin-top` is read rather than
  // the shorthand, so the assertion does not depend on how a browser formats a
  // four-sided shorthand.
  const margin = await page
    .locator("body")
    .evaluate((node) => getComputedStyle(node).getPropertyValue("margin-top"));

  expect(margin).toBe("0px");

  expect(await cspViolations(page)).toEqual([]);

  // A second navigation, so a listener that had been installed too late to see
  // the first load cannot carry the test.
  await page.reload();

  expect(await cspViolations(page)).toEqual([]);
  expect(refusals).toEqual([]);
});

test("opens a record page by its route parameter with its trail and title, and touches the record from the browser (Spec 7 AC-1, R-1, R-1a, R-2)", async ({
  page,
}, testInfo) => {
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("placeholder", testInfo.project.name),
  });

  const [id] = await queryDatabase(
    "select id from placeholder_record where label = 'e2e-visible'"
  );

  await page.goto(`/placeholder/${id}`);

  await expect(
    page.getByRole("heading", { level: 1, name: "e2e-visible" })
  ).toBeAttached();
  await expect(page).toHaveTitle(new RegExp(`^Placeholder record ${id} · .+$`));

  if ((page.viewportSize()?.width ?? 0) >= 768) {
    const trail = page.getByRole("navigation", { name: "breadcrumb" });

    await expect(
      trail.getByRole("link", { name: "Placeholder", exact: true })
    ).toHaveAttribute("href", "/placeholder");
    await expect(trail.getByText(`Placeholder record ${id}`)).toHaveAttribute(
      "aria-current",
      "page"
    );
  } else {
    await expect(
      page
        .getByRole("link", { name: "Placeholder", exact: true })
        .filter({ visible: true })
    ).toHaveAttribute("href", "/placeholder");
  }

  const touched = page.waitForResponse((response) =>
    response.url().endsWith("/api/rpc/placeholder/touch")
  );

  await page.getByRole("button", { name: "Touch record" }).click();
  expect((await touched).status()).toBe(200);
  await expect(
    page.getByRole("status").filter({ hasText: "Touch queued." })
  ).toBeVisible();
  // The scan reads the page at rest: the primary Button's hover contrast is bead `6wz1.87`.
  await page.mouse.move(0, 0);
  await expectNoAxeViolations(page, "placeholder record page");
});

test("refuses a person without placeholder:use before the record loads (Spec 7 AC-1, R-1)", async ({
  page,
}, testInfo) => {
  await signInThroughKeycloak(page, {
    email: e2ePlaceholderUngrantedEmail(testInfo.project.name),
  });

  const [id] = await queryDatabase(
    "select id from placeholder_record where label = 'e2e-visible'"
  );

  await page.goto(`/placeholder/${id}`);

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  await expect(page.getByText("e2e-visible")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "breadcrumb" })
  ).toHaveCount(0);
  expect(await page.title()).not.toContain("Placeholder record");
  await expectNoAxeViolations(page, "refused placeholder record page");
});
