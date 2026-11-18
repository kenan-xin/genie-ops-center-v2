import { randomUUID } from "node:crypto";

import { createTenantContext, type TenantContext } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import {
  assignRole,
  insertGroup,
  insertRole,
  insertUser,
} from "@genie/core/testing";
import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import {
  hideDevelopmentWidgets,
  openUntilVisible,
  signInAs,
} from "./ask-support.ts";
import { DATABASE_URL, FIRST_PAINT, PUBLIC_URL } from "./dev-support.ts";
import { DEV_MODULES } from "./global-setup.ts";

/**
 * d8l5.63 (P12-18) through the real dev stack, which compiles Invoices and Payments: an
 * administrator adds a person with a group made here, the person's sheet opens on Roles with no
 * role, and Add assignment adds one. The main stack compiles only Placeholder, so this journey
 * runs here (plan P06-15). Each attempt gets its own addresses and group, because the projects and
 * the `--repeat-each` copies share one database at once; the run starts that database empty, so
 * nothing is cleared.
 */

test.skip(
  !DEV_MODULES.has("invoices"),
  "This run does not compile the invoices module."
);

// A cold `next dev` compiles People and Access on their first request.
test.describe.configure({ timeout: FIRST_PAINT.timeout * 3 });

let tenant: TenantContext | undefined;

function database(): TenantContext {
  if (tenant === undefined) throw new Error("no tenant context");

  return tenant;
}

test.beforeAll(() => {
  tenant = createTenantContext(
    { DATABASE_URL, PUBLIC_URL },
    silentLogger(),
    ["invoices"],
    undefined,
    "core"
  );
});

/** The administrator holds the People, Roles and Groups keys tenant-wide, so Add person shows Groups and the sheet offers Add assignment. */
async function insertAdministrator(email: string): Promise<void> {
  const id = await insertUser(database(), {
    email,
    name: "Access Administrator",
    emailVerified: true,
  });

  const roleId = await insertRole(database(), {
    permissions: [
      "core:people:manage",
      "core:roles:manage",
      "core:groups:manage",
    ],
  });

  await assignRole(database(), { roleId, principal: { type: "user", id } });
}

test.afterAll(async () => {
  await tenant?.db.$client.end();
  tenant = undefined;
});

test("Add person adds a group, then opens the Roles tab to add a role", async ({
  page,
}) => {
  const attempt = randomUUID();
  const adminEmail = `e2e.p12.admin.${attempt}@example.invalid`;
  const email = `e2e.p12.added.${attempt}@example.invalid`;
  const groupName = `E2E P12 group ${attempt}`;

  await insertAdministrator(adminEmail);
  const groupId = await insertGroup(database(), [], { name: groupName });
  await hideDevelopmentWidgets(page);
  await signInAs(page, adminEmail);
  await page.goto("/admin/people");

  const dialog = page.getByRole("dialog", { name: "Add person" });

  await openUntilVisible(
    page.getByRole("button", { name: "Add person" }).filter({ visible: true }),
    dialog
  );
  await dialog.getByLabel("Work email", { exact: true }).fill(email);
  await dialog
    .getByLabel("Display name", { exact: true })
    .fill("E2E P12 added");
  await dialog.getByRole("combobox", { name: "Groups" }).fill(groupName);
  await page.getByRole("option", { name: groupName, exact: true }).click();
  // Tab closes the list; Escape could close the dialog.
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: `Remove ${groupName}` })
  ).toBeVisible();
  // The dev stack can run with no mailer, and the journey needs no email.
  await dialog
    .getByRole("checkbox", { name: "Send invitation email" })
    .uncheck();
  // d8l5.63: no role is offered here.
  await expect(
    dialog.getByRole("combobox", { name: /^Role for / })
  ).toHaveCount(0);
  await expect(dialog.getByText("Open in Access after adding")).toHaveCount(0);
  await expectNoAxeViolations(page, "Add person with a group");
  await dialog.getByRole("button", { name: "Add person" }).click();

  const personId = async () => {
    const { rows } = await database().db.$client.query<{ id: string }>(
      'select id from "user" where email = $1',
      [email]
    );

    return rows[0]?.id;
  };

  await expect.poll(personId, { timeout: 30_000 }).toBeDefined();

  const id = (await personId()) ?? "";

  const { rows: members } = await database().db.$client.query<{
    count: string;
  }>("select count(*) from group_member where user_id = $1 and group_id = $2", [
    id,
    groupId,
  ]);

  expect(members[0]?.count).toBe("1");

  // P12-18: the new person's sheet opens on Roles, with no role yet.
  const sheet = page.getByRole("dialog", { name: "E2E P12 added" });

  await expect(
    sheet.getByRole("heading", { name: "Assigned roles (0)" })
  ).toBeVisible(FIRST_PAINT);
  await expect(sheet.getByRole("tab", { name: /^Roles/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await sheet.getByRole("button", { name: "Add assignment" }).click();
  await sheet.getByRole("combobox", { name: "Role" }).click();
  await page
    .getByRole("option", { name: /^Invoices and Payments viewer/ })
    .click();
  await sheet.getByRole("button", { name: "Add assignment" }).click();

  await expect(
    sheet.getByRole("heading", { name: "Assigned roles (1)" })
  ).toBeVisible(FIRST_PAINT);
  await expect(
    sheet
      .getByText("Invoices and Payments viewer", { exact: true })
      .filter({ visible: true })
  ).toHaveCount(1);

  const { rows: assigned } = await database().db.$client.query<{
    count: string;
  }>(
    "select count(*) from role_assignment where principal_type = 'user' and principal_id = $1",
    [id]
  );

  expect(assigned[0]?.count).toBe("1");
});
