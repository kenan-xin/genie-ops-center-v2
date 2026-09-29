import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createGroupsRouter,
  createRolesRouter,
  principalFor,
  removeAssignment,
  type ModuleHistorySource,
  type RequestPrincipal,
  syncGroupMemberships,
  can,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../src/lib/module-contract/system-roles.ts";
import {
  auditEvent,
  group,
  groupMember,
  notification,
  role as roleTable,
  roleAssignment,
} from "../src/schema.ts";
import {
  enableModules,
  insertGroup,
  insertPersonWith,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * S2-11 against a real Postgres with the real core history. Nothing is mocked (R-38): every
 * principal reads real `role_assignment` rows through the real loader, and every group, role and
 * assignment write goes through the shipped service or router.
 *
 * The compiled-module list is a local fixture, because core imports no module (R-39). It declares
 * one key so a role can grant through a group without reaching a module.
 */
const fixtureModule: Pick<
  Module,
  "identity" | "permissions" | "recordTypes" | "defaultRoles"
> = {
  identity: { id: "fixture", displayName: "Fixture", version: "0.0.0" },
  permissions: [
    { key: "fixture:use", label: "Use the fixture" },
    { key: "fixture:admin", label: "Administer the fixture" },
  ],
  recordTypes: [],
  defaultRoles: [],
};

/** A compiled module whose entitlement stays off, so its keys are not selectable (R-33a). */
const dormantModule: Pick<
  Module,
  "identity" | "permissions" | "recordTypes" | "defaultRoles"
> = {
  identity: { id: "dormant", displayName: "Dormant", version: "0.0.0" },
  permissions: [{ key: "dormant:use", label: "Use the dormant module" }],
  recordTypes: [],
  defaultRoles: [],
};

/** A second compiled module, enabled mid-suite to prove a copy is allowed once it is on. */
const enableLaterModule: Pick<
  Module,
  "identity" | "permissions" | "recordTypes" | "defaultRoles"
> = {
  identity: {
    id: "enablelater",
    displayName: "Enable later",
    version: "0.0.0",
  },
  permissions: [{ key: "enablelater:use", label: "Use the later module" }],
  recordTypes: [],
  defaultRoles: [],
};

const modules = [fixtureModule, dormantModule, enableLaterModule];

/** A history source per compiled module, so the deployment's entitlement reader knows both ids. */
const historySources: ModuleHistorySource[] = modules.map((module) => ({
  identity: module.identity,
  schema: {
    migrations: () => [],
    migrationsTable: `__drizzle_migrations_${module.identity.id}`,
  },
}));

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** The tenant administrator role row, shared by the suites. */
let adminRoleId: string;

/** One direct active administrator, so the guard has a baseline in the groups suite. */
let baselineAdminId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment(historySources);

  // The fixture module is entitled; the dormant one is not (R-33a).
  await enableModules(deployment.context, ["fixture"]);

  const [roleRow] = await deployment.context.db
    .insert(roleTable)
    .values({
      name: TENANT_ADMINISTRATOR_ROLE,
      permissions: ["core:groups:manage", "core:roles:manage"],
      isSystem: true,
    })
    .returning({ id: roleTable.id });

  if (roleRow === undefined) throw new Error("no tenant administrator role");

  adminRoleId = roleRow.id;
  baselineAdminId = await insertUser(deployment.context);

  await deployment.context.db.insert(roleAssignment).values({
    roleId: adminRoleId,
    principalType: "user",
    principalId: baselineAdminId,
  });
}, 180000);

afterAll(async () => {
  await deployment?.stop();
});

function request(userId: string | undefined): RequestPrincipal {
  return principalFor({
    tenant: deployment.context,
    modules,
    userId,
    // The explicit session flag (R-14): a caller with a user id is signed in, an anonymous one is
    // not. The two are supplied separately, so no sentinel user id can stand for "no session".
    authenticated: userId !== undefined,
  });
}

const groupsRouter = () =>
  createGroupsRouter().createCaller({
    tenant: deployment.context,
    caller: request(undefined),
  });

function groupsCaller(userId: string) {
  return createGroupsRouter().createCaller({
    tenant: deployment.context,
    caller: request(userId),
  });
}

function rolesCaller(userId: string) {
  return createRolesRouter(modules).createCaller({
    tenant: deployment.context,
    caller: request(userId),
  });
}

/** A person holding `core:groups:manage` and `core:roles:manage`, the admin screen caller. */
async function insertManager(): Promise<string> {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:groups:manage",
    "core:roles:manage",
  ]);

  return userId;
}

/** The Tenant administrator system role id, as the `roles` setup step seeds it (R-33). */

async function auditActions(): Promise<readonly string[]> {
  const rows = await deployment.context.db
    .select({ action: auditEvent.action })
    .from(auditEvent);

  return rows.map((row) => row.action);
}

describe("the groups router against a real database", () => {
  it("refuses an anonymous caller and a member without core:groups:manage", async () => {
    const anonymous = groupsRouter();

    // No session: the catalogue `unauthenticated` (R-14) is raised before the permission gate.
    await expect(
      anonymous.list({ includeArchived: false })
    ).rejects.toMatchObject({ cause: { code: "unauthenticated" } });

    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
    ]);

    const member = groupsCaller(userId);

    await expect(member.list({ includeArchived: false })).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      }
    );
  });

  it("adds a directory group by claim value with a null last_seen_at and a catalogue audit row", async () => {
    const actor = await insertManager();

    const { id } = await groupsCaller(actor).addDirectoryGroup({
      externalId: "Finance-Managers",
      displayLabel: "Finance managers",
    });

    const [row] = await deployment.context.db
      .select()
      .from(group)
      .where(eq(group.id, id));

    expect(row?.source).toBe("idp");
    expect(row?.externalId).toBe("Finance-Managers");
    expect(row?.lastSeenAt).toBeNull();
    expect(row?.displayLabel).toBe("Finance managers");

    expect(await auditActions()).toContain("core:directory_group_added");
  });

  it("refuses a second directory group with the same exact claim value", async () => {
    const actor = await insertManager();

    await groupsCaller(actor).addDirectoryGroup({ externalId: "Sales" });

    await expect(
      groupsCaller(actor).addDirectoryGroup({ externalId: "Sales" })
    ).rejects.toMatchObject({ cause: { code: "directory-group-exists" } });
  });

  it("deletes a not-yet-seen directory group and refuses a seen one with group-seen", async () => {
    const actor = await insertManager();

    const fresh = await groupsCaller(actor).addDirectoryGroup({
      externalId: "Contractors",
    });

    await groupsCaller(actor).deleteDirectoryGroup({ groupId: fresh.id });

    expect(
      await deployment.context.db
        .select()
        .from(group)
        .where(eq(group.id, fresh.id))
    ).toEqual([]);
    expect(await auditActions()).toContain("core:directory_group_deleted");

    // A seen group can only be archived.
    const seen = await insertGroup(deployment.context, [], {
      source: "idp",
      externalId: "Seen",
      name: "Seen",
      lastSeenAt: new Date(),
    });

    await expect(
      groupsCaller(actor).deleteDirectoryGroup({ groupId: seen })
    ).rejects.toMatchObject({ cause: { code: "group-seen" } });
  });

  it("archives a directory group so its assignments stop granting while the rows stay", async () => {
    const grantRole = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    const member = await insertUser(deployment.context);

    const groupId = await insertGroup(deployment.context, [member], {
      source: "idp",
      externalId: "Granting",
      name: "Granting",
      lastSeenAt: new Date(),
    });

    await deployment.context.db.insert(roleAssignment).values({
      roleId: grantRole,
      principalType: "group",
      principalId: groupId,
    });

    const caller = request(member);
    expect(await can(caller, "fixture:use")).toBe(true);

    const actor = await insertManager();
    await groupsCaller(actor).archiveDirectoryGroup({ groupId });

    // A fresh principal per request (DEC-48): the archive applies on the next one.
    expect(await can(request(member), "fixture:use")).toBe(false);

    const assignments = await deployment.context.db
      .select()
      .from(roleAssignment)
      .where(eq(roleAssignment.principalId, groupId));

    expect(assignments).toHaveLength(1);

    expect(await auditActions()).toContain("core:group_archived");
  });

  it("hides archived groups unless the caller asks for them", async () => {
    const actor = await insertManager();
    await groupsCaller(actor).addDirectoryGroup({ externalId: "Hidden" });

    const [row] = await deployment.context.db
      .select()
      .from(group)
      .where(eq(group.externalId, "Hidden"));

    await deployment.context.db
      .update(group)
      .set({ archivedAt: new Date() })
      .where(eq(group.id, row!.id));

    const visible = await groupsCaller(actor).list({ includeArchived: false });
    const all = await groupsCaller(actor).list({ includeArchived: true });

    expect(visible.some((entry) => entry.id === row!.id)).toBe(false);
    expect(all.some((entry) => entry.id === row!.id)).toBe(true);
  });

  it("shows a display label in lists while matching only the external id", async () => {
    const actor = await insertManager();
    await groupsCaller(actor).addDirectoryGroup({
      externalId: "0a1b-object-id",
      displayLabel: "Finance",
    });

    const listed = await groupsCaller(actor).list({ includeArchived: true });

    const labeled = listed.find(
      (entry) => entry.externalId === "0a1b-object-id"
    );

    expect(labeled?.displayLabel).toBe("Finance");

    // A sign-in whose claim equals the label but not the value matches a different group (R-24c).
    const person = await insertUser(deployment.context);
    await syncGroupMemberships(deployment.context, person, ["Finance"]);

    const memberships = await deployment.context.db
      .select({ groupId: groupMember.groupId })
      .from(groupMember)
      .where(eq(groupMember.userId, person));

    const joined = await deployment.context.db
      .select({ id: group.id, externalId: group.externalId })
      .from(group)
      .where(eq(group.id, memberships[0]!.groupId));

    expect(joined[0]?.externalId).toBe("Finance");
    expect(joined[0]?.id).not.toBe(labeled?.id);
  });

  it("edits and clears a directory group label with a catalogue audit row", async () => {
    const actor = await insertManager();

    const { id } = await groupsCaller(actor).addDirectoryGroup({
      externalId: "Label-target",
    });

    await groupsCaller(actor).editLabel({
      groupId: id,
      displayLabel: "Readable",
    });

    let [row] = await deployment.context.db
      .select()
      .from(group)
      .where(eq(group.id, id));

    expect(row?.displayLabel).toBe("Readable");

    await groupsCaller(actor).editLabel({ groupId: id, displayLabel: null });

    [row] = await deployment.context.db
      .select()
      .from(group)
      .where(eq(group.id, id));
    expect(row?.displayLabel).toBeNull();
    expect(await auditActions()).toContain("core:group_label_changed");
  });

  it("names both counts a local group delete takes with it", async () => {
    const actor = await insertManager();
    const member = await insertUser(deployment.context);

    const roleId = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    const { id } = await groupsCaller(actor).createLocalGroup({
      name: "Local team",
      description: "A local group",
    });

    await groupsCaller(actor).addMembers({ groupId: id, userIds: [member] });
    await deployment.context.db
      .insert(roleAssignment)
      .values({ roleId, principalType: "group", principalId: id });

    const detail = await groupsCaller(actor).get({ groupId: id });
    expect(detail.memberCount).toBe(1);
    expect(detail.assignmentCount).toBe(1);

    await groupsCaller(actor).deleteLocalGroup({ groupId: id });

    expect(
      await deployment.context.db.select().from(group).where(eq(group.id, id))
    ).toEqual([]);
    expect(
      await deployment.context.db
        .select()
        .from(groupMember)
        .where(eq(groupMember.groupId, id))
    ).toEqual([]);
    expect(await auditActions()).toContain("core:local_group_deleted");
  });

  it("removes one member and all members, each with its own catalogue action", async () => {
    const actor = await insertManager();
    const one = await insertUser(deployment.context);
    const two = await insertUser(deployment.context);

    const { id } = await groupsCaller(actor).createLocalGroup({
      name: "Roster",
    });

    await groupsCaller(actor).addMembers({ groupId: id, userIds: [one, two] });

    await groupsCaller(actor).removeMembers({ groupId: id, userIds: [one] });
    expect(
      await deployment.context.db
        .select()
        .from(groupMember)
        .where(eq(groupMember.groupId, id))
    ).toHaveLength(1);

    await groupsCaller(actor).removeAllMembers({ groupId: id });
    expect(
      await deployment.context.db
        .select()
        .from(groupMember)
        .where(eq(groupMember.groupId, id))
    ).toEqual([]);

    const actions = await auditActions();
    expect(actions).toContain("core:group_member_removed");
    expect(actions).toContain("core:group_members_removed");
  });
});

describe("the R-38 self-protection rule", () => {
  // Each case starts from zero tenant administrators, so its own writes decide the count.
  beforeEach(async () => {
    await deployment.context.db
      .delete(roleAssignment)
      .where(eq(roleAssignment.roleId, adminRoleId));
  });

  it("refuses deleting a local group that is the last active administrator path", async () => {
    const admin = await insertUser(deployment.context);
    const groupId = await insertGroup(deployment.context, [admin]);

    await deployment.context.db.insert(roleAssignment).values({
      roleId: adminRoleId,
      principalType: "group",
      principalId: groupId,
    });

    const actor = await insertManager();

    await expect(
      groupsCaller(actor).deleteLocalGroup({ groupId })
    ).rejects.toMatchObject({ cause: { code: "last-administrator" } });

    // The transaction rolled back: the group and its membership are still there.
    expect(
      await deployment.context.db
        .select()
        .from(group)
        .where(eq(group.id, groupId))
    ).toHaveLength(1);
  });

  it("refuses removing the last administrator's membership and removing all members", async () => {
    const admin = await insertUser(deployment.context);
    const groupId = await insertGroup(deployment.context, [admin]);

    await deployment.context.db.insert(roleAssignment).values({
      roleId: adminRoleId,
      principalType: "group",
      principalId: groupId,
    });

    const actor = await insertManager();

    await expect(
      groupsCaller(actor).removeMembers({ groupId, userIds: [admin] })
    ).rejects.toMatchObject({ cause: { code: "last-administrator" } });

    await expect(
      groupsCaller(actor).removeAllMembers({ groupId })
    ).rejects.toMatchObject({ cause: { code: "last-administrator" } });
  });

  it("refuses archiving a directory group that is the last administrator path", async () => {
    const admin = await insertUser(deployment.context);

    const groupId = await insertGroup(deployment.context, [admin], {
      source: "idp",
      externalId: "Admin group",
      name: "Admin group",
      lastSeenAt: new Date(),
    });

    await deployment.context.db.insert(roleAssignment).values({
      roleId: adminRoleId,
      principalType: "group",
      principalId: groupId,
    });

    const actor = await insertManager();

    await expect(
      groupsCaller(actor).archiveDirectoryGroup({ groupId })
    ).rejects.toMatchObject({ cause: { code: "last-administrator" } });
  });

  it("allows the same removal once a second active administrator exists", async () => {
    const first = await insertUser(deployment.context);
    const second = await insertUser(deployment.context);
    const groupId = await insertGroup(deployment.context, [first]);

    await deployment.context.db.insert(roleAssignment).values([
      { roleId: adminRoleId, principalType: "group", principalId: groupId },
      { roleId: adminRoleId, principalType: "user", principalId: second },
    ]);

    const actor = await insertManager();

    await groupsCaller(actor).deleteLocalGroup({ groupId });

    expect(
      await deployment.context.db
        .select()
        .from(group)
        .where(eq(group.id, groupId))
    ).toEqual([]);
  });

  it("refuses a solo administrator removing their own direct administrator grant", async () => {
    const admin = await insertUser(deployment.context);

    const [assignment] = await deployment.context.db
      .insert(roleAssignment)
      .values({
        roleId: adminRoleId,
        principalType: "user",
        principalId: admin,
      })
      .returning({ id: roleAssignment.id });

    await expect(
      removeAssignment({
        tenant: deployment.context,
        actorUserId: admin,
        assignmentId: assignment!.id,
      })
    ).rejects.toMatchObject({ code: "self-protection" });
  });

  it("refuses another administrator's removal of the last administrator grant", async () => {
    const admin = await insertUser(deployment.context);

    const [assignment] = await deployment.context.db
      .insert(roleAssignment)
      .values({
        roleId: adminRoleId,
        principalType: "user",
        principalId: admin,
      })
      .returning({ id: roleAssignment.id });

    const other = await insertUser(deployment.context);

    await expect(
      removeAssignment({
        tenant: deployment.context,
        actorUserId: other,
        assignmentId: assignment!.id,
      })
    ).rejects.toMatchObject({ code: "last-administrator" });
  });
});

describe("the roles router against a real database", () => {
  it("refuses a caller without core:roles:manage", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
    ]);

    await expect(rolesCaller(userId).list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("creates, updates and deletes a custom role with catalogue audit rows", async () => {
    const actor = await insertManager();

    const { id } = await rolesCaller(actor).create({
      name: "Fixture reader",
      description: "Reads the fixture",
      permissions: ["fixture:use"],
    });

    await rolesCaller(actor).update({
      roleId: id,
      name: "Fixture reader v2",
      description: "Reads the fixture",
      permissions: ["fixture:use", "fixture:admin"],
    });

    const detail = await rolesCaller(actor).get({ roleId: id });
    expect(detail.kind).toBe("custom");
    expect(detail.permissions).toEqual(["fixture:use", "fixture:admin"]);

    await rolesCaller(actor).remove({ roleId: id });
    expect(
      await deployment.context.db
        .select()
        .from(roleTable)
        .where(eq(roleTable.id, id))
    ).toEqual([]);

    const actions = await auditActions();
    expect(actions).toContain("core:role_created");
    expect(actions).toContain("core:role_updated");
    expect(actions).toContain("core:role_deleted");
  });

  it("refuses editing or deleting a system role and refuses a duplicate name", async () => {
    const actor = await insertManager();

    await expect(
      rolesCaller(actor).update({
        roleId: adminRoleId,
        name: "Tenant administrator",
        permissions: ["core:roles:manage"],
      })
    ).rejects.toMatchObject({ cause: { code: "system-role" } });

    await expect(
      rolesCaller(actor).remove({ roleId: adminRoleId })
    ).rejects.toMatchObject({ cause: { code: "system-role" } });

    await rolesCaller(actor).create({ name: "Unique name", permissions: [] });

    await expect(
      rolesCaller(actor).create({ name: "Unique name", permissions: [] })
    ).rejects.toMatchObject({ cause: { code: "role-name-taken" } });
  });

  it("copies a system role into an independent custom role", async () => {
    const actor = await insertManager();

    const { id } = await rolesCaller(actor).copy({
      roleId: adminRoleId,
      name: "Administrator copy",
    });

    const copy = await rolesCaller(actor).get({ roleId: id });
    expect(copy.kind).toBe("custom");
    expect([...copy.permissions].toSorted()).toEqual([
      "core:groups:manage",
      "core:roles:manage",
    ]);

    // The source is untouched: a copy never edits the system role.
    const source = await rolesCaller(actor).get({ roleId: adminRoleId });
    expect(source.kind).toBe("system");
  });

  it("shows an unavailable key and permits removing it from a custom role (R-33b)", async () => {
    const actor = await insertManager();

    const budget = await insertRole(deployment.context, {
      name: `Budget ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    // A retired key stored on the custom role, as a release would leave it.
    await deployment.context.db
      .update(roleTable)
      .set({ permissions: ["fixture:use", "retired:key"] })
      .where(eq(roleTable.id, budget));

    const detail = await rolesCaller(actor).get({ roleId: budget });

    expect(detail.unavailableKeys).toContainEqual({
      key: "retired:key",
      reason: "retired",
    });

    const retiredGroup = detail.permissionGroups.find((entry) =>
      entry.keys.some((key) => key.key === "retired:key")
    );

    expect(
      retiredGroup?.keys.find((key) => key.key === "retired:key")?.unavailable
    ).toBe(true);

    // The unavailable key grants nothing, while the valid key of the same role still does.
    const holder = await insertUser(deployment.context);
    await deployment.context.db
      .insert(roleAssignment)
      .values({ roleId: budget, principalType: "user", principalId: holder });
    expect(await can(request(holder), "fixture:use")).toBe(true);

    // Removing it leaves the role, its assignment and the valid key in place.
    await rolesCaller(actor).update({
      roleId: budget,
      name: `Budget ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    const after = await rolesCaller(actor).get({ roleId: budget });
    expect(after.unavailableKeys).toEqual([]);
    expect(
      await deployment.context.db
        .select()
        .from(roleAssignment)
        .where(eq(roleAssignment.roleId, budget))
    ).toHaveLength(1);
  });

  it("refuses creating a role with a key outside the catalogue", async () => {
    const actor = await insertManager();

    await expect(
      rolesCaller(actor).create({ name: "Bogus", permissions: ["nope:nope"] })
    ).rejects.toMatchObject({ cause: { code: "invalid-input" } });
  });
});

describe("the role-assignment service", () => {
  it("grants to a person, emits core:role:granted and writes an in-app notification", async () => {
    const actor = await insertManager();
    const person = await insertUser(deployment.context);

    const roleId = await insertRole(deployment.context, {
      name: `Grant ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    const { id } = await rolesCaller(actor).assign({
      roleId,
      principalType: "user",
      principalId: person,
    });

    const notifications = await deployment.context.db
      .select()
      .from(notification)
      .where(eq(notification.userId, person));

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.kind).toBe("role-granted");

    expect(await auditActions()).toContain("core:role_assignment_added");

    // The person can now use the fixture through the granted role.
    expect(await can(request(person), "fixture:use")).toBe(true);

    await removeAssignment({
      tenant: deployment.context,
      actorUserId: actor,
      assignmentId: id,
    });

    const removed = await deployment.context.db
      .select()
      .from(notification)
      .where(eq(notification.userId, person));

    expect(removed.some((row) => row.kind === "role-removed")).toBe(true);
    expect(await auditActions()).toContain("core:role_assignment_removed");
    expect(await can(request(person), "fixture:use")).toBe(false);
  });

  it("fans a group grant out to its members", async () => {
    const actor = await insertManager();
    const member = await insertUser(deployment.context);
    const groupId = await insertGroup(deployment.context, [member]);

    const roleId = await insertRole(deployment.context, {
      name: `Group grant ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    await rolesCaller(actor).assign({
      roleId,
      principalType: "group",
      principalId: groupId,
    });

    const notifications = await deployment.context.db
      .select()
      .from(notification)
      .where(eq(notification.userId, member));

    expect(notifications.some((row) => row.kind === "role-granted")).toBe(true);
  });

  it("refuses a half scope through the router's schema", async () => {
    const actor = await insertManager();
    const person = await insertUser(deployment.context);

    const roleId = await insertRole(deployment.context, {
      name: `Scope ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    await expect(
      rolesCaller(actor).assign({
        roleId,
        principalType: "user",
        principalId: person,
        scope: { scopeType: "fixture-record", scopeId: null },
      })
    ).rejects.toThrow();
  });
});

describe("the review fixes", () => {
  it("stores the pre-added claim value exactly, including surrounding whitespace", async () => {
    const actor = await insertManager();

    const { id } = await groupsCaller(actor).addDirectoryGroup({
      externalId: " Padded ",
    });

    const [row] = await deployment.context.db
      .select()
      .from(group)
      .where(eq(group.id, id));

    // The provider's claim is matched exactly, so the pre-added row keeps the exact bytes.
    expect(row?.externalId).toBe(" Padded ");

    // An empty value is refused; the router's schema rejects it as invalid input.
    await expect(
      groupsCaller(actor).addDirectoryGroup({ externalId: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps an unavailable key through an unrelated edit and removes one of two", async () => {
    const actor = await insertManager();

    const budget = await insertRole(deployment.context, {
      name: `Two retired ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    await deployment.context.db
      .update(roleTable)
      .set({ permissions: ["fixture:use", "retired:one", "retired:two"] })
      .where(eq(roleTable.id, budget));

    const [row] = await deployment.context.db
      .select({ name: roleTable.name })
      .from(roleTable)
      .where(eq(roleTable.id, budget));

    // An edit that keeps both unavailable keys is allowed.
    await rolesCaller(actor).update({
      roleId: budget,
      name: row!.name,
      permissions: ["fixture:use", "retired:one", "retired:two"],
    });

    // Removing one leaves the other, without deleting the role.
    await rolesCaller(actor).update({
      roleId: budget,
      name: row!.name,
      permissions: ["fixture:use", "retired:two"],
    });

    const [after] = await deployment.context.db
      .select({ permissions: roleTable.permissions })
      .from(roleTable)
      .where(eq(roleTable.id, budget));

    expect([...after!.permissions].toSorted()).toEqual([
      "fixture:use",
      "retired:two",
    ]);
  });

  it("updates one row on a same-name edit and on a rename", async () => {
    const actor = await insertManager();

    const { id } = await rolesCaller(actor).create({
      name: `Stable name ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    const [created] = await deployment.context.db
      .select({ name: roleTable.name })
      .from(roleTable)
      .where(eq(roleTable.id, id));

    await rolesCaller(actor).update({
      roleId: id,
      name: created!.name,
      permissions: ["fixture:use", "fixture:admin"],
    });

    await rolesCaller(actor).update({
      roleId: id,
      name: `${created!.name} renamed`,
      permissions: ["fixture:use"],
    });

    const rows = await deployment.context.db
      .select({ id: roleTable.id, name: roleTable.name })
      .from(roleTable)
      .where(eq(roleTable.id, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe(`${created!.name} renamed`);
  });

  it("offers the declared catalogue to the role form", async () => {
    const actor = await insertManager();

    const catalogue = await rolesCaller(actor).catalogue();
    const keys = catalogue.flatMap((entry) => entry.keys.map((key) => key.key));

    expect(keys).toContain("core:groups:manage");
    expect(keys).toContain("core:roles:manage");
    expect(keys).toContain("fixture:use");
    // A disabled module's keys are not offered (R-33a).
    expect(keys).not.toContain("dormant:use");
  });

  it("refuses a new key of a disabled module", async () => {
    const actor = await insertManager();

    await expect(
      rolesCaller(actor).create({
        name: `Dormant grant ${Date.now()}`,
        permissions: ["dormant:use"],
      })
    ).rejects.toMatchObject({ cause: { code: "invalid-input" } });
  });

  it("refuses grant writes for a caller holding only core:groups:manage", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "core:groups:manage",
    ]);

    const caller = groupsCaller(userId);
    const groupId = await insertGroup(deployment.context, []);

    const roleId = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    await expect(caller.assignRole({ groupId, roleId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const assignmentId = (
      await deployment.context.db
        .insert(roleAssignment)
        .values({ roleId, principalType: "group", principalId: groupId })
        .returning({ id: roleAssignment.id })
    )[0]!.id;

    await expect(
      caller.unassign({ groupId, assignmentId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses removing an assignment that is not the edited group's", async () => {
    const actor = await insertManager();
    const groupA = await insertGroup(deployment.context, []);
    const groupB = await insertGroup(deployment.context, []);

    const roleId = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    const { id: assignmentId } = await groupsCaller(actor).assignRole({
      groupId: groupA,
      roleId,
    });

    // Another group's id for this assignment is refused, and the row stays.
    await expect(
      groupsCaller(actor).unassign({ groupId: groupB, assignmentId })
    ).rejects.toMatchObject({ cause: { code: "not-found" } });

    // A person's direct assignment id is refused the same way.
    const person = await insertUser(deployment.context);

    const directId = (
      await deployment.context.db
        .insert(roleAssignment)
        .values({ roleId, principalType: "user", principalId: person })
        .returning({ id: roleAssignment.id })
    )[0]!.id;

    await expect(
      groupsCaller(actor).unassign({ groupId: groupA, assignmentId: directId })
    ).rejects.toMatchObject({ cause: { code: "not-found" } });

    expect(
      await deployment.context.db
        .select()
        .from(roleAssignment)
        .where(eq(roleAssignment.id, assignmentId))
    ).toHaveLength(1);
  });

  it("lists active non-break-glass people for the member picker", async () => {
    const actor = await insertManager();
    const active = await insertUser(deployment.context);
    const banned = await insertUser(deployment.context, { banned: true });

    const breakGlass = await insertUser(deployment.context, {
      isBreakGlass: true,
    });

    const people = await groupsCaller(actor).people();
    const ids = people.map((person) => person.id);

    expect(ids).toContain(active);
    expect(ids).not.toContain(banned);
    expect(ids).not.toContain(breakGlass);
  });

  it("assigns and removes a role from the group inspector through the shared service", async () => {
    const actor = await insertManager();

    const roleId = await insertRole(deployment.context, {
      name: `Inspector role ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    const groupId = await insertGroup(deployment.context, [], {
      source: "idp",
      externalId: `inspector-${Date.now()}`,
      name: "inspector",
    });

    const { id: assignmentId } = await groupsCaller(actor).assignRole({
      groupId,
      roleId,
    });

    expect(
      await deployment.context.db
        .select()
        .from(roleAssignment)
        .where(eq(roleAssignment.id, assignmentId))
    ).toHaveLength(1);

    await groupsCaller(actor).unassign({ groupId, assignmentId });

    expect(
      await deployment.context.db
        .select()
        .from(roleAssignment)
        .where(eq(roleAssignment.id, assignmentId))
    ).toEqual([]);
  });
});

describe("the entitlement filter on roles", () => {
  it("refuses copying a role that holds a disabled module's key, and allows it after enable", async () => {
    const actor = await insertManager();

    const source = await insertRole(deployment.context, {
      name: `Later source ${Date.now()}`,
      permissions: ["enablelater:use"],
    });

    // A copy is a new role: its keys must be in the entitled catalogue, so a dormant key is refused.
    await expect(
      rolesCaller(actor).copy({ roleId: source, name: `Copy ${Date.now()}` })
    ).rejects.toMatchObject({ cause: { code: "invalid-input" } });

    // Enabling the module makes the same copy allowed (the entitlement reader caches for 10 s).
    await enableModules(deployment.context, ["enablelater"]);
    await new Promise((settle) => setTimeout(settle, 10_500));

    const { id } = await rolesCaller(actor).copy({
      roleId: source,
      name: `Copy after enable ${Date.now()}`,
    });

    const [row] = await deployment.context.db
      .select()
      .from(roleTable)
      .where(eq(roleTable.id, id));

    expect([...row!.permissions]).toEqual(["enablelater:use"]);
  }, 30000);

  it("marks a disabled module's saved key unavailable with the reason and removes it", async () => {
    const actor = await insertManager();

    const roleId = await insertRole(deployment.context, {
      name: `Retained dormant ${Date.now()}`,
      permissions: ["fixture:use"],
    });

    await deployment.context.db
      .update(roleTable)
      .set({ permissions: ["fixture:use", "dormant:use"] })
      .where(eq(roleTable.id, roleId));

    const detail = await rolesCaller(actor).get({ roleId });

    expect(detail.unavailableKeys).toContainEqual({
      key: "dormant:use",
      reason: "module-disabled",
    });

    const dormantGroup = detail.permissionGroups.find((entry) =>
      entry.keys.some((key) => key.key === "dormant:use")
    );

    expect(
      dormantGroup?.keys.find((key) => key.key === "dormant:use")
        ?.unavailableReason
    ).toBe("module-disabled");

    // The retained key can be removed; the valid key stays.
    const [row] = await deployment.context.db
      .select({ name: roleTable.name })
      .from(roleTable)
      .where(eq(roleTable.id, roleId));

    await rolesCaller(actor).update({
      roleId,
      name: row!.name,
      permissions: ["fixture:use"],
    });

    const after = await rolesCaller(actor).get({ roleId });

    expect(after.unavailableKeys).toEqual([]);
  });
});
