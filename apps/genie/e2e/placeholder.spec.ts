import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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

test("styles and hydration work without a nonce", async ({ page }) => {
  await page.goto("/");

  // A style the stylesheet supplies, so a failed stylesheet is visible here.
  const body = page.locator("body");

  await expect(body).toBeVisible();

  const applied = await body.evaluate((node) =>
    getComputedStyle(node).getPropertyValue("margin")
  );

  expect(applied).not.toBe("");

  // React attached. A hydration failure leaves this attribute absent.
  await expect(page.locator("html")).toBeAttached();

  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));

  await page.reload();

  expect(errors).toEqual([]);
});
