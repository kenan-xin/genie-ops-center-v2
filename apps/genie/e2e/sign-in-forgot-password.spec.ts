import { expect, test } from "@playwright/test";

import { e2eLocalBaseUrl } from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { withDeploymentLock } from "./support/lock.ts";

/**
 * Spec 2 R-51a and the sign-in design: a local-accounts realm labels the action "Continue to sign
 * in" and links the realm's reset-password page; a brokered realm keeps the company-account action
 * and shows no such link. The local case runs on the S-F local-accounts stack, the brokered case on
 * the shared stack under the lock `tenant-settings.spec.ts` holds while it turns local accounts on.
 */
test.describe.configure({ timeout: 120_000 });

const FORGOT = { name: "Forgot your password?" } as const;

test("a local-accounts realm links its reset-password page from the sign-in page", async ({
  page,
}) => {
  await page.goto(`${e2eLocalBaseUrl()}/sign-in`);

  await expect(
    page.getByRole("link", { name: "Continue to sign in" })
  ).toBeVisible();
  await expectNoAxeViolations(page, "the local-accounts sign-in page");

  await page.getByRole("link", FORGOT).click();

  await expect(page).toHaveURL(/\/login-actions\/reset-credentials/);
  await expect(page.locator("#username")).toBeVisible({ timeout: 30_000 });
});

test("a brokered realm shows the company-account action and no reset link", async ({
  page,
}) => {
  await withDeploymentLock("tenant-settings", async () => {
    await page.goto("/sign-in");

    await expect(
      page.getByRole("link", { name: "Sign in with your company account" })
    ).toBeVisible();
    await expect(page.getByRole("link", FORGOT)).toHaveCount(0);
  });
});
