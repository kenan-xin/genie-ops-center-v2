import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * S2-22 through the real realm and the real database: the Overview tab of Access reads nothing
 * before a choice, shows both group paths of a person with "also through", names who added a
 * group's path, and pages and searches the holders of a module (AC-28, R-37b, R-37d).
 *
 * The phone and desktop projects share one database, so the person and the two groups are scoped
 * to the project, and the setup deletes what an earlier run left.
 */

test.describe.configure({ timeout: 120_000 });

/** The rows of whichever layout the viewport draws: a table from 768 px, else a card list. */
function resultRows(page: Page, name: string): Locator {
  return (page.viewportSize()?.width ?? 0) >= 768
    ? page.getByRole("table", { name }).locator("tbody").getByRole("row")
    : page.getByRole("list", { name }).getByRole("listitem");
}

/** Opens a picker, searches it, and picks the option whose name starts with `name`. */
async function pick(
  page: Page,
  picker: { readonly prompt: string; readonly search: string },
  name: string
): Promise<void> {
  await page.getByRole("combobox", { name: picker.prompt }).click();
  await page.getByLabel(picker.search).fill(name);
  await page.getByRole("option", { name: new RegExp(`^${name} · `) }).click();
}

const RECIPIENTS = {
  prompt: "Choose a group or person",
  search: "Search groups and people",
};

const MODULES = { prompt: "Choose a module", search: "Search modules" };

test("the Overview shows a person's two group paths, who added a path, and a module's holders", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const reader = e2eReaderEmail("access-overview", project);
  const person = `E2E overview person ${project}`;
  const personEmail = `e2e.overview-person.${project}@example.com`;
  const groupA = `E2E overview ${project} A`;
  const groupB = `E2E overview ${project} B`;
  const groups = `'${groupA}', '${groupB}'`;

  await queryDatabase(
    [
      `with old as (select id from "group" where source = 'local' and name in (${groups})),
            members as (delete from group_member where group_id in (select id from old)),
            grants as (delete from role_assignment where principal_type = 'group' and principal_id in (select id::text from old))
       delete from "group" where id in (select id from old)`,
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values (gen_random_uuid()::text, '${person}', '${personEmail}', true, 'active', false) on conflict (email) do nothing`,
      `insert into "group" (name, source) values ('${groupA}', 'local'), ('${groupB}', 'local')`,
      `insert into group_member (group_id, user_id, source) select g.id, u.id, 'local' from "group" g, "user" u where g.source = 'local' and g.name in (${groups}) and u.email = '${personEmail}'`,
      `insert into role_assignment (role_id, principal_type, principal_id, created_by_user_id)
         select r.id, 'group', g.id::text, case when g.name = '${groupA}' then (select id from "user" where email = '${reader}') end
           from role r, "group" g where r.name = 'Placeholder user' and g.source = 'local' and g.name in (${groups})`,
    ].join("; ")
  );

  const [adder] = await queryDatabase(
    `select name from "user" where email = '${reader}'`
  );

  const reads: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/rpc/roles/accessBySubject")) {
      reads.push(request.url());
    }
  });

  await signInThroughKeycloak(page, { email: reader });

  // E1: the tab bar opens the Overview, which reads nothing before a choice.
  await page.goto("/admin/access");
  await page
    .getByRole("navigation", { name: "Access" })
    .getByRole("link", { name: "Overview" })
    .click();
  await expect(page).toHaveURL(/\/admin\/access\/overview$/);
  await expect(
    page.getByRole("heading", { name: "Choose what to look up" })
  ).toBeVisible();
  await expectNoAxeViolations(page, "Overview before a choice");
  expect(reads).toEqual([]);

  // E2: both group paths of the person, each naming the other.
  await pick(page, RECIPIENTS, person);
  await expect(page.getByText(`2 assignments for ${person}`)).toBeVisible();

  const paths = resultRows(page, `Assignments for ${person}`);

  await expect(paths).toHaveCount(2);
  await expect(paths.filter({ hasText: `via ${groupA}` })).toContainText(
    `also through ${groupB}`
  );
  await expect(paths.filter({ hasText: `via ${groupB}` })).toContainText(
    `also through ${groupA}`
  );
  await expectNoAxeViolations(page, "Overview by person");

  // E2b: a group's own path names who added it.
  await pick(page, RECIPIENTS, groupA);
  await expect(page.getByText(`1 assignment for ${groupA}`)).toBeVisible();

  const own = resultRows(page, `Assignments for ${groupA}`);

  await expect(own).toHaveCount(1);
  await expect(own).toContainText("Placeholder user");
  await expect(own).toContainText("Direct assignment");
  await expect(own).toContainText(`by ${adder}`);

  // E3: the holders of Placeholder page by ten, and a search starts again at page 1.
  await page.getByRole("button", { name: "By module" }).click();
  await pick(page, MODULES, "Placeholder");

  const pager = page.getByText(/^\d+–\d+ of \d+$/);

  await expect(pager).toHaveText(/^1–10 of \d+$/);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(pager).toHaveText(/^11–20 of \d+$/);
  await page.getByLabel("Search these results").fill(`E2E overview ${project}`);
  await expect(pager).toHaveText("1–2 of 2");
  // d8l5.45: the header counts the matches of the search against all holders.
  await expect(
    page.getByRole("status").filter({ hasText: /holders of Placeholder/ })
  ).toHaveText(/^2 of \d+ holders of Placeholder$/);

  const holders = resultRows(page, "Holders of Placeholder");

  await expect(holders).toHaveCount(2);
  await expect(holders.filter({ hasText: groupA })).toContainText(
    "Group, 1 member"
  );
  await expect(holders.filter({ hasText: groupB })).toContainText(
    "Group, 1 member"
  );
  await expectNoAxeViolations(page, "Overview by module");
});
