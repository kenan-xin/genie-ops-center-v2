import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * The criterion is WCAG 2.1 AA (DEC-21, `docs/core/tech-stack.md`), which is a
 * tag set, not "every rule axe ships". Scoping to it is deliberate: an unscoped
 * run also applies axe's best-practice rules, and one of them,
 * `page-has-heading-one`, is reported on the refused page below, which has no
 * level-one heading. That is a real best-practice finding and it is recorded in
 * the evidence; it is not a WCAG 2.1 AA failure, and asserting it here would
 * report the criterion as unmet when it is met.
 */
const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// Sign-in arrives with S2-04, so the browser is anonymous and the real
// evaluator grants it nothing. The navigation omits the entry whose permission
// refuses (R-34), and the route behind it is still mounted and still refuses
// on the server (R-35): hiding is never the enforcement. The signed-in success
// path at both viewports belongs to S2-04.
test("navigation omits the module entry and its route still refuses", async ({
  page,
}) => {
  await page.goto("/");

  // `exact` because the accessible name of "Placeholder settings" also contains
  // "Placeholder".
  await expect(
    page.getByRole("link", { name: "Placeholder", exact: true })
  ).toHaveCount(0);

  await page.goto("/placeholder");

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  // The refused page reveals nothing it would have rendered.
  await expect(page.getByText("No records yet.")).toHaveCount(0);

  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();

  expect(results.violations).toEqual([]);
});

// The unscoped baseline, on the one screen that carries a level-one heading.
// Every axe rule, best-practice included, is asserted here, so the scoped
// assertion above is not the only accessibility check in this layer.
test("the ordinary document passes the unscoped axe baseline", async ({
  page,
}) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test("the admin page is refused as well", async ({ page }) => {
  await page.goto("/admin/placeholder");

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Placeholder settings" })
  ).toHaveCount(0);
});

// The read procedure behind `placeholder:read`, through the real transport. An
// anonymous request holds no session, so the envelope answers `unauthenticated`
// at 401 rather than a bare permission refusal; the procedure's own `can()` is
// unchanged and still holds no grant. The authorized read through a real role
// assignment is proved at the integration layer.
test("the placeholder read procedure refuses an anonymous request through the real transport", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(
    `${baseURL}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
  );

  expect(response.status()).toBe(401);

  // SAFETY: the body is the tRPC envelope this route wrote, and the assertions
  // below check the fields this test reads.
  const body = (await response.json()) as {
    error?: { data?: { code?: string; appCode?: string } };
  };

  expect(body.error?.data?.code).toBe("UNAUTHORIZED");
  expect(body.error?.data?.appCode).toBe("unauthenticated");
});

// S2-04 restores the signed-in success proof: a person who signed in through the real Keycloak
// login form and holds `placeholder:read` through a real role assignment sees the module entry
// and the read returns the row. Anonymous refusal above stays as the R-35 control.
test("a signed-in person with a real grant sees the module entry and reads the placeholder row", async ({
  page,
}, testInfo) => {
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("placeholder", testInfo.project.name),
  });

  await expect(
    page.getByRole("link", { name: "Placeholder", exact: true })
  ).toBeVisible();

  const response = await page.request.get(
    `/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
  );

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("e2e-visible");
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
