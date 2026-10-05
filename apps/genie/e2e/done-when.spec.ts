import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  COMPANY_REALM,
  E2E_USER_PASSWORD,
  setRealmUserEnabled,
  setRealmUserGroupMemberships,
} from "../testing/e2e-keycloak.ts";
import { doneAdmitGroup, doneGrantGroup, scenarioEmail } from "./scenarios.ts";
import {
  BROKER_DB,
  brokeredBaseUrl,
  INVITE_DB,
  inviteBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Spec 2 "done when" (AC-20 to AC-24), through the test identity provider: the `company` realm
 * plays the customer's provider and a tenant realm brokers to it (tech plan D2-2). Each proof runs
 * at the phone and the desktop viewport through the two Playwright projects (DEC-25).
 *
 * `jit` runs on the S2-13 OIDC broker deployment, and `invite` on its own deployment, so neither
 * proof changes a shared deployment's onboarding mode.
 */
test.describe.configure({ timeout: 240_000 });

async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** The `user` row's status and onboarding, and its session count, in one deployment database. */
async function personState(
  db: string,
  email: string
): Promise<string | undefined> {
  const [row] = await queryBrokerDatabase(
    db,
    `select u.status || ':' || u.onboarding || ':' || (select count(*) from session s where s.user_id = u.id)
       from "user" u where u.email = '${email}'`
  );

  return row;
}

async function placeholderVisible(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/`);
  await expect(
    page.getByRole("link", { name: "Placeholder", exact: true })
  ).toBeVisible();

  await page.goto(`${baseUrl}/placeholder`);
  await expect(page.getByTestId("permission-denied")).toHaveCount(0);

  const read = await page.request.get(
    `${baseUrl}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
  );

  expect(read.status()).toBe(200);
}

/** R-34, R-35: no entry, and the route and the procedure refuse a signed-in person. */
async function placeholderRefused(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/`);
  await expect(
    page.getByRole("link", { name: "Placeholder", exact: true })
  ).toHaveCount(0);

  await page.goto(`${baseUrl}/placeholder`);
  await expect(page.getByTestId("permission-denied")).toBeVisible();

  const read = await page.request.get(
    `${baseUrl}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
  );

  expect(read.status()).toBe(403);
}

test("jit: admitted through a mapped group, a role on another group reaches the person, and removal strips it (AC-20 to AC-24)", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const baseUrl = brokeredBaseUrl();
  const member = scenarioEmail("done", "member", project);
  const noRole = scenarioEmail("done", "norole", project);
  const grantGroup = doneGrantGroup(project);

  // A rerun against the same database starts with the grant group unmapped.
  await queryBrokerDatabase(
    BROKER_DB,
    `delete from role_assignment where principal_type = 'group' and principal_id in (select id::text from "group" where external_id = '${grantGroup}')`
  );

  // AC-20 (jit): the provider assigned the person to the admit group, which an administrator
  // mapped to a role before this sign-in, so the first sign-in creates them active with a session.
  const memberPage = await newPage(browser);

  await signInThroughBroker(memberPage, { baseUrl, email: member });

  expect(await personState(BROKER_DB, member)).toBe("active:jit:1");

  // Before any grant the person sees no module and its route refuses (AC-23 control).
  await placeholderRefused(memberPage, baseUrl);

  // AC-21: the administrator finds the person in People with the groups the token supplied.
  await signInThroughBroker(page, {
    baseUrl,
    email: scenarioEmail("done", "admin", project),
  });
  await page.goto(`${baseUrl}/admin/people`);
  await page.getByLabel("Search people").fill(member);
  await page
    .getByRole("button", { name: new RegExp(member.replaceAll(".", "\\.")) })
    .first()
    .press("Enter");

  const person = page.getByRole("dialog", { name: "E2E Person" });

  await person.getByRole("tab", { name: /^Groups/ }).click();
  await expect(
    person.getByText(doneAdmitGroup(project), { exact: true })
  ).toBeVisible();
  await expect(person.getByText(grantGroup, { exact: true })).toBeVisible();
  await person.getByRole("button", { name: "Close" }).press("Enter");

  // AC-22: the administrator maps the person's other group to the reader role on the Groups
  // screen. The person does nothing further.
  await page.goto(`${baseUrl}/admin/groups`);
  await page
    .getByRole("button", { name: new RegExp(grantGroup) })
    .first()
    .click();

  const group = page.getByRole("dialog", { name: grantGroup });

  await group.getByRole("tab", { name: /^Roles/ }).click();
  await group
    .getByLabel("Role to assign")
    .selectOption({ label: "S2-13 reader" });

  const [assigned] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("groups.assignRole")
    ),
    group.getByRole("button", { name: "Assign role" }).click(),
  ]);

  expect(assigned.status()).toBe(200);

  // AC-22 and AC-23: the role reaches the open session on its next request; the module appears.
  await placeholderVisible(memberPage, baseUrl);

  // AC-23: a person admitted through the same mapped group but not in the granted group does
  // not see the module, and a direct request to its route is refused.
  const noRolePage = await newPage(browser);

  await signInThroughBroker(noRolePage, { baseUrl, email: noRole });
  await placeholderRefused(noRolePage, baseUrl);

  // AC-24 (jit): the provider no longer assigns the person any group. The next sign-in completes
  // and strips every directory membership, so every group-derived role is gone.
  await setRealmUserGroupMemberships(COMPANY_REALM, member, []);
  await memberPage.context().clearCookies();
  await signInThroughBroker(memberPage, { baseUrl, email: member });

  expect(
    await queryBrokerDatabase(
      BROKER_DB,
      `select count(*) from group_member gm join "user" u on u.id = gm.user_id where u.email = '${member}' and gm.source = 'idp'`
    )
  ).toEqual(["0"]);

  await placeholderRefused(memberPage, baseUrl);

  await memberPage.context().close();
  await noRolePage.context().close();
});

test("invite: a pre-added person signs in, an unknown one is refused, and removal at the provider blocks the next sign-in (AC-20, AC-24)", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const baseUrl = inviteBaseUrl();
  const personEmail = scenarioEmail("invite", "person", project);
  const unknown = scenarioEmail("invite", "unknown", project);
  const displayName = `S2-16 Invited ${project}`;

  // AC-20 (invite): the administrator pre-adds the person on the People screen.
  await signInThroughBroker(page, {
    baseUrl,
    email: scenarioEmail("invite", "admin", project),
  });
  await page.goto(`${baseUrl}/admin/people`);
  await page.getByRole("button", { name: "Add person" }).click();

  const addDialog = page.getByRole("dialog", { name: "Add person" });

  await addDialog.getByLabel("Email", { exact: true }).fill(personEmail);
  await addDialog.getByLabel("Display name", { exact: true }).fill(displayName);

  // This deployment has no mail sink; the invitation email is the people spec's subject.
  const invitation = addDialog.getByRole("checkbox", {
    name: "Send invitation email",
  });

  // Keyboard, as the people spec drives this dialog: on the phone sheet a pointer click lands on
  // the scrolling body.
  await invitation.press("Space");
  await expect(invitation).not.toBeChecked();
  await addDialog.getByRole("button", { name: "Add person" }).press("Enter");

  await expect
    .poll(() => personState(INVITE_DB, personEmail), { timeout: 30_000 })
    .toBe("pending:invited:0");

  // The person signs in through the provider, is activated and holds a session.
  const personPage = await newPage(browser);

  await signInThroughBroker(personPage, { baseUrl, email: personEmail });

  expect(await personState(INVITE_DB, personEmail)).toBe("active:invited:1");

  // An unknown person is refused with the not-registered banner and no row (R-9).
  const unknownPage = await newPage(browser);

  await signInThroughBroker(unknownPage, {
    baseUrl,
    email: unknown,
    landing: "/sign-in",
  });

  expect(new URL(unknownPage.url()).searchParams.get("error")).toBe(
    "not_registered"
  );
  await expect(unknownPage.getByTestId("sign-in-banner")).toBeVisible();
  expect(await personState(INVITE_DB, unknown)).toBeUndefined();

  // AC-24 (invite): the provider stops assigning the person. Its login refuses them, so the next
  // sign-in never reaches the application and no second session exists.
  await setRealmUserEnabled(COMPANY_REALM, personEmail, false);

  const blockedPage = await newPage(browser);

  await blockedPage.goto(`${baseUrl}/api/auth/sign-in/keycloak`);
  await blockedPage.locator("#username").fill(personEmail);
  await blockedPage.locator("#password").fill(E2E_USER_PASSWORD);
  await blockedPage.locator("#kc-login").click();

  await expect(blockedPage.getByText(/account is disabled/i)).toBeVisible();
  expect(new URL(blockedPage.url()).origin).not.toBe(new URL(baseUrl).origin);
  expect(await personState(INVITE_DB, personEmail)).toBe("active:invited:1");

  await personPage.context().close();
  await unknownPage.context().close();
  await blockedPage.context().close();
});
