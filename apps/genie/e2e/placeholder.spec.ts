import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

// The Section 0 main path, as the stub actually defines it. The stub grants
// `placeholder:read` and refuses everything else (R-13), and the workspace entry
// requires `placeholder:use`, so navigating there is a denial. Asserting a
// rendered workspace page here would be asserting an unauthorized success.
test("navigation is visible and the module page is refused", async ({
  page,
}) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Modules" });

  // `exact` because the accessible name of "Placeholder settings" also contains
  // "Placeholder", and a substring match would resolve to two links and fail
  // strict mode rather than exercise the main path.
  const placeholder = nav.getByRole("link", {
    name: "Placeholder",
    exact: true,
  });

  await expect(placeholder).toBeVisible();

  await placeholder.click();

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

// The one authorized success path Section 0 has: the read procedure behind the
// single granted key. Without this, every page assertion above is a denial and
// nothing proves the stub grants anything at all.
test("the placeholder read procedure succeeds through the real transport", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(
    `${baseURL}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
  );

  expect(response.status()).toBe(200);

  // SAFETY: the body is the tRPC envelope this route wrote, and the assertion
  // below checks the one field this test reads.
  const body = (await response.json()) as { result?: { data?: unknown } };

  expect(body.result).toBeDefined();
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
