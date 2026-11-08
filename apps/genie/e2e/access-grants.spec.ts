import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  e2eAccessMemberEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { pickRecipient } from "./support/access.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { chooseOption } from "./support/choose-option.ts";
import { queryDatabase } from "./support/database.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * S2-21 through the real realm and the real database: an administrator grants Placeholder to a
 * local group on the Grants tab, and a member sees it in their navigation. A role swap survives a
 * reload. Remove of the group's only path takes the module away. Remove of the member's direct
 * grant while the group path stays names that path, and the member keeps the module (AC-28).
 *
 * The phone and desktop projects share one database, so the group, the custom role and the member
 * are scoped to the project, and the setup deletes what an earlier run left.
 */

// Two sign-ins through the real realm, five saves and four polled member reloads take longer than
// the 30 second default.
test.describe.configure({ timeout: 180_000 });

const POLL = { timeout: 30_000, intervals: [1000] };

/** The Placeholder links in the member's navigation; the entry is also pinned, so it can be two. */
async function placeholderLinks(page: Page): Promise<number> {
  await page.goto("/");

  return (await openNavigation(page))
    .getByRole("link", { name: "Placeholder", exact: true })
    .count();
}

/** Ticks one row on a side and presses the footer's move button (both transfer list forms). */
async function move(
  page: Page,
  side: "Catalog" | "Granted",
  row: string
): Promise<void> {
  await page
    .getByRole("group", { name: side, exact: true })
    .getByRole("checkbox", { name: row, exact: true })
    .click();
  await page
    .getByRole("button", { name: side === "Catalog" ? "Add 1" : "Remove 1" })
    .click();
}

/** Saves the pending bar; a Remove first opens its confirmation, which `confirm` checks. */
async function save(
  page: Page,
  confirm?: (dialog: Locator) => Promise<void>
): Promise<void> {
  const bar = page.getByRole("region", { name: "Unsaved changes" });

  const response = page.waitForResponse((answer) =>
    answer.url().includes("/api/rpc/roles/saveGrants")
  );

  await bar.getByRole("button", { name: "Save changes" }).click();

  if (confirm !== undefined) {
    const dialog = page.getByRole("dialog");

    await confirm(dialog);
    await dialog.getByRole("button", { name: "Remove and save" }).click();
  }

  expect((await response).status()).toBe(200);
  await expect(bar).toBeHidden();
  // At desktop the success toast covers the next bar's Save, and it stays while the pointer rests on
  // it, so the test closes it as a person would.
  await page
    .getByRole("region", { name: /^Notifications/ })
    .getByRole("button", { name: "Close" })
    .click();
}

test("a grant reaches the member's navigation, and Remove takes it unless another path stays", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const member = e2eAccessMemberEmail(project);
  const group = `E2E access ${project}`;
  const reviewer = `E2E access reviewer ${project}`;

  await queryDatabase(
    [
      `with old as (select id from "group" where source = 'local' and name = '${group}'),
            members as (delete from group_member where group_id in (select id from old)),
            grants as (delete from role_assignment where principal_type = 'group' and principal_id in (select id::text from old))
       delete from "group" where id in (select id from old)`,
      `delete from role_assignment where principal_type = 'user' and principal_id = (select id from "user" where email = '${member}')`,
      `delete from role_assignment where role_id = (select id from role where name = '${reviewer}')`,
      `insert into role (name, module_id, permissions, is_system) values ('${reviewer}', 'placeholder', array['placeholder:use'], false) on conflict (name) do nothing`,
      `insert into "group" (name, source) values ('${group}', 'local')`,
      `insert into group_member (group_id, user_id, source) select g.id, u.id, 'local' from "group" g, "user" u where g.source = 'local' and g.name = '${group}' and u.email = '${member}'`,
    ].join("; ")
  );

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();

  try {
    // E1, E6: the admin adds Placeholder to the group. The pending change passes axe first.
    await signInThroughKeycloak(page, {
      email: e2eReaderEmail("access", project),
    });
    await page.goto("/admin/access");
    await pickRecipient(page, "group", group);
    await move(page, "Catalog", "Placeholder");
    await expect(
      page.getByRole("region", { name: "Unsaved changes" })
    ).toContainText("1 to add");
    await expectNoAxeViolations(page, "Grants with an Add pending");
    await save(page);

    await signInThroughKeycloak(memberPage, { email: member });
    await expect
      .poll(() => placeholderLinks(memberPage), POLL)
      .toBeGreaterThan(0);

    // E5: the member holds no `core:roles:manage`.
    await memberPage.goto("/admin/access");
    await expect(memberPage.getByTestId("permission-denied")).toBeVisible();
    await memberPage.goto("/admin/access/overview");
    await expect(memberPage.getByTestId("permission-denied")).toBeVisible();

    // E2: the role choice swaps the default for the custom Placeholder role, and a reload shows it.
    await chooseOption(page, "Role for Placeholder", reviewer);
    await save(page);
    await page.reload();
    await pickRecipient(page, "group", group);
    await expect(
      page.getByLabel("Role for Placeholder", { exact: true })
    ).toHaveText(new RegExp(reviewer));

    const [groupRoles] = await queryDatabase(
      `select string_agg(r.name, ',') from role_assignment a join role r on r.id = a.role_id
         join "group" g on a.principal_type = 'group' and a.principal_id = g.id::text
        where g.source = 'local' and g.name = '${group}'`
    );

    expect(groupRoles).toBe(reviewer);

    // E3, E6: Remove of the group's only path, after a confirmation that says no role stays.
    await move(page, "Granted", "Placeholder");
    await save(page, async (dialog) => {
      await expect(dialog).toHaveAccessibleName(
        `Remove Placeholder from ${group}?`
      );
      await expect(dialog).toContainText(
        `${group} holds no role of Placeholder after you save.`
      );
      await expectNoAxeViolations(page, "Grants Remove confirmation");
    });

    await expect.poll(() => placeholderLinks(memberPage), POLL).toBe(0);
    await memberPage.goto("/placeholder");
    await expect(memberPage.getByTestId("permission-denied")).toBeVisible();

    // E4: the group path again, then a direct grant to the member, whose Remove names the path.
    await move(page, "Catalog", "Placeholder");
    await save(page);
    await page.getByRole("button", { name: "People", exact: true }).click();
    await pickRecipient(page, "user", member);
    await move(page, "Catalog", "Placeholder");
    await save(page);
    await move(page, "Granted", "Placeholder");
    await expect(
      page.getByRole("region", { name: "Unsaved changes" })
    ).toContainText(`Placeholder user through ${group} stays.`);
    await save(page, async (dialog) => {
      const stays = dialog
        .getByRole("list", { name: "Paths that stay" })
        .getByRole("listitem");

      await expect(stays).toHaveCount(1);
      await expect(stays).toContainText("Placeholder user");
      await expect(stays).toContainText(`Through ${group}`);
    });

    const [direct] = await queryDatabase(
      `select count(*) from role_assignment where principal_type = 'user' and principal_id = (select id from "user" where email = '${member}')`
    );

    expect(direct).toBe("0");
    await expect
      .poll(() => placeholderLinks(memberPage), POLL)
      .toBeGreaterThan(0);
  } finally {
    await memberContext.close();
  }
});
