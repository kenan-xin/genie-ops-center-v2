import { expect, test } from "@playwright/test";

import {
  COMPANY_REALM,
  deleteRealmUser,
  E2E_LOCAL_PERSON_PASSWORD,
  E2E_USER_PASSWORD,
} from "../testing/e2e-keycloak.ts";
import { LOCALSSO_DOMAIN, scenarioEmail } from "./scenarios.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import {
  BROKER_IDP_ALIAS,
  LOCALSSO_DB,
  LOCALSSO_REALM,
  localSsoBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { clearMailpit, waitForLink } from "./support/mailpit.ts";
import { expectLanded } from "./support/sign-in.ts";

/**
 * Spec 2 AC-27 (S2-17): local accounts beside SSO. Global setup ran `idp set` and then
 * `genie-ops realm local-accounts enable --sso-domain company.example` on the `localsso` broker.
 * The sign-in page shows both entries. The SSO entry goes straight to the company realm, Add person
 * refuses a local account on the SSO domain (R-40b), and a local person outside it sets a password
 * from the realm's email and signs in through the realm's own form (R-17c, R-58a).
 *
 * Each project uses its own administrator and addresses, so phone and desktop share the deployment.
 */
test.use({ baseURL: localSsoBaseUrl() });

test.describe.configure({ timeout: 240_000 });

const REFUSAL =
  "This address uses the company sign-in. Add the person as a company account.";

const sql = (query: string) => queryBrokerDatabase(LOCALSSO_DB, query);

test("AC-27: the SSO entry skips the realm, a local add on the SSO domain is refused, and a local person outside it signs in", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const personEmail = `e2e.s2-17.local.${project}@partner.example`;
  const refusedEmail = `e2e.s2-17.refused.${project}@${LOCALSSO_DOMAIN}`;
  const personName = `E2E S2-17 Local ${project}`;

  // The deployment keeps its rows and its realm users between runs, so clear this project's person.
  await sql(
    `with old as (select id from "user" where email = '${personEmail}'),
          grants as (delete from role_assignment where principal_id in (select id from old)),
          members as (delete from group_member where user_id in (select id from old)),
          sessions as (delete from session where user_id in (select id from old)),
          accounts as (delete from account where user_id in (select id from old))
     delete from "user" where id in (select id from old)`
  );
  await deleteRealmUser(LOCALSSO_REALM, personEmail);
  await clearMailpit(personEmail);

  // Every committed main-frame page, so a realm page that a redirect would hide still shows here.
  const committed: string[] = [];

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) committed.push(frame.url());
  });

  await page.goto("/sign-in");

  const ssoEntry = page.getByRole("link", { name: "Sign in with SSO" });

  await expect(ssoEntry).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with email and password" })
  ).toBeVisible();
  await expectNoAxeViolations(page, "Sign-in with two entries");

  // The SSO entry carries the hint, so the first page after the app is the company realm's form.
  await ssoEntry.click();
  await page.locator("#username").waitFor({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/realms/${COMPANY_REALM}/`));
  expect(
    committed.filter((url) => url.includes(`/realms/${LOCALSSO_REALM}/`))
  ).toEqual([]);

  await page
    .locator("#username")
    .fill(scenarioEmail("localsso", "admin", project));
  await page.locator("#password").fill(E2E_USER_PASSWORD);
  await page.locator("#kc-login").click();
  await expectLanded(page, undefined, 45_000);

  await page.goto("/admin/people");
  await page.getByRole("button", { name: "Add person" }).click();

  const addDialog = page.getByRole("dialog", { name: "Add person" });
  const email = addDialog.getByLabel("Email", { exact: true });

  await email.fill(refusedEmail);
  await addDialog.getByLabel("Display name", { exact: true }).fill(personName);
  await addDialog.getByRole("radio", { name: "Local password" }).press("Space");

  const [refused] = await Promise.all([
    page.waitForResponse((one) => one.url().includes("/api/rpc/people/add")),
    addDialog.getByRole("button", { name: "Add person" }).press("Enter"),
  ]);

  // R-40b: the refusal sits at the email field, and the dialog keeps what was typed.
  expect(refused.status()).toBe(400);
  await expect(email).toHaveValue(refusedEmail);
  await expect(email).toHaveAccessibleDescription(REFUSAL);
  await expectNoAxeViolations(page, "Add person refused on the SSO domain");
  expect(
    await sql(`select count(*) from "user" where email = '${refusedEmail}'`)
  ).toEqual(["0"]);

  // The same dialog adds the person on an address outside the SSO domain.
  await email.fill(personEmail);
  await addDialog.getByRole("button", { name: "Add person" }).press("Enter");

  await expect
    .poll(
      async () => {
        const [row] = await sql(
          `select u.status || ':' || exists(select 1 from account a where a.user_id = u.id and a.provider_id = 'credential')
             from "user" u where u.email = '${personEmail}'`
        );

        return row;
      },
      { timeout: 30_000 }
    )
    .toBe("pending:true");

  // The realm's set-password email, opened in a fresh context as S-F does.
  const setPasswordLink = await waitForLink(personEmail, (url) =>
    url.includes("login-actions/action-token")
  );

  const setPasswordContext = await browser.newContext();

  try {
    const setPasswordPage = await setPasswordContext.newPage();

    await setPasswordPage.goto(setPasswordLink, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const confirm = setPasswordPage.locator('a[href*="action-token"]').first();

    if ((await confirm.count()) > 0) {
      await confirm.click();
    }

    await setPasswordPage.locator("#password-new").waitFor({ timeout: 30_000 });
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
    await setPasswordPage
      .getByText(/account has been updated|Your account/i)
      .first()
      .waitFor({ timeout: 30_000 });
  } finally {
    await setPasswordContext.close();
  }

  // The second entry carries no hint: the realm's own page shows the form and the provider link.
  const personContext = await browser.newContext({
    baseURL: localSsoBaseUrl(),
  });

  try {
    const personPage = await personContext.newPage();

    await personPage.goto("/sign-in");
    await personPage
      .getByRole("link", { name: "Sign in with email and password" })
      .click();
    await personPage.locator("#username").waitFor({ timeout: 30_000 });
    await expect(personPage).toHaveURL(
      new RegExp(`/realms/${LOCALSSO_REALM}/`)
    );
    await expect(
      personPage.locator(`a[href*="/broker/${BROKER_IDP_ALIAS}/login"]`)
    ).toHaveCount(1);

    await personPage.locator("#username").fill(personEmail);
    await personPage.locator("#password").fill(E2E_LOCAL_PERSON_PASSWORD);
    await personPage.locator("#kc-login").click();
    await expectLanded(personPage, undefined, 45_000);
  } finally {
    await personContext.close();
  }

  expect(
    await sql(
      `select status || ':' || (first_sign_in_at is not null) from "user" where email = '${personEmail}'`
    )
  ).toEqual(["active:true"]);
});
