import { randomUUID } from "node:crypto";

import { createTenantContext, type TenantContext } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import { assignRole, insertRole, insertUser } from "@genie/core/testing";
import { expect, type Page, test } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import {
  hideDevelopmentWidgets,
  openUntilVisible,
  signInAs,
} from "./ask-support.ts";
import { DATABASE_URL, FIRST_PAINT, PUBLIC_URL } from "./dev-support.ts";
import { DEV_MODULES } from "./global-setup.ts";

/**
 * d8l5.44 through the real dev stack, which compiles Invoices and Payments: an administrator adds a
 * person with one role per module, the selects never offer an administration role, and "Open in
 * Access after adding" lands on that person's Grants with both rows granted. The main stack
 * compiles only Placeholder, so this journey runs here (plan P06-15). Each attempt gets its own
 * addresses, because the projects and the `--repeat-each` copies share one database at once; the
 * run starts that database empty, so nothing is cleared.
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

/** The administrator holds both keys tenant-wide, so Add person shows its role picker. */
async function insertAdministrator(email: string): Promise<void> {
  const id = await insertUser(database(), { email, emailVerified: true });

  const roleId = await insertRole(database(), {
    permissions: ["core:people:manage", "core:roles:manage"],
  });

  await assignRole(database(), { roleId, principal: { type: "user", id } });
}

test.afterAll(async () => {
  await tenant?.db.$client.end();
  tenant = undefined;
});

/** Opens a role select, proves it offers no administration role, and picks `option`. */
async function pickWithoutAdministration(
  page: Page,
  label: string,
  option: string
): Promise<void> {
  // By role: the open list repeats the trigger's name (6wz1.97), so a label lookup matches both.
  const trigger = page.getByRole("combobox", { name: label, exact: true });

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-controls", /.+/);

  const list = page.locator(
    `[id="${await trigger.getAttribute("aria-controls")}"]`
  );

  await expect(list).toBeVisible();
  await expect(
    list.getByRole("option", { name: /Tenant administrator|Auditor/ })
  ).toHaveCount(0);
  await list.getByRole("option", { name: option, exact: true }).click();
}

test("Add person gives one role per module and opens the person in Access", async ({
  page,
}) => {
  const attempt = randomUUID();
  const adminEmail = `e2e.p06.admin.${attempt}@example.invalid`;
  const email = `e2e.p06.added.${attempt}@example.invalid`;

  await insertAdministrator(adminEmail);
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
    .fill("E2E P06 added");
  // The dev stack can run with no mailer, and the journey needs no email.
  await dialog
    .getByRole("checkbox", { name: "Send invitation email" })
    .uncheck();

  await pickWithoutAdministration(
    page,
    "Role for Invoices and Payments",
    "Invoices and Payments viewer (default)"
  );
  await pickWithoutAdministration(page, "Role for Ask", "Ask user (default)");
  await expect(dialog).toContainText("Access to Invoices and Payments and Ask");
  await dialog
    .getByRole("checkbox", { name: "Open in Access after adding" })
    .check();
  await expectNoAxeViolations(page, "Add person with two picks");
  await dialog.getByRole("button", { name: "Add person" }).click();

  await expect
    .poll(
      async () => {
        const { rows } = await database().db.$client.query<{ id: string }>(
          'select id from "user" where email = $1',
          [email]
        );

        return rows[0]?.id;
      },
      { timeout: 30_000 }
    )
    .toBeDefined();

  const { rows } = await database().db.$client.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );

  const personId = rows[0]?.id ?? "";

  await expect(page).toHaveURL(
    new RegExp(`/admin/access\\?recipient=${personId}$`),
    FIRST_PAINT
  );

  const granted = page.getByRole("group", { name: "Granted", exact: true });

  await expect(
    granted.getByRole("checkbox", { name: "Invoices and Payments" })
  ).toBeVisible(FIRST_PAINT);
  await expect(granted.getByRole("checkbox", { name: "Ask" })).toBeVisible();
  await expect(
    page.getByLabel("Role for Invoices and Payments", { exact: true })
  ).toHaveText(/Invoices and Payments viewer/);
});
