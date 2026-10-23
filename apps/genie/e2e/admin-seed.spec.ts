import { expect, test } from "@playwright/test";

import {
  e2eAdministratorEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { scenarioEmail } from "./scenarios.ts";
import { landingBaseUrl } from "./support/brokered.ts";
import { queryDatabase } from "./support/database.ts";
import { openNavigation, openUserMenu } from "./support/shell.ts";
import {
  signInThroughBroker,
  signInThroughKeycloak,
} from "./support/sign-in.ts";

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

  // The admin switch (R-32, bead 1ri3): the workspace user menu offers Administration, which opens
  // the first core admin entry, People, and offers no Back to workspace.
  const menu = await openUserMenu(page);

  await expect(
    menu.getByRole("menuitem", { name: "Administration", exact: true })
  ).toHaveAttribute("href", "/admin/people");
  await expect(
    menu.getByRole("menuitem", { name: "Back to workspace" })
  ).toHaveCount(0);

  // In the admin chrome the switch turns back: Back to workspace, and no Administration.
  await page.goto("/admin/people");

  const adminMenu = await openUserMenu(page);

  await expect(
    adminMenu.getByRole("menuitem", { name: "Back to workspace", exact: true })
  ).toBeVisible();
  await expect(
    adminMenu.getByRole("menuitem", { name: "Administration" })
  ).toHaveCount(0);
});

test("AC-19: the workspace rail holds no admin entry, and a person without a core admin key sees no admin switch", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);

  // The pre-added placeholder reader holds `placeholder:read` and `placeholder:use`, not the
  // module's admin key, so no admin entry reaches the workspace rail. The seeded E2E reader role
  // also holds core admin keys (`e2e/global-setup.ts`), so the reader does see the switch.
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("placeholder", testInfo.project.name),
  });

  // The navigation rendered with the reader's own entry, so the absent admin entry is not a
  // selector that matches nothing. The workspace rail carries no admin entry.
  const navigation = await openNavigation(page);

  await expect(
    navigation
      .getByRole("navigation", { name: "Workspace", exact: true })
      .getByRole("link", { name: "Placeholder", exact: true })
  ).toBeVisible();
  await expect(navigation.locator('a[href^="/admin"]')).toHaveCount(0);

  // The switch follows core admin keys (Decision 7), and the seeded E2E reader role holds some,
  // so the menu proof signs in a person with no grant at all: the landing deployment's member.
  await signInThroughBroker(page, {
    baseUrl: landingBaseUrl(),
    email: scenarioEmail("landing", "menu", testInfo.project.name),
  });

  const menu = await openUserMenu(page);

  await expect(
    menu.getByRole("menuitem", { name: "Account", exact: true })
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Administration" })
  ).toHaveCount(0);
});
