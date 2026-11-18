import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * d8l5.62 through the real realm and the real database: the Overview opens on every assignment,
 * newest first, 25 to a page; the person filter adds Assigned via and the line that counts the
 * person's roles; a search with no match offers to clear it. The phone and desktop projects share
 * one database, so every row this test writes is scoped to the project, and the setup deletes what
 * an earlier run left.
 */

test.describe.configure({ timeout: 120_000 });

const LIST = "Assignments, newest first";

/** The rows of whichever layout the viewport draws: a table from 768 px, else a card list. */
function resultRows(page: Page): Locator {
  return (page.viewportSize()?.width ?? 0) >= 768
    ? page.getByRole("table", { name: LIST }).locator("tbody").getByRole("row")
    : page.getByRole("list", { name: LIST }).getByRole("listitem");
}

test("the Overview starts filled, filters by person, pages by 25 and clears a search with no match", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const reader = e2eReaderEmail("access-overview", project);
  const person = `E2E overview person ${project}`;
  const personEmail = `e2e.overview-person.${project}@example.com`;
  const prefix = `E2E overview ${project}`;
  const groupA = `${prefix} A`;
  const groupB = `${prefix} B`;

  // 26 groups with one assignment each, P01 the newest, so a search pages past 25.
  const paged = Array.from(
    { length: 26 },
    (_, index) => `'${prefix} P${String(index + 1).padStart(2, "0")}'`
  );

  const adder = `(select id from "user" where email = '${reader}')`;

  await queryDatabase(
    [
      `with old as (select id from "group" where source = 'local' and name like '${prefix} %'),
            members as (delete from group_member where group_id in (select id from old)),
            grants as (delete from role_assignment where principal_type = 'group' and principal_id in (select id::text from old))
       delete from "group" where id in (select id from old)`,
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values (gen_random_uuid()::text, '${person}', '${personEmail}', true, 'active', false) on conflict (email) do nothing`,
      `insert into "group" (name, source) values ('${groupA}', 'local'), ('${groupB}', 'local')`,
      `insert into group_member (group_id, user_id, source) select g.id, u.id, 'local' from "group" g, "user" u where g.source = 'local' and g.name in ('${groupA}', '${groupB}') and u.email = '${personEmail}'`,
      `insert into role_assignment (role_id, principal_type, principal_id, created_by_user_id)
         select r.id, 'group', g.id::text, ${adder} from role r, "group" g
          where r.name = 'Placeholder user' and g.source = 'local' and g.name in ('${groupA}', '${groupB}')`,
      `insert into "group" (name, source) select unnest(array[${paged.join(", ")}]), 'local'`,
      `insert into role_assignment (role_id, principal_type, principal_id, created_by_user_id, created_at)
         select r.id, 'group', g.id::text, ${adder}, now() + make_interval(mins => 30 - substring(g.name from '[0-9]+$')::int)
           from role r, "group" g
          where r.name = 'Placeholder user' and g.source = 'local' and g.name like '${prefix} P%'`,
    ].join("; ")
  );

  const [personId] = await queryDatabase(
    `select id from "user" where email = '${personEmail}'`
  );

  await signInThroughKeycloak(page, { email: reader });

  // E1: the Overview opens on every assignment, 25 to a page (d8l5.62).
  await page.goto("/admin/access/overview");
  await expect(resultRows(page)).toHaveCount(25);
  await expect(page.getByText(/^1–25 of [\d,]+$/)).toBeVisible();
  // The phone's fixed action bar covers the rows it scrolls over. The shell's end spacer keeps the
  // last row clear, so axe reads the same page without the bar's false color-contrast overlap.
  await page
    .locator("[data-shell-content]")
    .evaluate((area) => area.scrollTo({ top: area.scrollHeight }));
  await expectNoAxeViolations(page, "Overview, first load");

  // E2: newest first, and Next reads page 2 of the search.
  await page.goto(
    `/admin/access/overview?q=${encodeURIComponent(`${prefix} P`)}`
  );
  await expect(page.getByText("1–25 of 26")).toBeVisible();
  await expect(resultRows(page).first()).toContainText(`${prefix} P01`);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("26–26 of 26")).toBeVisible();
  await expect(resultRows(page)).toHaveCount(1);
  await expect(resultRows(page)).toContainText(`${prefix} P26`);

  // E3: the person filter shows both group rows with Assigned via, and counts them.
  await page.goto(`/admin/access/overview?who=user:${personId}`);
  await expect(
    page.getByRole("status").filter({ hasText: `${person} has 2 roles:` })
  ).toHaveText(
    new RegExp(
      `^${person} has 2 roles: 1 via ${prefix} [AB] and 1 via ${prefix} [AB]\\.$`
    )
  );
  await expect(resultRows(page)).toHaveCount(2);
  await expect(resultRows(page).filter({ hasText: groupA })).toContainText(
    "(group)"
  );
  await expect(resultRows(page).filter({ hasText: groupB })).toContainText(
    "Placeholder user"
  );
  await expectNoAxeViolations(page, "Overview, one person");

  // E4: no match offers to clear the search and the filters.
  await page.goto(
    `/admin/access/overview?q=no-match-${project}&module=placeholder`
  );
  await expect(
    page.getByRole("heading", { name: "No assignments match" })
  ).toBeVisible();
  await expectNoAxeViolations(page, "Overview, no match");
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(page).toHaveURL(/\/admin\/access\/overview$/);
  await expect(resultRows(page)).toHaveCount(25);
});

test("Add assignment from Access adds a role to a person and tints the new row", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const reader = e2eReaderEmail("access-overview", project);
  const person = `E2E overview add ${project}`;
  const email = `e2e.overview-add.${project}@example.com`;

  await queryDatabase(
    [
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values (gen_random_uuid()::text, '${person}', '${email}', true, 'active', false) on conflict (email) do nothing`,
      `delete from role_assignment a using "user" u where a.principal_type = 'user' and a.principal_id = u.id and u.email = '${email}'`,
    ].join("; ")
  );

  await signInThroughKeycloak(page, { email: reader });
  // The search keeps the list to this person, so rows other tests write never come first.
  await page.goto(`/admin/access/overview?q=${encodeURIComponent(person)}`);
  await expect(
    page.getByRole("heading", { name: "No assignments match" })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add assignment" })
    .filter({ visible: true })
    .click();

  const sheet = page.getByRole("dialog", { name: "Add assignment" });

  await expectNoAxeViolations(page, "Access, Add assignment");
  await sheet.getByRole("combobox", { name: "Assign to" }).fill(person);
  await page.getByRole("option", { name: new RegExp(person) }).click();
  await page.keyboard.press("Tab");
  await sheet.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: /^Placeholder user/ }).click();
  await sheet.getByRole("button", { name: "Add assignment" }).click();

  await expect(
    page.getByText(`Assigned Placeholder user to ${person}.`)
  ).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(resultRows(page).first()).toContainText(person);
  await expect(resultRows(page).first()).toHaveAttribute("data-new", "");

  const [count] = await queryDatabase(
    `select count(*) from role_assignment a join "user" u on a.principal_type = 'user' and a.principal_id = u.id join role r on r.id = a.role_id where u.email = '${email}' and r.name = 'Placeholder user'`
  );

  expect(count).toBe("1");
});
