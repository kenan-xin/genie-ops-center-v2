import { expect, test } from "@playwright/test";

import {
  E2E_LOCAL_ADMIN_PASSWORD,
  E2E_LOCAL_PERSON_PASSWORD,
  e2eLocalAdminEmail,
  e2eLocalBaseUrl,
  e2eLocalPersonEmail,
} from "../testing/e2e-keycloak.ts";
import { queryLocalDatabase } from "./support/database.ts";
import { clearMailpit, waitForLink } from "./support/mailpit.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * Scenario S-F (Spec 2 AC-4, R-40, R-42, R-51a): no SSO, local accounts. It runs against the
 * second e2e stack whose `tenant.yaml` sets `local_accounts: true`, so setup created the local
 * realm variant (email verification, a password policy, per-realm SMTP). The administrator adds a
 * local person; Genie Ops Center creates the realm account through `genie-admin` and triggers the
 * realm's set-password email; the person opens that email from Mailpit, sets a password, signs in
 * through the realm's own form, and becomes active. Resend set-password is rate limited.
 *
 * The file pins the S-F stack's base URL, so it runs under both the phone and the desktop project
 * while never touching the shared brokered stack.
 */
test.use({ baseURL: e2eLocalBaseUrl() });

const LOCAL_BASE_URL = e2eLocalBaseUrl();

test.describe.configure({ timeout: 240_000 });

test("S-F: add a local person, set the password from the Mailpit email, sign in, and rate limit resend", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const adminEmail = e2eLocalAdminEmail(project);
  const personEmail = e2eLocalPersonEmail(project);
  const personName = `E2E Local ${project}`;

  // The S-F database keeps rows between runs, so clear this project's person first.
  await queryLocalDatabase(
    `with old as (select id from "user" where email = '${personEmail}'),
          grants as (delete from role_assignment where principal_id in (select id from old)),
          members as (delete from group_member where user_id in (select id from old)),
          sessions as (delete from session where user_id in (select id from old)),
          accounts as (delete from account where user_id in (select id from old))
     delete from "user" where id in (select id from old)`
  );

  // The pre-added administrator signs in, activates, and opens People.
  await signInThroughKeycloak(page, {
    email: adminEmail,
    password: E2E_LOCAL_ADMIN_PASSWORD,
  });
  await page.goto("/admin/people");

  await clearMailpit();

  // Add person as a local account: the dialog offers the type because local accounts are on.
  await page.getByRole("button", { name: "Add person" }).click();

  const addDialog = page.getByRole("dialog", { name: "Add person" });

  await addDialog.getByLabel("Email", { exact: true }).fill(personEmail);
  await addDialog.getByLabel("Display name", { exact: true }).fill(personName);
  await addDialog.getByLabel("Local password").press("Space");

  // A local account carries no invitation checkbox; the realm sends the set-password email.
  await expect(
    addDialog.getByRole("checkbox", { name: "Send invitation email" })
  ).toHaveCount(0);

  await addDialog.getByRole("button", { name: "Add person" }).press("Enter");

  await expect
    .poll(
      async () => {
        const [row] = await queryLocalDatabase(
          `select u.status || ':' || exists(select 1 from account a where a.user_id = u.id and a.provider_id = 'credential')
             from "user" u where u.email = '${personEmail}'`
        );

        return row;
      },
      { timeout: 30000 }
    )
    .toBe("pending:true");

  await expect(page.getByText(personName)).toBeVisible();

  // Resend set-password is rate limited to three per hour per target person (R-19, R-41). Open the
  // person and press it three times: each is allowed and sends a fresh realm email.
  await page
    .getByRole("button", { name: new RegExp(personName) })
    .first()
    .press("Enter");

  const inspector = page.getByRole("dialog", { name: personName });

  /* eslint-disable no-await-in-loop -- the limit is a sequence by definition. */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [response] = await Promise.all([
      page.waitForResponse((one) =>
        one.url().includes("people.resendSetPassword")
      ),
      inspector
        .getByRole("button", { name: "Resend set-password email" })
        .press("Enter"),
    ]);

    expect(response.status()).toBe(200);
  }

  // The fourth is refused with the neutral rate-limited code, and one audit row records it.
  const [limited] = await Promise.all([
    page.waitForResponse((one) =>
      one.url().includes("people.resendSetPassword")
    ),
    inspector
      .getByRole("button", { name: "Resend set-password email" })
      .press("Enter"),
  ]);

  expect(limited.status()).toBe(429);

  const rateLimitedRows = await queryLocalDatabase(
    `select count(*) from audit_event
      where action = 'auth:rate_limited'
        and metadata->>'endpoint' = 'resend_set_password'`
  );

  expect(rateLimitedRows[0]).not.toBe("0");

  await inspector.getByRole("button", { name: "Close" }).press("Enter");
  /* eslint-enable no-await-in-loop */

  // Read the realm's set-password link from Mailpit and open it in a fresh browser context, so the
  // administrator's realm session does not claim the required action.
  // Keycloak 26's execute-actions-email link is the `action-token` endpoint.
  const setPasswordLink = await waitForLink(personEmail, (url) =>
    url.includes("login-actions/action-token")
  );

  const setPasswordContext = await browser.newContext();

  try {
    const setPasswordPage = await setPasswordContext.newPage();

    await setPasswordPage.goto(setPasswordLink, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // A fresh session gets Keycloak's confirmation page first (the execute-actions token handler);
    // its action link re-serializes the token bound to an authentication session. Confirming it
    // then renders the update-password form, whose fields are `password-new` and `password-confirm`.
    const confirm = setPasswordPage.locator('a[href*="action-token"]').first();

    if ((await confirm.count()) > 0) {
      await confirm.click();
    }

    await setPasswordPage.locator("#password-new").waitFor({ timeout: 30000 });
    await setPasswordPage
      .locator("#password-new")
      .fill(E2E_LOCAL_PERSON_PASSWORD);
    await setPasswordPage
      .locator("#password-confirm")
      .fill(E2E_LOCAL_PERSON_PASSWORD);
    await setPasswordPage
      .locator('button[type="submit"], input[type="submit"]')
      .first()
      .click();

    // The required action completes and Keycloak shows its success page.
    await setPasswordPage
      .getByText(/account has been updated|Your account/i)
      .first()
      .waitFor({ timeout: 30000 });
  } finally {
    await setPasswordContext.close();
  }

  // The person signs in through the realm's own form in their own context, with the new password.
  const personContext = await browser.newContext({ baseURL: LOCAL_BASE_URL });

  try {
    const personPage = await personContext.newPage();

    await signInThroughKeycloak(personPage, {
      email: personEmail,
      password: E2E_LOCAL_PERSON_PASSWORD,
    });

    expect(new URL(personPage.url()).pathname).toBe("/");
  } finally {
    await personContext.close();
  }

  const [active] = await queryLocalDatabase(
    `select status || ':' || (first_sign_in_at is not null) from "user" where email = '${personEmail}'`
  );

  expect(active).toBe("active:true");
});
