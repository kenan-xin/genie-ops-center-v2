import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { e2eBreakGlassEmail, e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { queryDatabase } from "./support/database.ts";
import { clearMailpit, linksIn, waitForMessageTo } from "./support/mailpit.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/** The button that opens a person's row: the table's identity cell, or the phone card's title. */
function personRow(page: Page, name: string) {
  return page
    .getByRole("table", { name: "People" })
    .or(page.getByRole("list", { name: "People" }))
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .filter({ visible: true });
}

/**
 * S2-10 through the real realm, the real database, the real People screen and the real mail sink:
 * an administrator adds a brokered person, the invitation checkbox is checked by default (R-40a),
 * and the `invitation-brokered` email reaches Mailpit with a sign-in link built from PUBLIC_URL.
 * The audit row that holds no link (R-44) is proved by the People router's integration tests, and
 * the email-taken refusal that keeps the dialog open by the People screen's stories. Remove bans the row and keeps it (R-43), self-protection
 * disables the viewer's own Disable control with the server's reason (R-38), and the break-glass
 * account never appears (R-39). The local-account set-password flow is the S-F spec's subject.
 *
 * The phone and desktop projects share one database, so the added person's email is project-scoped.
 */
test.describe.configure({ timeout: 180_000 });

test("add a brokered person, send the invitation to Mailpit, remove them, and hold self-protection", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const adminEmail = e2eReaderEmail("people", project);
  const personEmail = `e2e.people-added.${project}@example.invalid`;

  // The e2e database keeps rows between runs, so clear this project's person from an earlier run.
  await queryDatabase(
    `with old as (select id from "user" where email = '${personEmail}'),
          grants as (delete from role_assignment where principal_id in (select id from old)),
          members as (delete from group_member where user_id in (select id from old)),
          sessions as (delete from session where user_id in (select id from old))
     delete from "user" where id in (select id from old)`
  );

  await signInThroughKeycloak(page, { email: adminEmail });
  await page.goto("/admin/people");

  const publicUrl = new URL(page.url()).origin;

  // Open and close a person first, so the save below proves the closed person is not read again.
  await page.getByLabel("Search people").fill(adminEmail);
  // The row opens from the person's name, which is the card's title on a phone and the table's
  // identity cell from 768 px.
  await personRow(page, "E2E Person").first().click();

  const closedInspector = page.getByRole("dialog", { name: "E2E Person" });

  await closedInspector.getByRole("button", { name: "Close" }).click();
  await expect(closedInspector).toBeHidden();
  await page.getByLabel("Search people").fill("");

  const detailReads: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/rpc/people/get"))
      detailReads.push(request.url());
  });

  // Add person: the invitation checkbox is checked by default (R-40a).
  await page.getByRole("button", { name: "Add person" }).click();

  const addDialog = page.getByRole("dialog", { name: "Add person" });

  await addDialog.getByLabel("Email", { exact: true }).fill(personEmail);
  await addDialog
    .getByLabel("Display name", { exact: true })
    .fill(`E2E Added ${project}`);

  const invitation = addDialog.getByRole("checkbox", {
    name: "Send invitation email",
  });

  await expect(invitation).toBeChecked();

  // Read only this spec's messages.
  await clearMailpit(personEmail);

  await addDialog.getByRole("button", { name: "Add person" }).press("Enter");

  // The write reaches the database; polling the outcome is steadier than racing the transport.
  await expect
    .poll(
      async () => {
        const [row] = await queryDatabase(
          `select status from "user" where email = '${personEmail}'`
        );

        return row;
      },
      { timeout: 30000 }
    )
    .toBe("pending");

  // A save that fully succeeded is reported by a toast (PD-13).
  // Exact, so that the partial-success notice "Person added; the email was not sent" fails it.
  await expect(
    page
      .getByRole("status")
      .filter({ has: page.getByText("Person added", { exact: true }) })
  ).toBeVisible();

  // The toast follows the reloads, so a read of the closed person would be sent by now (6wz1.20).
  expect(detailReads).toEqual([]);

  // The table and the phone card list both hold the row, and only one of them shows.
  await expect(
    page.getByText(`E2E Added ${project}`).filter({ visible: true })
  ).toBeVisible();

  // R-40a: one `invitation-brokered` email, with a sign-in link built from PUBLIC_URL.
  const mail = await waitForMessageTo(personEmail);

  expect(mail.Subject).toContain("invited");
  expect(linksIn(mail)).toContain(`${publicUrl}/sign-in`);

  // Open the added person and remove them. Remove confirms first, bans the row, and keeps it.
  await page
    .getByRole("button", { name: new RegExp(`E2E Added ${project}`) })
    .first()
    .click();

  const inspector = page.getByRole("dialog", {
    name: `E2E Added ${project}`,
  });

  await expect(
    inspector.getByText("Identity provider", { exact: true })
  ).toBeVisible();

  await inspector.getByRole("button", { name: /Remove/ }).click();

  const confirm = page.getByRole("dialog", {
    name: `Remove E2E Added ${project}?`,
  });

  await expect(confirm.getByText(/Every session ends/)).toBeVisible();

  await confirm.getByRole("button", { name: "Remove person" }).click();

  await expect
    .poll(
      async () => {
        const [row] = await queryDatabase(
          `select banned || ':' || status from "user" where email = '${personEmail}'`
        );

        return row;
      },
      { timeout: 30000 }
    )
    .toBe("true:disabled");

  await inspector.getByRole("button", { name: "Close" }).click();

  // Self-protection: the signed-in administrator's own row cannot disable itself (R-38).
  await page.getByLabel("Search people").fill(adminEmail);

  const selfRow = personRow(page, "E2E Person").first();

  await selfRow.click();

  const self = page.getByRole("dialog", { name: "E2E Person" });

  await expect(self.getByRole("button", { name: "Disable" })).toBeDisabled();
  await expect(
    self.getByText("You cannot disable or remove yourself")
  ).toBeVisible();

  await self.getByRole("button", { name: "Close" }).click();

  // The sheet closes rather than unmounting, so focus returns to the row's open button (R-22).
  await expect(self).toBeHidden();
  await expect(selfRow).toBeFocused();

  // The break-glass account never appears in People (R-39).
  await page.getByLabel("Search people").fill(e2eBreakGlassEmail(project));

  await expect(page.getByText(/No people match/)).toBeVisible();

  // A refused add keeps its reason readable in dark (6wz1.71). The branding theme is `system`.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Add person" }).click();

  const refusedDialog = page.getByRole("dialog", { name: "Add person" });

  const email = refusedDialog.getByLabel("Email", { exact: true });
  const addPath = "**/api/rpc/people/add";

  await email.fill(adminEmail);
  await refusedDialog
    .getByLabel("Display name", { exact: true })
    .fill("E2E refused");

  // A save that never reaches the server says so in the dialog's action bar, takes focus, and
  // keeps the typed values: Add person is the retry.
  await page.route(addPath, (route) => route.abort());
  await refusedDialog.getByRole("button", { name: "Add person" }).click();

  const failure = refusedDialog.getByRole("alert");

  await expect(failure).toHaveText(
    "The person was not added. The server could not be reached. Check your connection. Your change is kept."
  );
  await expect(failure).toBeFocused();
  await expect(email).toHaveValue(adminEmail);
  await page.unroute(addPath);

  await refusedDialog.getByRole("button", { name: "Add person" }).click();
  await expect(failure).toHaveText(
    "The person was not added. A person with that email already exists. Your change is kept."
  );
  await expect(failure).toBeFocused();
  await expectNoAxeViolations(page, "Add person refused, dark");
});
