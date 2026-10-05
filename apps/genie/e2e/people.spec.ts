import { expect, test } from "@playwright/test";

import { e2eBreakGlassEmail, e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { clearMailpit, linksIn, waitForMessageTo } from "./support/mailpit.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * S2-10 through the real realm, the real database, the real People screen and the real mail sink:
 * an administrator adds a brokered person, the invitation checkbox is checked by default (R-40a),
 * the `invitation-brokered` email reaches Mailpit with a sign-in link built from PUBLIC_URL, and
 * the audit row holds no link (R-44). Remove bans the row and keeps it (R-43), self-protection
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
  await clearMailpit();

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

  await expect(page.getByText(`E2E Added ${project}`)).toBeVisible();

  // R-40a: one `invitation-brokered` email, with a sign-in link built from PUBLIC_URL.
  const mail = await waitForMessageTo(personEmail);

  expect(mail.Subject).toContain("invited");
  expect(linksIn(mail)).toContain(`${publicUrl}/sign-in`);

  // R-44: the audit row records the send and never the link.
  const [metadata] = await queryDatabase(
    `select metadata::text from audit_event
      where action = 'core:invitation_sent'
        and target_id = (select id from "user" where email = '${personEmail}')
      order by occurred_at desc limit 1`
  );

  expect(metadata).toBeDefined();
  expect(metadata).not.toContain("http");

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

test("keeps the Add person dialog open and shows the email-taken refusal", async ({
  page,
}, testInfo) => {
  const adminEmail = e2eReaderEmail("people", testInfo.project.name);

  await signInThroughKeycloak(page, { email: adminEmail });
  await page.goto("/admin/people");

  await page.getByRole("button", { name: "Add person" }).click();

  const dialog = page.getByRole("dialog", { name: "Add person" });

  // The signed-in administrator's own address is already taken.
  await dialog.getByLabel("Email", { exact: true }).fill(adminEmail);
  await dialog.getByRole("button", { name: "Add person" }).press("Enter");

  await expect(dialog.getByRole("alert")).toHaveText(/already exists/);
  await expect(dialog).toBeVisible();
});
