import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { queryDatabase } from "./support/database.ts";
import { iconCheckSize } from "./support/icon-alignment.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";
import { expectTouchAreas } from "./support/touch-areas.ts";

/**
 * Add assignment from a sheet (P12-16, d8l5.62) through the real realm and the real database: the
 * person sheet's form passes axe and the 390 px touch check, and a save from a group sheet and from
 * a module sheet shows its new tinted row. A save from a person sheet is the dev spec's subject.
 *
 * The phone and desktop projects share one database, and `--repeat-each` copies run in parallel
 * workers, so every row this spec writes is scoped to the project and the copy, and the seed
 * deletes what an earlier run left. A save from the module sheet and from the group sheet waits
 * while another spec turns the module entitlement off, so each of those holds that lock.
 */

test.describe.configure({ timeout: 420_000 });

const LOCK_WAIT_MS = 300_000;

/** Fails with every axe violation, and at a phone with every control under a 44 px touch area. */
async function checkForm(
  page: Page,
  project: string,
  label: string
): Promise<void> {
  await expectNoAxeViolations(page, label);

  if (project === "phone") await expectTouchAreas(page, label);
}

/** Opens a person's inspector from People by searching their name. */
async function openPerson(page: Page, name: string): Promise<Locator> {
  await page.goto("/admin/people");
  await page
    .getByRole("textbox", { name: "Search by name or email" })
    .fill(name);
  // The shell's user menu also carries a person's name, so the row is found in the page.
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(name) })
    .filter({ visible: true })
    .first()
    .click();

  const inspector = page.getByRole("dialog", { name });

  await expect(inspector).toBeVisible();

  return inspector;
}

/**
 * Two people with no role and one local group with none; idempotent, so each test runs it. The
 * group and every person are scoped to one project and repeat copy.
 */
async function seed(input: {
  readonly reader: string;
  readonly person: { readonly name: string; readonly email: string };
  readonly modulePerson: { readonly name: string; readonly email: string };
  readonly group: string;
}): Promise<void> {
  await queryDatabase(
    [
      `with old as (select id from "group" where source = 'local' and name = '${input.group}'),
            members as (delete from group_member where group_id in (select id from old)),
            grants as (delete from role_assignment where principal_type = 'group' and principal_id in (select id::text from old))
       delete from "group" where id in (select id from old)`,
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values (gen_random_uuid()::text, '${input.person.name}', '${input.person.email}', true, 'active', false), (gen_random_uuid()::text, '${input.modulePerson.name}', '${input.modulePerson.email}', true, 'active', false) on conflict (email) do nothing`,
      `delete from role_assignment a using "user" u where a.principal_type = 'user' and a.principal_id = u.id and u.email in ('${input.person.email}', '${input.modulePerson.email}')`,
      `insert into "group" (name, source) values ('${input.group}', 'local')`,
      // The Modules page needs `core:settings:manage`, which the reader role does not hold (access-links does the same).
      `insert into role (name, permissions, is_system) values ('E2E add sheet modules', array['core:settings:manage'], false) on conflict (name) do nothing`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'E2E add sheet modules' and u.email = '${input.reader}' on conflict do nothing`,
    ].join("; ")
  );
}

/** The three names and emails of one project and repeat copy. */
function scope(project: string, repeat: number) {
  const tag = `${project} r${repeat}`;

  return {
    person: {
      name: `E2E add sheet ${tag} person`,
      email: `e2e.add-sheet.${project}.r${repeat}@example.com`,
    },
    modulePerson: {
      name: `E2E add sheet ${tag} module person`,
      email: `e2e.add-sheet-module.${project}.r${repeat}@example.com`,
    },
    group: `E2E add sheet ${tag} group`,
  };
}

test("the person sheet's Add assignment form passes axe and the touch check", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;

  const { person, modulePerson, group } = scope(
    project,
    testInfo.repeatEachIndex
  );

  await page.setViewportSize(iconCheckSize(project));

  await seed({
    reader: e2eReaderEmail("access-add", project),
    person,
    modulePerson,
    group,
  });
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("access-add", project),
  });

  const sheet = await openPerson(page, person.name);

  await sheet.getByRole("tab", { name: /^Roles/ }).click();
  await sheet.getByRole("button", { name: "Add assignment" }).click();
  await expect(
    sheet.getByRole("button", { name: `Back to ${person.name}` })
  ).toBeVisible();
  await checkForm(page, project, "Person sheet, Add assignment");
});

test("Add assignment from a group sheet saves and tints the new row", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;

  const { person, modulePerson, group } = scope(
    project,
    testInfo.repeatEachIndex
  );

  await page.setViewportSize(iconCheckSize(project));

  await seed({
    reader: e2eReaderEmail("access-add", project),
    person,
    modulePerson,
    group,
  });
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("access-add", project),
  });

  await withDeploymentLock(
    "s2-16-entitlement",
    async () => {
      await page.goto("/admin/groups");
      await page.getByRole("textbox", { name: "Search groups" }).fill(group);
      await page
        .getByRole("main")
        .getByRole("button", { name: new RegExp(`^${group}`) })
        .filter({ visible: true })
        .first()
        .click();

      const sheet = page.getByRole("dialog", { name: group });

      await expect(sheet).toBeVisible();

      await sheet.getByRole("tab", { name: /^Roles/ }).click();
      await sheet.getByRole("button", { name: "Add assignment" }).click();
      await sheet.getByRole("combobox", { name: "Role" }).click();
      await page.getByRole("option", { name: /^Placeholder user/ }).click();
      await checkForm(page, project, "Group sheet, Add assignment");

      await sheet.getByRole("button", { name: "Add assignment" }).click();
      await expect(
        page.getByText(`Assigned Placeholder user to ${group}.`)
      ).toBeVisible();

      // The sheet draws a card list on a phone and a table from 768 px (as access-links reads it).
      const row = sheet
        .getByRole(project === "phone" ? "list" : "table", {
          name: "Assigned roles",
        })
        .getByRole(project === "phone" ? "listitem" : "row")
        .filter({ hasText: "Placeholder user" });

      await expect(row).toHaveAttribute("data-new", "");

      const [count] = await queryDatabase(
        `select count(*) from role_assignment a join role r on r.id = a.role_id
           join "group" g on a.principal_type = 'group' and a.principal_id = g.id::text
          where g.source = 'local' and g.name = '${group}' and r.name = 'Placeholder user'`
      );

      expect(count).toBe("1");
    },
    LOCK_WAIT_MS
  );
});

test("Add assignment from a module sheet saves and tints the new row", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;

  const { person, modulePerson, group } = scope(
    project,
    testInfo.repeatEachIndex
  );

  await page.setViewportSize(iconCheckSize(project));

  await seed({
    reader: e2eReaderEmail("access-add", project),
    person,
    modulePerson,
    group,
  });
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("access-add", project),
  });

  await withDeploymentLock(
    "s2-16-entitlement",
    async () => {
      await page.goto("/admin/modules");
      await page
        .getByRole("main")
        .getByRole("button", { name: "Placeholder", exact: true })
        .filter({ visible: true })
        .first()
        .click();

      const sheet = page.getByRole("dialog", { name: "Placeholder" });

      await expect(sheet).toBeVisible();
      await expect(
        sheet.getByRole("heading", { name: /^Assigned to \(\d+\)$/ })
      ).toBeVisible();
      await sheet.getByRole("button", { name: "Add assignment" }).click();
      await expect(sheet.getByRole("combobox", { name: "Role" })).toContainText(
        "Placeholder user"
      );
      await sheet
        .getByRole("combobox", { name: "Assign to" })
        .fill(modulePerson.name);
      await page
        .getByRole("option", { name: new RegExp(modulePerson.name) })
        .click();
      await page.keyboard.press("Tab");
      await checkForm(page, project, "Module sheet, Add assignment");

      await sheet.getByRole("button", { name: "Add assignment" }).click();
      await expect(
        page.getByText(`Assigned Placeholder user to ${modulePerson.name}.`)
      ).toBeVisible();

      const row = sheet
        .getByRole("list", { name: "Assigned to" })
        .getByRole("listitem")
        .filter({ hasText: modulePerson.name });

      await expect(row).toHaveAttribute("data-new", "");

      const [count] = await queryDatabase(
        `select count(*) from role_assignment a join "user" u on a.principal_type = 'user' and a.principal_id = u.id
           join role r on r.id = a.role_id
          where u.email = '${modulePerson.email}' and r.name = 'Placeholder user'`
      );

      expect(count).toBe("1");
    },
    LOCK_WAIT_MS
  );
});
