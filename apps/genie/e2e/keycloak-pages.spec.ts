import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  E2E_LOCAL_ADMIN_PASSWORD,
  E2E_LOCAL_REALM,
  createRealmUser,
  deleteRealmUser,
  e2eLocalBaseUrl,
} from "../testing/e2e-keycloak.ts";
import { waitForLink } from "./support/mailpit.ts";

/**
 * The four Keycloak local-account pages (bead `6wz1.2`) at the phone and the desktop viewport:
 * sign-in, reset password, set password, and verify email. They are Keycloak's own built-in theme,
 * so the check is that each fits the viewport with no horizontal scroll, shows its form, and has
 * no serious or critical axe violation. A fix is limited to a realm setting or a built-in theme.
 *
 * It runs against the S-F local-accounts stack, the one realm with a password form and SMTP.
 * Each project uses its own realm users, so the two projects never share an account.
 */
test.use({ baseURL: e2eLocalBaseUrl() });

test.describe.configure({ timeout: 180_000 });

/** The fit, form and axe check every Keycloak page passes, with a screenshot as evidence. */
async function checkKeycloakPage(
  page: Page,
  testInfo: TestInfo,
  name: string,
  marker: Locator
): Promise<void> {
  await expect(marker).toBeVisible({ timeout: 30_000 });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );

  expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    violations
      .filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical"
      )
      .map(
        (violation) =>
          `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`
      ),
    `${name} has serious axe violations`
  ).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
}

/** A fresh realm user of this project, so a rerun starts from the same state. */
async function freshRealmUser(
  email: string,
  emailVerified: boolean
): Promise<void> {
  await deleteRealmUser(E2E_LOCAL_REALM, email);
  await createRealmUser(E2E_LOCAL_REALM, {
    email,
    password: E2E_LOCAL_ADMIN_PASSWORD,
    emailVerified,
  });
}

test("the Keycloak sign-in and reset-password pages fit the viewport and pass axe", async ({
  page,
}, testInfo) => {
  const email = `e2e.kc-pages.reset.${testInfo.project.name}@example.invalid`;

  await freshRealmUser(email, true);

  await page.goto("/api/auth/sign-in/keycloak");
  await checkKeycloakPage(
    page,
    testInfo,
    "keycloak-sign-in",
    page.locator("#kc-login")
  );

  await page.getByRole("link", { name: /forgot password/i }).click();
  await checkKeycloakPage(
    page,
    testInfo,
    "keycloak-reset-password",
    page.locator("#username")
  );

  await page.locator("#username").fill(email);
  await page
    .locator('button[type="submit"], input[type="submit"]')
    .first()
    .click();

  // The reset link opens the update-password form, the page a set-password link also renders.
  const link = await waitForLink(email, (url) =>
    url.includes("login-actions/action-token")
  );

  await page.goto(link, { waitUntil: "domcontentloaded" });

  const confirm = page.locator('a[href*="action-token"]').first();

  if ((await confirm.count()) > 0) await confirm.click();

  await checkKeycloakPage(
    page,
    testInfo,
    "keycloak-set-password",
    page.locator("#password-new")
  );
});

test("the Keycloak verify-email page fits the viewport and passes axe", async ({
  page,
}, testInfo) => {
  const email = `e2e.kc-pages.unverified.${testInfo.project.name}@example.invalid`;

  await freshRealmUser(email, false);

  await page.goto("/api/auth/sign-in/keycloak");
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(E2E_LOCAL_ADMIN_PASSWORD);
  await page.locator("#kc-login").click();

  // The realm requires a verified email, so it stops on its verify-email page before the app.
  await checkKeycloakPage(
    page,
    testInfo,
    "keycloak-verify-email",
    page.getByText(/verify your email/i).first()
  );
});
