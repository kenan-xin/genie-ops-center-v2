import { expect, test } from "@playwright/test";

import {
  e2eGroupsRolesEmail,
  e2eGroupsRolesGroup,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
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

  // The administrator pre-adds the directory group by its exact claim value (DEC-52).
  await signInThroughKeycloak(page, { email: adminEmail });
  await page.goto("/admin/groups");

  await page.getByRole("button", { name: "Add directory group" }).click();

  const addDialog = page.getByRole("dialog", { name: "Add directory group" });

  await addDialog.getByLabel("Claim value").fill(GROUP_VALUE);
  await addDialog.getByLabel("Display label").fill("S2-11 group");

  const [addResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("groups.addDirectoryGroup")
    ),
    addDialog.getByRole("button", { name: "Add group" }).click(),
  ]);

  expect(addResponse.status()).toBe(200);

  await expect(page.getByText("S2-11 group")).toBeVisible();
  await expect(page.getByText("Not seen yet").first()).toBeVisible();

  // Map the group to a role through the screen's own assign step (R-24b), not SQL.
  await page
    .getByRole("button", { name: /S2-11 group/ })
    .first()
    .click();

  const inspector = page.getByRole("dialog", { name: "S2-11 group" });

  await inspector.getByRole("tab", { name: /^Roles/ }).click();
  await inspector
    .getByLabel("Role to assign")
    .selectOption({ label: "E2E reader" });
  await inspector.getByRole("button", { name: "Assign role" }).click();

  const [assigned] = await queryDatabase(
    `select count(*) from role_assignment a
       join role r on r.id = a.role_id
       join "group" g on g.id = a.principal_id::uuid
      where r.name = 'E2E reader' and g.external_id = '${GROUP_VALUE}'`
  );

  expect(assigned).toBe("1");

  await inspector.getByRole("button", { name: "Close" }).click();

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
    .getByRole("button", { name: /S2-11 group/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Archive group" }).click();

  const archiveDialog = page.getByRole("dialog", {
    name: /Archive S2-11 group/,
  });

  await expect(
    archiveDialog.getByText(/assignment.* stop granting/)
  ).toBeVisible();
  await archiveDialog.getByRole("button", { name: "Archive group" }).click();

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

test("the role editor warns on an unavailable key and offers its removal", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const roleName = `E2E retired role ${project}`;

  await queryDatabase(
    `insert into role (name, permissions, is_system)
       values ('${roleName}', array['retired:key'], false)
       on conflict (name) do nothing`
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
  await page.getByRole("button", { name: "Remove" }).click();

  const [stillThere] = await queryDatabase(
    `select count(*) from role where name = '${roleName}'`
  );

  const [stillHasKey] = await queryDatabase(
    `select count(*) from role where name = '${roleName}' and 'retired:key' = any(permissions)`
  );

  expect(stillThere).toBe("1");
  expect(stillHasKey).toBe("0");
});
