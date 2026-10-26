import { expect, test } from "@playwright/test";

import { e2eLocalBaseUrl } from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import {
  INVITE_DB,
  inviteBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { withDeploymentLock } from "./support/lock.ts";

/**
 * Spec 2 R-51a and the sign-in design: a local-accounts realm labels the action "Continue to sign
 * in" and links the realm's reset-password page; a brokered realm keeps the company-account action
 * and shows no such link. The local case runs on the S-F local-accounts stack, the brokered case on
 * the shared stack under the lock `tenant-settings.spec.ts` holds while it turns local accounts on.
 */
test.describe.configure({ timeout: 120_000 });

const FORGOT = { name: "Forgot your password?" } as const;

const sql = (query: string) => queryBrokerDatabase(INVITE_DB, query);

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

/**
 * R-51a keeps the link after the setting is turned off while a local account remains. The invite
 * deployment never turns the setting on, so no cached `true` can show the link; the realm flag is
 * set for this proof under the lock `tenant-settings.spec.ts` holds, and restored before release.
 */
test("the reset link stays while a local account exists after the setting is off", async ({
  page,
}, testInfo) => {
  const email = `r51a-${testInfo.project.name}@example.invalid`;

  await withDeploymentLock(
    "tenant-settings",
    async () => {
      const [realmSupport] = await sql(
        "select realm_supports_local_accounts from tenant_settings"
      );

      try {
        await sql(
          `update tenant_settings set realm_supports_local_accounts = true, local_accounts_enabled = false;
           with person as (
             insert into "user" (id, name, email, status) values (gen_random_uuid()::text, 'R-51a local', '${email}', 'active')
             returning id)
           insert into account (id, account_id, provider_id, user_id)
             select gen_random_uuid()::text, id, 'credential', id from person`
        );

        // The settings reader keeps the realm flag for up to 10 seconds (DEC-46).
        await expect(async () => {
          await page.goto(`${inviteBaseUrl()}/sign-in`);
          await expect(page.getByRole("link", FORGOT)).toBeVisible({
            timeout: 1000,
          });
        }).toPass({ timeout: 30_000 });
        await expect(
          page.getByRole("link", { name: "Continue to sign in" })
        ).toBeVisible();
      } finally {
        await sql(
          `delete from account where user_id in (select id from "user" where email = '${email}');
           delete from "user" where email = '${email}';
           update tenant_settings set realm_supports_local_accounts = ${realmSupport === "t"}`
        );
      }
    },
    300_000
  );
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
