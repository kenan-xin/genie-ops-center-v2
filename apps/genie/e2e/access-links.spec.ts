import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  e2eAccessLinksMemberEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { pickRecipient } from "./support/access.ts";
import { queryDatabase } from "./support/database.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * S2-24 through the real realm and the real database: the navigation entry, the person inspector's
 * Access tab with "Manage in Access", and the Modules link each open Access with their subject
 * chosen. A member without `core:roles:manage` sees none of them, and no Access read is sent.
 *
 * The phone and desktop projects share one database, so the member is scoped to the project, and
 * the setup replaces the member's assignments that an earlier run left.
 */

const memberName = (project: string) => `E2E links member ${project}`;

/** The roles of the reader and the member; idempotent, so every test runs it. */
async function setUp(project: string): Promise<void> {
  const member = e2eAccessLinksMemberEmail(project);
  const reader = e2eReaderEmail("access-links", project);

  await queryDatabase(
    [
      "insert into role (name, permissions, is_system) values ('E2E links settings', array['core:settings:manage'], false) on conflict (name) do nothing",
      "insert into role (name, permissions, is_system) values ('E2E links limited', array['core:people:manage', 'core:settings:manage'], false) on conflict (name) do nothing",
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'E2E links settings' and u.email = '${reader}' on conflict do nothing`,
      `update "user" set name = '${memberName(project)}' where email = '${member}'`,
      // Tests may run in parallel, so the member's one role is never removed and added again.
      `delete from role_assignment a using "user" u, role r where a.principal_type = 'user' and a.principal_id = u.id and u.email = '${member}' and r.id = a.role_id and (r.name <> 'E2E links limited' or a.scope_type is not null)`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'E2E links limited' and u.email = '${member}' and not exists (select 1 from role_assignment a where a.role_id = r.id and a.principal_type = 'user' and a.principal_id = u.id)`,
    ].join("; ")
  );
}

/** Opens a person's inspector from People by searching their name. */
async function openPerson(page: Page, name: string): Promise<Locator> {
  await page.goto("/admin/people");
  await page
    .getByRole("textbox", { name: "Search by name or email" })
    .fill(name);
  // The shell's user menu also carries the member's name, so the row is found in the page.
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(name) })
    .filter({ visible: true })
    .first()
    .click();

  const inspector = page.getByRole("dialog", { name });

  await expect(inspector).toBeVisible();

  return inspector;
}

test("the navigation entry and Manage in Access open Access with the person chosen", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const name = memberName(project);

  await setUp(project);

  const [memberId] = await queryDatabase(
    `select id from "user" where email = '${e2eAccessLinksMemberEmail(project)}'`
  );

  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("access-links", project),
  });

  // E0: the admin entry, in the phone drawer too.
  await page.goto("/admin/people");
  await expect(
    (await openNavigation(page)).getByRole("link", {
      name: "Access",
      exact: true,
    })
  ).toHaveAttribute("href", "/admin/access");

  // E1: the member's Access tab, then Manage in Access.
  const inspector = await openPerson(page, name);

  await inspector.getByRole("tab", { name: /^Access/ }).click();
  await expect(
    inspector.getByText("Core administration · E2E links limited")
  ).toBeVisible();
  await expect(inspector.getByText(/^Direct assignment/)).toBeVisible();
  await inspector.getByRole("button", { name: "Manage in Access" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/admin/access\\?recipient=${memberId}$`)
  );
  await expect(
    page.getByRole("group", { name: "Granted", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "People", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("combobox", { name: "Choose a person" })
  ).toContainText(name);
});

test("the Modules link opens Access with the module staged for the chosen person", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;

  await setUp(project);
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("access-links", project),
  });
  await page.goto("/admin/modules");

  // E2: the phone band, or the desktop link.
  await page
    .getByRole("link", {
      name:
        project === "phone"
          ? /^Who can open it for Placeholder/
          : "Manage in Access for Placeholder",
    })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/access\?module=placeholder$/);
  // The phone band loads Access as a document, and a click before hydration is lost.
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "People", exact: true }).click();
  await pickRecipient(page, "user", e2eAccessLinksMemberEmail(project));

  const granted = page.getByRole("group", { name: "Granted", exact: true });

  await expect(granted).toContainText("Placeholder");
  await expect(granted.getByText("Pending", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Unsaved changes" })
  ).toContainText("1 to add");
});

test("a member without core:roles:manage sees no link into Access and reads no access", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const accessReads: string[] = [];

  await setUp(project);

  page.on("request", (request) => {
    if (request.url().includes("/api/rpc/roles/recipientAccess")) {
      accessReads.push(request.url());
    }
  });

  await signInThroughKeycloak(page, {
    email: e2eAccessLinksMemberEmail(project),
  });

  // E3: no entry, no Modules link, no Access tab and no Manage in Access.
  await page.goto("/admin/modules");
  await expect(
    page
      .getByRole("switch", { name: "Placeholder on" })
      .filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Manage in Access|Who can open it/ })
  ).toHaveCount(0);
  await expect(
    (await openNavigation(page)).getByRole("link", {
      name: "Access",
      exact: true,
    })
  ).toHaveCount(0);

  const inspector = await openPerson(page, memberName(project));

  await expect(inspector.getByRole("tab").first()).toBeVisible();
  await expect(inspector.getByRole("tab", { name: /^Access/ })).toHaveCount(0);
  await expect(
    inspector.getByRole("button", { name: "Manage in Access" })
  ).toHaveCount(0);
  expect(accessReads).toEqual([]);
});
