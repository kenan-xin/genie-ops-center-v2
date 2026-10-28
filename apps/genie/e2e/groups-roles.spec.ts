import { expect, test } from "@playwright/test";

import {
  e2eGroupsRolesEmail,
  e2eGroupsRolesGroup,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { chooseOption } from "./support/choose-option.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * S2-11 through the real realm and the real database: an administrator pre-adds a directory group
 * by its exact claim value, maps it to a role, and a `jit` person whose token carries that value
 * is admitted with the role. Archiving the group stops the grant, proved by a second `jit` person
 * with the same claim being refused. The Roles screen proves the unavailable-key warning.
 *
 * The projects run this at the phone and the desktop viewport (DEC-25). The phone and desktop
 * projects share one database, so the group claim value and the retired role are project-scoped.
 */

// The proof signs in twice through the real realm and drives three contexts, so it needs more
// than the 30 second default.
test.describe.configure({ timeout: 180_000 });

test("pre-add a directory group, map it, admit a jit person, and archive to stop the grant", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const adminEmail = e2eReaderEmail("groups", project);
  const GROUP_VALUE = e2eGroupsRolesGroup(project);
  // Phone and desktop run in parallel against one database, so the label is project-scoped too.
  const GROUP_LABEL = `S2-11 group ${project}`;

  // The e2e database keeps rows between runs, so remove this project's group from an earlier run
  // (its grants and memberships first) before pre-adding it again.
  await queryDatabase(
    `with old as (select id from "group" where external_id = '${GROUP_VALUE}'),
          members as (delete from group_member where group_id in (select id from old)),
          grants as (delete from role_assignment where principal_id in (select id::text from old))
     delete from "group" where id in (select id from old)`
  );

  // The administrator pre-adds the directory group by its exact claim value (DEC-52).
  await signInThroughKeycloak(page, { email: adminEmail });
  await page.goto("/admin/groups");

  await page.getByRole("button", { name: "Add directory group" }).click();

  const addDialog = page.getByRole("dialog", { name: "Add directory group" });

  await addDialog.getByLabel("Claim value").fill(GROUP_VALUE);
  await addDialog.getByLabel("Display label").fill(GROUP_LABEL);

  const [addResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/rpc/groups/addDirectoryGroup")
    ),
    addDialog.getByRole("button", { name: "Add group" }).click(),
  ]);

  expect(addResponse.status()).toBe(200);

  // The table and the phone card list both hold the row, and only one of them shows.
  await expect(
    page.getByText(GROUP_LABEL, { exact: true }).filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByText("Not seen yet").filter({ visible: true }).first()
  ).toBeVisible();

  // A refused add keeps its dialog, the typed value and the reason, readable in dark (U-1,
  // 6wz1.71). The branding theme is `system`.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Add directory group" }).click();
  await addDialog.getByLabel("Claim value").fill(GROUP_VALUE);
  await addDialog.getByRole("button", { name: "Add group" }).click();

  const refusal = addDialog.getByRole("alert");

  await expect(refusal).toHaveText(
    "The group was not added. A directory group with that exact claim value already exists. Your change is kept."
  );
  await expect(refusal).toBeFocused();
  await expect(addDialog.getByLabel("Claim value")).toHaveValue(GROUP_VALUE);
  await expectNoAxeViolations(page, "Add directory group refused, dark");

  await addDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(addDialog).toBeHidden();
  await page.emulateMedia({ colorScheme: "light" });

  // Map the group to a role through the screen's own assign step (R-24b), not SQL.
  const groupRow = page
    .getByRole("button", { name: new RegExp(GROUP_LABEL) })
    .first();

  await groupRow.click();

  const inspector = page.getByRole("dialog", { name: GROUP_LABEL });

  await inspector.getByRole("tab", { name: /^Roles/ }).click();
  await chooseOption(page, "Give this group a role", "E2E reader");

  const [assignResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/rpc/groups/assignRole")
    ),
    inspector.getByRole("button", { name: "Assign role" }).click(),
  ]);

  expect(assignResponse.status()).toBe(200);

  const [assigned] = await queryDatabase(
    `select count(*) from role_assignment a
       join role r on r.id = a.role_id
       join "group" g on g.id = a.principal_id::uuid
      where r.name = 'E2E reader' and g.external_id = '${GROUP_VALUE}'`
  );

  expect(assigned).toBe("1");

  await inspector.getByRole("button", { name: "Close" }).click();

  // The sheet closes rather than unmounting, so focus returns to the row's open button (R-22).
  await expect(inspector).toBeHidden();
  await expect(groupRow).toBeFocused();

  // A jit person whose token carries the group is admitted and holds the role through it.
  const admittedEmail = e2eGroupsRolesEmail("admitted", project);
  const admittedContext = await browser.newContext();
  const admittedPage = await admittedContext.newPage();

  await signInThroughKeycloak(admittedPage, { email: admittedEmail });

  const [admitted] = await queryDatabase(
    `select status || ':' || onboarding from "user" where email = '${admittedEmail}'`
  );

  expect(admitted).toBe("active:jit");

  const [membership] = await queryDatabase(
    `select count(*) from group_member gm
       join "user" u on u.id = gm.user_id
       join "group" g on g.id = gm.group_id
      where u.email = '${admittedEmail}' and g.external_id = '${GROUP_VALUE}' and gm.source = 'idp'`
  );

  expect(membership).toBe("1");

  await admittedContext.close();

  // Archiving the group stops its grants (R-25, R-32).
  await page.goto("/admin/groups");
  await page
    .getByRole("button", { name: new RegExp(GROUP_LABEL) })
    .first()
    .click();
  await page.getByRole("button", { name: "Archive group" }).click();

  const archiveDialog = page.getByRole("dialog", {
    name: new RegExp(`Archive ${GROUP_LABEL}`),
  });

  await expect(
    archiveDialog.getByText(/1 assignment stops granting/)
  ).toBeVisible();

  const [archiveResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/rpc/groups/archiveDirectoryGroup")
    ),
    archiveDialog.getByRole("button", { name: "Archive group" }).click(),
  ]);

  expect(archiveResponse.status()).toBe(200);

  const [archived] = await queryDatabase(
    `select (archived_at is not null) from "group" where external_id = '${GROUP_VALUE}'`
  );

  expect(archived).toBe("t");

  // A second jit person with the same claim is now refused: no non-archived mapped group remains.
  const refusedEmail = e2eGroupsRolesEmail("refused", project);
  const refusedContext = await browser.newContext();
  const refusedPage = await refusedContext.newPage();

  await signInThroughKeycloak(refusedPage, {
    email: refusedEmail,
    landing: "/sign-in",
  });

  expect(new URL(refusedPage.url()).searchParams.get("error")).toBe(
    "not_registered"
  );
  expect(
    await queryDatabase(`select id from "user" where email = '${refusedEmail}'`)
  ).toEqual([]);

  await refusedContext.close();
});

test("a closed or deleted group's detail is not read again", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const kept = `6wz1.20 kept ${project}`;
  const deleted = `6wz1.20 deleted ${project}`;

  await queryDatabase(
    `delete from "group" where source = 'local' and name in ('${kept}', '${deleted}')`
  );

  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("groups", project),
  });
  await page.goto("/admin/groups");

  const newLocalGroup = page.getByRole("button", { name: "New local group" });

  // The opener stays busy until the write's reloads finish, so a detail read would be over too.
  const settled = () =>
    expect(newLocalGroup).not.toHaveAttribute("aria-busy", "true");

  const createLocalGroup = async (name: string) => {
    await newLocalGroup.click();

    const dialog = page.getByRole("dialog", { name: "New local group" });

    await dialog.getByLabel("Name").fill(name);
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes("/api/rpc/groups/createLocalGroup")
      ),
      dialog.getByRole("button", { name: "Create group" }).click(),
    ]);
    await settled();
  };

  // Opening waits for the group's detail, so no read of the open itself lands in a later check.
  const openGroup = async (name: string) => {
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes("/api/rpc/groups/get")
      ),
      page
        .getByRole("button", { name: new RegExp(name) })
        .first()
        .click(),
    ]);

    // Exact, so that the closing "Delete <name>?" confirmation never matches too.
    return page.getByRole("dialog", { name, exact: true });
  };

  const detailReads: number[] = [];

  page.on("response", (response) => {
    if (response.url().includes("/api/rpc/groups/get"))
      detailReads.push(response.status());
  });

  await createLocalGroup(kept);

  const keptInspector = await openGroup(kept);

  await keptInspector.getByRole("button", { name: "Close" }).click();
  await expect(keptInspector).toBeHidden();

  // A save after the sheet closed reloads the list and never the closed group.
  detailReads.length = 0;
  await createLocalGroup(deleted);
  await expect(
    page.getByText(deleted, { exact: true }).filter({ visible: true })
  ).toBeVisible();
  expect(detailReads).toEqual([]);

  // Deleting the open group reads no detail of the removed group, so no read fails.
  const deletedInspector = await openGroup(deleted);

  await expect(deletedInspector).toBeVisible();
  await deletedInspector.getByRole("button", { name: "Delete group" }).click();
  detailReads.length = 0;
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/rpc/groups/deleteLocalGroup")
    ),
    page
      .getByRole("dialog", { name: `Delete ${deleted}?` })
      .getByRole("button", { name: "Delete group" })
      .click(),
  ]);
  await expect(deletedInspector).toBeHidden();
  await settled();
  expect(detailReads).toEqual([]);

  await queryDatabase(
    `delete from "group" where source = 'local' and name = '${kept}'`
  );
});

test("the role editor warns on an unavailable key and offers its removal", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const roleName = `E2E retired role ${project}`;

  await queryDatabase(
    `insert into role (name, permissions, is_system)
       values ('${roleName}', array['retired:key'], false)
       on conflict (name) do update set permissions = array['retired:key']`
  );

  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("groups", project),
  });
  await page.goto("/admin/roles");

  await page
    .getByRole("button", { name: new RegExp(roleName) })
    .first()
    .click();

  await expect(page.getByText("Unavailable, the key is retired")).toBeVisible();
  await expect(page.getByText("retired:key")).toBeVisible();

  // A custom role may remove the unavailable key without deleting the role.
  const [removeResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/rpc/roles/update")
    ),
    page.getByRole("button", { name: "Remove" }).click(),
  ]);

  expect(removeResponse.status()).toBe(200);

  const [stillThere] = await queryDatabase(
    `select count(*) from role where name = '${roleName}'`
  );

  const [stillHasKey] = await queryDatabase(
    `select count(*) from role where name = '${roleName}' and 'retired:key' = any(permissions)`
  );

  expect(stillThere).toBe("1");
  expect(stillHasKey).toBe("0");
});
