import { expect, test } from "@playwright/test";

import { e2eBreakGlassEmail, e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * S2-10 through the real realm, the real database and the real People screen: an administrator
 * adds a brokered person (the invitation checkbox is checked by default, R-40a), the person is
 * pending, and Remove bans them and keeps the row (R-43). Self-protection disables the viewer's own
 * Disable control with the server's reason (R-38), and the break-glass account never appears
 * (R-39). The invitation email and the local-account set-password flow need the local realm variant
 * and a configured mailer, so they are proved by the router's database-backed tests and the
 * Storybook behaviour tests, not here.
 *
 * The phone and desktop projects share one database, so the added person's email is project-scoped.
 */
test.describe.configure({ timeout: 180_000 });

test("add a brokered person, remove them, and hold self-protection and the break-glass rule", async ({
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

  // No mailer is configured in this stack, so the invitation is unchecked here; the default is
  // proved above and the send itself by the database-backed test. Space toggles the focused
  // checkbox, which stays reliable on the phone's short dialog viewport.
  await invitation.press("Space");
  await expect(invitation).not.toBeChecked();

  await addDialog.getByRole("button", { name: "Add person" }).press("Enter");

  // The write reaches the database; the dialog closes and the row appears. Polling the outcome
  // is steadier than racing the transport on a loaded machine.
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

  await expect(page.getByText(`E2E Added ${project}`)).toBeVisible();

  // Open the added person and remove them. Remove confirms first, bans the row, and keeps it.
  await page
    .getByRole("button", { name: new RegExp(`E2E Added ${project}`) })
    .first()
    .press("Enter");

  const inspector = page.getByRole("dialog", {
    name: `E2E Added ${project}`,
  });

  await expect(
    inspector.getByText("Identity provider", { exact: true })
  ).toBeVisible();

  await inspector.getByRole("button", { name: /Remove/ }).press("Enter");

  const confirm = page.getByRole("dialog", {
    name: `Remove E2E Added ${project}?`,
  });

  await expect(confirm.getByText(/Every session ends/)).toBeVisible();

  await confirm.getByRole("button", { name: "Remove person" }).press("Enter");

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

  await inspector.getByRole("button", { name: "Close" }).press("Enter");

  // Self-protection: the signed-in administrator's own row cannot disable itself (R-38).
  await page.getByLabel("Search people").fill(adminEmail);

  await page
    .getByRole("button", { name: new RegExp(adminEmail.replace(".", "\\.")) })
    .first()
    .press("Enter");

  const self = page.getByRole("dialog", { name: "E2E Person" });

  await expect(self.getByRole("button", { name: "Disable" })).toBeDisabled();
  await expect(
    self.getByText("You cannot disable or remove yourself")
  ).toBeVisible();

  await self.getByRole("button", { name: "Close" }).press("Enter");

  // The break-glass account never appears in People (R-39).
  await page.getByLabel("Search people").fill(e2eBreakGlassEmail(project));

  await expect(page.getByText(/No people match/)).toBeVisible();
});
