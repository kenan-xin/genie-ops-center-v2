import { randomUUID } from "node:crypto";

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
 * d8l5.62 through the real realm and the real database: the Overview opens on every assignment,
 * newest first, 25 to a page; the person filter adds Assigned via and the line that counts the
 * person's roles; a search with no match offers to clear it. The phone and desktop projects share
 * one database, so every row this test writes is scoped to the project, and the setup deletes what
 * an earlier run left.
 */

test.describe.configure({ timeout: 420_000 });

const LOCK_WAIT_MS = 300_000;

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
  const tag = `${project} r${testInfo.repeatEachIndex}`;
  const reader = e2eReaderEmail("access-overview", project);
  const person = `E2E overview person ${tag}`;
  const personEmail = `e2e.overview-person.${project}.r${testInfo.repeatEachIndex}@example.com`;
  const prefix = `E2E overview ${tag}`;
  const groupA = `${prefix} A`;
  const groupB = `${prefix} B`;

  await page.setViewportSize(iconCheckSize(project));

  // 26 groups with one assignment each, P01 the newest, so a search pages past 25. The dates stay
  // in the past, so no future row crowds another spec's newest-25 list, such as a module's sheet.
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
         select r.id, 'group', g.id::text, ${adder}, now() - make_interval(mins => substring(g.name from '[0-9]+$')::int)
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
  await expectNoAxeViolations(page, "Overview, first load");

  if (project === "phone") await expectTouchAreas(page, "Overview, first load");

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

  // E5: a stale who id reads as no filter and never reaches the server (P12-8, Review Focus 1).
  const reads: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/rpc/roles/assignments"))
      reads.push(request.postData() ?? "");
  });

  const stale = randomUUID();

  // The Overview turns `who` into a row through `roles.recipients` (P12-6); only its answer decides.
  const looked = page.waitForResponse((answer) =>
    answer.url().includes("/api/rpc/roles/recipients")
  );

  await page.goto(`/admin/access/overview?who=user:${stale}`);
  await looked;
  await expect(resultRows(page)).toHaveCount(25);
  await expect(
    page.getByRole("status").filter({ hasText: / has \d+ roles?/ })
  ).toHaveCount(0);

  if ((page.viewportSize()?.width ?? 0) >= 768) {
    // The bar's set filter is a trigger whose text names the pick, so no name means "Anyone".
    await expect(
      page.getByRole("combobox", { name: "Person or group" })
    ).toContainText("Anyone");
  } else {
    await expect(page.getByText(/^Person or group:/)).toHaveCount(0);
  }

  expect(reads.some((body) => body.includes(stale))).toBe(false);
});

test("Add assignment from Access adds a role to two recipients and tints both rows", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const tag = `${project} r${testInfo.repeatEachIndex}`;
  const reader = e2eReaderEmail("access-overview", project);
  const person = `E2E overview add ${tag} person`;
  const email = `e2e.overview-add.${project}.r${testInfo.repeatEachIndex}@example.com`;
  const group = `E2E overview add ${tag} group`;

  await page.setViewportSize(iconCheckSize(project));
  await queryDatabase(
    [
      `with old as (select id from "group" where source = 'local' and name = '${group}'),
            members as (delete from group_member where group_id in (select id from old)),
            grants as (delete from role_assignment where principal_type = 'group' and principal_id in (select id::text from old))
       delete from "group" where id in (select id from old)`,
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values (gen_random_uuid()::text, '${person}', '${email}', true, 'active', false) on conflict (email) do nothing`,
      `delete from role_assignment a using "user" u where a.principal_type = 'user' and a.principal_id = u.id and u.email = '${email}'`,
      `insert into "group" (name, source) values ('${group}', 'local')`,
    ].join("; ")
  );

  await signInThroughKeycloak(page, { email: reader });
  // The search keeps the list to this test's rows, so rows other tests write never come first.
  await page.goto(
    `/admin/access/overview?q=${encodeURIComponent(`E2E overview add ${tag}`)}`
  );
  await expect(
    page.getByRole("heading", { name: "No assignments match" })
  ).toBeVisible();

  await withDeploymentLock(
    "s2-16-entitlement",
    async () => {
      await page
        .getByRole("button", { name: "Add assignment" })
        .filter({ visible: true })
        .click();

      const sheet = page.getByRole("dialog", { name: "Add assignment" });

      await expectNoAxeViolations(page, "Access, Add assignment");

      const to = sheet.getByRole("combobox", { name: "Assign to" });

      await to.fill(person);
      await page.getByRole("option", { name: new RegExp(person) }).click();
      await to.fill(group);
      await page.getByRole("option", { name: new RegExp(group) }).click();
      await page.keyboard.press("Tab");
      await expect(
        sheet.getByRole("button", { name: `Remove ${person}` })
      ).toBeVisible();
      await expect(
        sheet.getByRole("button", { name: `Remove ${group}` })
      ).toBeVisible();

      await sheet.getByRole("combobox", { name: "Role" }).click();
      await page.getByRole("option", { name: /^Placeholder user/ }).click();
      await expect(
        sheet.getByRole("button", { name: "Add 2 assignments" })
      ).toBeVisible();

      await expectNoAxeViolations(
        page,
        "Access, Add assignment with two chips"
      );

      if (project === "phone")
        await expectTouchAreas(page, "Access, Add assignment with two chips");

      await sheet.getByRole("button", { name: "Add 2 assignments" }).click();
      await expect(
        page.getByText(
          new RegExp(
            `^Assigned Placeholder user to (${person} and ${group}|${group} and ${person})\\.$`
          )
        )
      ).toBeVisible();
      await expect(sheet).toBeHidden();

      const rows = resultRows(page);

      await expect(rows).toHaveCount(2);
      await expect(rows.filter({ hasText: person })).toHaveAttribute(
        "data-new",
        ""
      );
      await expect(rows.filter({ hasText: group })).toHaveAttribute(
        "data-new",
        ""
      );

      const [count] = await queryDatabase(
        `select count(*) from role_assignment a join role r on r.id = a.role_id
          where r.name = 'Placeholder user'
            and ((a.principal_type = 'user' and a.principal_id = (select id from "user" where email = '${email}'))
              or (a.principal_type = 'group' and a.principal_id = (select id::text from "group" where source = 'local' and name = '${group}')))`
      );

      expect(count).toBe("2");
    },
    LOCK_WAIT_MS
  );
});
