import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  e2eAccessLinksMemberEmail,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { queryDatabase } from "./support/database.ts";
import { iconCheckSize } from "./support/icon-alignment.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * S2-24 through the real realm and the real database: the navigation entry, the person inspector's
 * Access tab with "Manage in Access", and the Modules link each open Access with their subject
 * chosen. A people manager without `core:roles:manage` sees no link into Access, and reads a
 * person's access read-only through the People read, never the roles read (`d8l5.43`).
 *
 * The phone and desktop projects share one database, so the member is scoped to the project, and
 * the setup replaces the member's assignments that an earlier run left.
 */

const memberName = (project: string) => `E2E links member ${project}`;

const readerName = (project: string) => `E2E links reader ${project}`;

const readersGroup = (project: string) => `E2E links readers ${project}`;

/**
 * The roles of the reader and the member; idempotent, so every test runs it. The reader also holds
 * a role through a local group, so a people manager meets an Assigned via group (C11-7).
 */
async function setUp(project: string): Promise<void> {
  const member = e2eAccessLinksMemberEmail(project);
  const reader = e2eReaderEmail("access-links", project);

  await queryDatabase(
    [
      "insert into role (name, permissions, is_system) values ('E2E links settings', array['core:settings:manage'], false) on conflict (name) do nothing",
      "insert into role (name, permissions, is_system) values ('E2E links limited', array['core:people:manage', 'core:settings:manage'], false) on conflict (name) do nothing",
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'E2E links settings' and u.email = '${reader}' on conflict do nothing`,
      `update "user" set name = '${memberName(project)}' where email = '${member}'`,
      `update "user" set name = '${readerName(project)}' where email = '${reader}'`,
      // Tests may run in parallel, so the member's one role is never removed and added again.
      `delete from role_assignment a using "user" u, role r where a.principal_type = 'user' and a.principal_id = u.id and u.email = '${member}' and r.id = a.role_id and (r.name <> 'E2E links limited' or a.scope_type is not null)`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'E2E links limited' and u.email = '${member}' and not exists (select 1 from role_assignment a where a.role_id = r.id and a.principal_type = 'user' and a.principal_id = u.id)`,
      "insert into role (name, permissions, is_system) values ('E2E links via group', array['core:settings:manage'], false) on conflict (name) do nothing",
      `insert into "group" (id, name, source) values (md5('${readersGroup(project)}')::uuid, '${readersGroup(project)}', 'local') on conflict (id) do nothing`,
      `insert into group_member (group_id, user_id, source) select md5('${readersGroup(project)}')::uuid, u.id, 'local' from "user" u where u.email = '${reader}' on conflict do nothing`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'group', md5('${readersGroup(project)}')::uuid::text from role r where r.name = 'E2E links via group' and not exists (select 1 from role_assignment a where a.role_id = r.id and a.principal_type = 'group' and a.principal_id = md5('${readersGroup(project)}')::uuid::text)`,
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

  await page.setViewportSize(iconCheckSize(project));
  await setUp(project);

  const [memberId] = await queryDatabase(
    `select id from "user" where email = '${e2eAccessLinksMemberEmail(project)}'`
  );

  const [roleId] = await queryDatabase(
    "select id from role where name = 'E2E links limited'"
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

  await inspector.getByRole("tab", { name: /^Roles/ }).click();

  // R-37e: a roles manager gets the role as a link to Roles, with its scope and how it arrived.
  const roles = inspector.getByRole(project === "phone" ? "list" : "table", {
    name: "Assigned roles",
  });

  await expect(
    roles.getByRole("link", { name: "E2E links limited" })
  ).toHaveAttribute("href", `/admin/roles?selected=${roleId}`);
  await expect(roles).toContainText("All records");
  await expect(roles).toContainText("Direct");
  await expectNoAxeViolations(page, "Person sheet, Roles tab");
  await inspector.getByRole("button", { name: "Manage in Access" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/admin/access\\?recipient=${memberId}$`)
  );
  await expectRecipientChosen(page, "People", name);
  await page.reload();
  await expect(page).toHaveURL(
    new RegExp(`/admin/access\\?recipient=${memberId}$`)
  );
  await expectRecipientChosen(page, "People", name);
});

/** Grants with the recipient's segment pressed and the recipient in its picker. */
async function expectRecipientChosen(
  page: Page,
  segment: "People" | "Groups",
  name: string
): Promise<void> {
  await expect(
    page.getByRole("group", { name: "Granted", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: segment, exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("combobox", {
      name: segment === "People" ? "Choose a person" : "Choose a group",
    })
  ).toContainText(name);
}

test("the Groups link opens Grants with the group chosen", async ({
  page,
}, testInfo) => {
  const group = "Genie Administrators";

  const [groupId] = await queryDatabase(
    `select id from "group" where name = '${group}'`
  );

  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("access-links", testInfo.project.name),
  });
  await page.goto("/admin/groups");
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(`^${group}`) })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: group, exact: true })
    .getByRole("button", { name: "Manage in Access" })
    .click();

  const address = new RegExp(`/admin/access\\?recipient=${groupId}$`);

  await expect(page).toHaveURL(address);
  await expectRecipientChosen(page, "Groups", group);
  await page.reload();
  await expect(page).toHaveURL(address);
  await expectRecipientChosen(page, "Groups", group);
});

test("the Modules link opens the Overview with the module chosen", async ({
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
          ? /^Assigned to Placeholder/
          : "Manage in Access for Placeholder",
    })
    .filter({ visible: true })
    .click();

  // d8l5.46: a link with no recipient lands on the Overview, and a reload keeps the module.
  await expectModuleChosen(page);
  await page.reload();
  await expectModuleChosen(page);
});

test("the Roles link opens the Overview with the role chosen", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;

  await setUp(project);

  const [roleId] = await queryDatabase(
    "select id from role where name = 'E2E links limited'"
  );

  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("access-links", project),
  });
  await page.goto("/admin/roles");
  await page
    .getByRole("button", { name: /^E2E links limited\b/ })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Manage in Access" }).click();

  // d8l5.46: a role is no recipient, so the link lands on the Overview by role, also after a reload.
  await expectRoleChosen(page, roleId, memberName(project));
  await page.reload();
  await expectRoleChosen(page, roleId, memberName(project));
});

async function expectRoleChosen(
  page: Page,
  roleId: string | undefined,
  holder: string
): Promise<void> {
  await expect(page).toHaveURL(
    new RegExp(`/admin/access/overview\\?role=${roleId}$`)
  );
  await expect(page.getByRole("button", { name: "By role" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(
    page.getByRole("combobox", { name: "Choose a role" })
  ).toContainText("E2E links limited");
  await expect(
    page
      .getByRole("region", { name: "Results" })
      .getByText(holder)
      .filter({ visible: true })
      .first()
  ).toBeVisible();
}

test("an unknown role link shows the empty Overview", async ({
  page,
}, testInfo) => {
  const reads: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/rpc/roles/accessBySubject")) {
      reads.push(request.url());
    }
  });

  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("access-links", testInfo.project.name),
  });

  // The link is checked against the roles list, so the test waits for that list before it counts.
  const listed = page.waitForResponse((answer) =>
    answer.url().includes("/api/rpc/roles/list")
  );

  await page.goto("/admin/access/overview?role=not-a-role");
  await listed;
  await expect(
    page.getByRole("heading", { name: "Choose what to look up" })
  ).toBeVisible();
  expect(reads).toEqual([]);
});

async function expectModuleChosen(page: Page): Promise<void> {
  await expect(page).toHaveURL(
    /\/admin\/access\/overview\?module=placeholder$/
  );
  await expect(page.getByRole("button", { name: "By module" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(
    page.getByRole("status").filter({ hasText: /assigned to Placeholder/ })
  ).toBeVisible();
}

test("a people manager reads a person's access read-only", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const rolesReads: string[] = [];
  const personReads: string[] = [];

  await page.setViewportSize(iconCheckSize(project));
  await setUp(project);

  page.on("request", (request) => {
    if (request.url().includes("/api/rpc/roles/recipientAccess")) {
      rolesReads.push(request.url());
    }

    if (request.url().includes("/api/rpc/people/access")) {
      personReads.push(request.url());
    }
  });

  await signInThroughKeycloak(page, {
    email: e2eAccessLinksMemberEmail(project),
  });

  // E3, d8l5.43: no entry and no Modules link; the Access tab reads, with no Manage in Access.
  await page.goto("/admin/modules");
  await expect(
    page
      .getByRole("switch", { name: "Placeholder on" })
      .filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Manage in Access|Assigned to/ })
  ).toHaveCount(0);
  await expect(
    (await openNavigation(page)).getByRole("link", {
      name: "Access",
      exact: true,
    })
  ).toHaveCount(0);

  const inspector = await openPerson(page, memberName(project));

  await inspector.getByRole("tab", { name: /^Roles/ }).click();
  await expect(
    inspector
      .getByText("E2E links limited", { exact: true })
      .filter({ visible: true })
      .first()
  ).toBeVisible();
  // The member manages people and opens their own record, so the sheet shows the lock line and
  // offers no change (d8l5.61, R-38); with no Roles key the role is plain text too.
  await expect(
    inspector.getByText(
      "Only another administrator can change your own account."
    )
  ).toBeVisible();
  await expect(
    inspector.getByRole("link", { name: "E2E links limited" })
  ).toHaveCount(0);
  await expect(
    inspector.getByRole("button", { name: "Manage in Access" })
  ).toHaveCount(0);

  // P11-33: another person's record shows the read-only line and no link into Roles, so the link
  // the Roles page refuses never renders, through the real People read (R-37e).
  const other = await openPerson(page, readerName(project));

  await other.getByRole("tab", { name: /^Roles/ }).click();

  const otherRoles = other.getByRole(project === "phone" ? "list" : "table", {
    name: "Assigned roles",
  });

  await expect(other.getByText("View only")).toBeVisible();
  await expect(
    otherRoles.getByText("E2E links settings", { exact: true })
  ).toBeVisible();
  // C11-7: a people manager cannot open Groups, so the group a role comes through is plain text.
  await expect(otherRoles).toContainText(`${readersGroup(project)} (group)`);
  await expect(
    otherRoles.getByRole("button", { name: readersGroup(project) })
  ).toHaveCount(0);
  await expect(otherRoles.getByRole("link")).toHaveCount(0);
  await expectNoAxeViolations(page, "Person sheet, Roles tab, view only");

  expect(rolesReads).toEqual([]);
  expect(personReads.length).toBeGreaterThan(0);
});
