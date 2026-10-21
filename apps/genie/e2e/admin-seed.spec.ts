import { expect, test } from "@playwright/test";

import {
  e2eAdministratorEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * AC-19 (Gate S2-G2): on a fresh managed stack `genie-ops setup` completes every step, the
 * not-set-up page clears, and the first administrator from `tenant.yaml` signs in through the
 * realm, is activated, lands in the workspace and sees the admin switch. Global setup ran the
 * real command against the stand-in Keycloak, so this proves the outcome rather than a stand-in.
 *
 * One administrator per Playwright project, listed in `tenant.yaml`, keeps the activation proof
 * independent at phone and desktop sizes (R-56).
 */
test("AC-19: the first administrator is activated and sees the admin switch", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);

  const email = e2eAdministratorEmail(testInfo.project.name);

  // Every step this image knows was recorded done (R-17b), so the not-set-up page cleared.
  const done = await queryDatabase(
    "select count(*) from setup_step where state = 'done'"
  );

  expect(Number(done[0])).toBe(7);

  // The roles step appended the enabled module's admin key to Tenant administrator (R-31, R-55),
  // which is what makes the admin switch visible.
  const administratorPermissions = await queryDatabase(
    "select permissions::text from role where name = 'Tenant administrator'"
  );

  expect(administratorPermissions[0]).toContain("placeholder:admin");

  // The pre-added administrator is pending and invited (R-56), a local member of the seeded
  // Genie Administrators group, and holds Tenant administrator through it.
  const before = await queryDatabase(
    `select status || ' ' || onboarding from "user" where email = '${email}'`
  );

  expect(before).toEqual(["pending invited"]);

  const membership = await queryDatabase(
    `select count(*)
       from group_member gm
       join "user" u on u.id = gm.user_id
       join "group" g on g.id = gm.group_id
      where u.email = '${email}'
        and g.name = 'Genie Administrators'
        and g.source = 'local'
        and gm.source = 'local'`
  );

  expect(Number(membership[0])).toBe(1);

  // The first realm sign-in links to that row, activates it (R-10) and lands them at `/`.
  await signInThroughKeycloak(page, { email });

  const after = await queryDatabase(
    `select status || ' ' || onboarding from "user" where email = '${email}'`
  );

  expect(after).toEqual(["active invited"]);

  // The admin switch: the workspace lands the administrator on an admin-surface entry, which only
  // a holder of a module admin key (through Tenant administrator) is offered (R-31, R-34).
  await expect(page.locator('a[href^="/admin"]').first()).toBeVisible();
});

test("AC-19: a member without an admin key sees no admin switch", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);

  // The pre-added placeholder reader holds `placeholder:read` and `placeholder:use`, not the
  // module's admin key, so the admin switch must be absent for them.
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("placeholder", testInfo.project.name),
  });

  await expect(page.locator('nav[aria-label] a[href^="/admin"]')).toHaveCount(
    0
  );
});
