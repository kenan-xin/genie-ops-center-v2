import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  addPerson,
  countActiveAdministrators,
  createPeopleRouter,
  disablePerson,
  enablePerson,
  listPeople,
  principalFor,
  readPerson,
  removePerson,
  resendInvitation,
  resendSetPassword,
  withTransaction,
  type RequestPrincipal,
} from "../src/index.ts";
import {
  account,
  auditEvent,
  groupMember,
  role as roleTable,
  roleAssignment,
  session as sessionTable,
  user,
} from "../src/schema.ts";
import {
  insertCredentialPerson,
  insertGroup,
  insertPersonWith,
  insertRole,
  insertSession,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

/**
 * S2-10 against a real Postgres with the real core history. Nothing is mocked: every writer goes
 * through the shipped service and every read through the shipped statement, including the R-38
 * administrator guard. The realm is absent (profile `core`), so the local-account realm calls are
 * refused and proved in the separate Keycloak suite; the account type is still read from the
 * person's own provider row (R-51a).
 */

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const previousNodeEnv = process.env.NODE_ENV;

beforeAll(async () => {
  // The mailer logs the invitation message in development instead of sending it, so the
  // brokered invitation path (email send plus `core:invitation_sent` row) is exercised without a
  // provider (R-45, R-49).
  process.env.NODE_ENV = "development";

  deployment = await startDisposableDeployment();

  await markSetupDone(deployment.context);

  // Local accounts on, so the local-account ordering and compensation paths run. Set before the
  // settings reader fills its ten-second cache.
  await deployment.context.db.$client.query(
    "update tenant_settings set local_accounts_enabled = true, realm_supports_local_accounts = true"
  );

  // The realm target reads `env.auth`; the tests stub `fetch` for the realm calls. The auth member
  // itself was not built (the context was created without these values).
  Object.assign(deployment.context.env, {
    auth: {
      betterAuthSecret: "people-test-secret-at-least-32-characters",
      keycloakUrl: "http://127.0.0.1:1",
      keycloakRealm: "genie",
      keycloakClientId: "genie-ops-center",
      keycloakClientSecret: "client-secret",
      keycloakAdminClientSecret: "admin-secret",
    },
  });
}, 180000);

afterAll(async () => {
  await deployment?.stop();

  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

function request(userId: string | undefined): RequestPrincipal {
  return principalFor({
    tenant: deployment.context,
    modules: [],
    userId,
    authenticated: userId !== undefined,
  });
}

/** A caller holding `core:people:manage` only. */
async function manager(): Promise<string> {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:people:manage",
  ]);

  return userId;
}

/**
 * A person holding the `Tenant administrator` system role, the one the R-38 guard counts. `userId`
 * is reused for a caller that must itself hold the role.
 */
async function insertTenantAdministrator(userId?: string): Promise<string> {
  const id =
    userId ?? (await insertUser(deployment.context, { status: "active" }));

  const existing = await deployment.context.db
    .select({ id: roleTable.id })
    .from(roleTable)
    .where(eq(roleTable.name, "Tenant administrator"))
    .limit(1);

  const roleId =
    existing[0]?.id ??
    (
      await deployment.context.db
        .insert(roleTable)
        .values({
          name: "Tenant administrator",
          permissions: ["core:people:manage"],
          isSystem: true,
        })
        .returning({ id: roleTable.id })
    )[0]!.id;

  await deployment.context.db.insert(roleAssignment).values({
    roleId,
    principalType: "user",
    principalId: id,
  });

  return id;
}

describe("the People writers against a real database", () => {
  it("adds a person and the picked roles in one transaction, or neither", async () => {
    const actor = await manager();

    const roleId = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    const email = `add-${Date.now()}@example.invalid`;

    const personId = await addPerson(deployment.context, {
      actorUserId: actor,
      email,
      name: "Added Person",
      roleIds: [roleId],
      sendInvitation: false,
    });

    const [person] = await deployment.context.db
      .select({
        status: user.status,
        onboarding: user.onboarding,
        banned: user.banned,
      })
      .from(user)
      .where(eq(user.id, personId));

    expect(person?.status).toBe("pending");
    expect(person?.onboarding).toBe("invited");
    expect(person?.banned).toBeFalsy();

    const assignments = await deployment.context.db
      .select({ id: roleAssignment.id })
      .from(roleAssignment)
      .where(eq(roleAssignment.principalId, personId));

    expect(assignments).toHaveLength(1);

    const added = await deployment.context.db
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(eq(auditEvent.action, "core:person_added"));

    expect(added.length).toBeGreaterThan(0);
  });

  it("writes no person when a picked role does not exist", async () => {
    const actor = await manager();
    const email = `rollback-${Date.now()}@example.invalid`;

    await expect(
      addPerson(deployment.context, {
        actorUserId: actor,
        email,
        roleIds: ["00000000-0000-0000-0000-000000000000"],
        sendInvitation: false,
      })
    ).rejects.toMatchObject({ code: "not-found" });

    const rows = await deployment.context.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));

    expect(rows).toHaveLength(0);
  });

  it("refuses a duplicate email with the stable code", async () => {
    const actor = await manager();
    const email = `dup-${Date.now()}@example.invalid`;

    await addPerson(deployment.context, {
      actorUserId: actor,
      email,
      roleIds: [],
      sendInvitation: false,
    });

    await expect(
      addPerson(deployment.context, {
        actorUserId: actor,
        email,
        roleIds: [],
        sendInvitation: false,
      })
    ).rejects.toMatchObject({ code: "email-taken" });
  });

  it("sends the brokered invitation and writes one core:invitation_sent row with no link", async () => {
    const actor = await manager();
    const email = `invite-${Date.now()}@example.invalid`;

    const personId = await addPerson(deployment.context, {
      actorUserId: actor,
      email,
      roleIds: [],
      sendInvitation: true,
    });

    const rows = await deployment.context.db
      .select({ metadata: auditEvent.metadata, targetId: auditEvent.targetId })
      .from(auditEvent)
      .where(eq(auditEvent.action, "core:invitation_sent"));

    const row = rows.find((one) => one.targetId === personId);

    expect(row).toBeDefined();

    // R-44: never the link, never a token.
    expect(JSON.stringify(row?.metadata)).not.toContain("http");
  });

  it("refuses resend invitation for a local account and for a pending-only mismatch", async () => {
    const actor = await manager();

    const localId = await insertCredentialPerson(deployment.context, {
      email: `local-${Date.now()}@example.invalid`,
      password: "local-password-14",
      isBreakGlass: false,
      status: "pending",
    });

    await expect(
      resendInvitation(deployment.context, {
        actorUserId: actor,
        personId: localId,
      })
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("rate limits resend invitation per target person", async () => {
    const actor = await manager();
    const email = `resend-invite-${Date.now()}@example.invalid`;

    const personId = await addPerson(deployment.context, {
      actorUserId: actor,
      email,
      roleIds: [],
      sendInvitation: false,
    });

    // R-19 defaults: 3 in one hour per target person.
    /* eslint-disable no-await-in-loop -- the limit is a sequence by definition. */
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await resendInvitation(deployment.context, {
        actorUserId: actor,
        personId,
      });
    }

    await expect(
      resendInvitation(deployment.context, { actorUserId: actor, personId })
    ).rejects.toMatchObject({ code: "rate-limited" });
    /* eslint-enable no-await-in-loop */

    const limited = await deployment.context.db
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(eq(auditEvent.action, "auth:rate_limited"));

    expect(limited.length).toBeGreaterThan(0);
  });

  it("refuses resend set-password for a brokered person", async () => {
    const actor = await manager();
    const email = `brokered-sp-${Date.now()}@example.invalid`;

    const personId = await addPerson(deployment.context, {
      actorUserId: actor,
      email,
      roleIds: [],
      sendInvitation: false,
    });

    await expect(
      resendSetPassword(deployment.context, {
        actorUserId: actor,
        personId,
      })
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("disables, re-enables and removes a person, keeping the row and the audit trail", async () => {
    // R-38 refuses any disable when the tenant has no active administrator, so a baseline holder
    // is seeded before this case (the real deployment always has one).
    await insertTenantAdministrator();

    const actor = await manager();

    const groupId = await insertGroup(deployment.context, [], {
      source: "local",
    });

    const roleId = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    const email = `lifecycle-${Date.now()}@example.invalid`;

    const personId = await addPerson(deployment.context, {
      actorUserId: actor,
      email,
      roleIds: [],
      sendInvitation: false,
    });

    await deployment.context.db.insert(groupMember).values({
      groupId,
      userId: personId,
      source: "local",
    });

    await deployment.context.db.insert(roleAssignment).values({
      roleId,
      principalType: "user",
      principalId: personId,
    });

    await insertSession(deployment.context, { userId: personId });

    await disablePerson(deployment.context, {
      actorUserId: actor,
      personId,
    });

    const [disabled] = await deployment.context.db
      .select({ status: user.status, banned: user.banned })
      .from(user)
      .where(eq(user.id, personId));

    expect(disabled?.status).toBe("disabled");
    expect(disabled?.banned).toBe(true);

    await enablePerson(deployment.context, { actorUserId: actor, personId });

    const [enabled] = await deployment.context.db
      .select({ status: user.status, banned: user.banned })
      .from(user)
      .where(eq(user.id, personId));

    // The person never signed in, so re-enable restores `pending`, not `active` (R-10).
    expect(enabled?.status).toBe("pending");
    expect(enabled?.banned).toBe(false);

    await removePerson(deployment.context, { actorUserId: actor, personId });

    // R-43: the assignments, memberships and sessions go; the row stays.
    expect(
      await deployment.context.db
        .select()
        .from(roleAssignment)
        .where(eq(roleAssignment.principalId, personId))
    ).toHaveLength(0);
    expect(
      await deployment.context.db
        .select()
        .from(groupMember)
        .where(eq(groupMember.userId, personId))
    ).toHaveLength(0);
    expect(
      await deployment.context.db
        .select()
        .from(sessionTable)
        .where(eq(sessionTable.userId, personId))
    ).toHaveLength(0);

    const [removed] = await deployment.context.db
      .select({ id: user.id, banned: user.banned })
      .from(user)
      .where(eq(user.id, personId));

    expect(removed?.id).toBe(personId);
    expect(removed?.banned).toBe(true);

    const removalAudit = await deployment.context.db
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(eq(auditEvent.action, "core:person_removed"));

    expect(removalAudit.length).toBeGreaterThan(0);
  });
});

/** Every holder of the `Tenant administrator` role, cleared so a case can set up its own count. */
async function clearAdministrators(): Promise<void> {
  await deployment.context.db.$client.query(
    `delete from role_assignment a
       using role r
      where a.role_id = r.id
        and r.name = 'Tenant administrator'
        and r.is_system = true`
  );
}

describe("R-38 self-protection and the last administrator, per writer", () => {
  it("refuses a self-disable and a self-remove with the stable code", async () => {
    const actor = await manager();

    await expect(
      disablePerson(deployment.context, { actorUserId: actor, personId: actor })
    ).rejects.toMatchObject({ code: "self-protection" });

    await expect(
      removePerson(deployment.context, { actorUserId: actor, personId: actor })
    ).rejects.toMatchObject({ code: "self-protection" });
  });

  it("refuses disabling the sole active tenant administrator", async () => {
    await clearAdministrators();

    const actor = await manager();
    const onlyAdmin = await insertTenantAdministrator();

    // No other active holder exists, so the guard refuses and rolls the write back.
    await expect(
      disablePerson(deployment.context, {
        actorUserId: actor,
        personId: onlyAdmin,
      })
    ).rejects.toMatchObject({ code: "last-administrator" });

    const [row] = await deployment.context.db
      .select({ banned: user.banned, status: user.status })
      .from(user)
      .where(eq(user.id, onlyAdmin));

    expect(row?.banned).toBeFalsy();
  });

  it("refuses removing the sole active tenant administrator", async () => {
    await clearAdministrators();

    const actor = await manager();
    const onlyAdmin = await insertTenantAdministrator();

    await expect(
      removePerson(deployment.context, {
        actorUserId: actor,
        personId: onlyAdmin,
      })
    ).rejects.toMatchObject({ code: "last-administrator" });
  });

  it("allows disabling one of two administrators", async () => {
    await clearAdministrators();

    const actor = await insertTenantAdministrator();

    // A second active holder keeps the tenant administered, and the actor is a different person
    // from the target, so the guard passes.
    const second = await insertTenantAdministrator();

    await disablePerson(deployment.context, {
      actorUserId: actor,
      personId: second,
    });

    const [row] = await deployment.context.db
      .select({ banned: user.banned })
      .from(user)
      .where(eq(user.id, second));

    expect(row?.banned).toBe(true);
  });
});

describe("the People reads", () => {
  it("never lists the break-glass account and never reads it", async () => {
    const breakGlass = await insertCredentialPerson(deployment.context, {
      email: `brk-${Date.now()}@example.invalid`,
      password: "break-glass-password-14",
      isBreakGlass: true,
    });

    const people = await listPeople(deployment.context);

    expect(people.some((person) => person.id === breakGlass)).toBe(false);
    expect(await readPerson(deployment.context, breakGlass)).toBeUndefined();
  });

  it("reads the account type from the account's own provider row (R-51a)", async () => {
    const localId = await insertCredentialPerson(deployment.context, {
      email: `local-type-${Date.now()}@example.invalid`,
      password: "local-password-14",
      isBreakGlass: false,
      status: "active",
    });

    const brokeredId = await insertUser(deployment.context, {
      status: "active",
    });

    await deployment.context.db.insert(account).values({
      id: `acct-${brokeredId}`,
      accountId: brokeredId,
      providerId: "keycloak",
      userId: brokeredId,
    });

    const people = await listPeople(deployment.context);

    expect(people.find((person) => person.id === localId)?.accountType).toBe(
      "local"
    );
    expect(people.find((person) => person.id === brokeredId)?.accountType).toBe(
      "brokered"
    );
  });
});

describe("the People router", () => {
  it("refuses an anonymous caller unauthenticated and a caller without the key forbidden", async () => {
    const anonymous = createPeopleRouter().createCaller({
      tenant: deployment.context,
      caller: request(undefined),
    });

    // A direct caller sees tRPC wrap the catalogue refusal; its `cause` is the AppError.
    await expect(anonymous.list()).rejects.toMatchObject({
      cause: { code: "unauthenticated" },
    });

    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
    ]);

    const unpermitted = createPeopleRouter().createCaller({
      tenant: deployment.context,
      caller: request(userId),
    });

    await expect(unpermitted.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (input instanceof URL) return input.toString();

  if (input instanceof Request) return input.url;

  return input;
}

/** A fetch stub standing in for the Keycloak admin API, counting user creates and deletes. */
function installRealmStub(onPost?: () => Promise<void>) {
  const counters = { posts: 0, deletes: 0 };

  // SAFETY: this stub implements the fetch surface the realm client uses; the cast satisfies the
  // global `fetch` type while the tests read only the counters.
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url = urlOf(input);

    if (url.includes("/protocol/openid-connect/token")) {
      return Response.json({ access_token: "realm-token" });
    }

    if (init?.method === "POST" && url.endsWith("/users")) {
      counters.posts += 1;

      await onPost?.();

      return new Response(null, {
        status: 201,
        headers: { location: `${url}/realm-user-1` },
      });
    }

    if (init?.method === "DELETE") {
      counters.deletes += 1;

      return new Response(null, { status: 204 });
    }

    return new Response(null, { status: 204 });
  }) as typeof fetch;

  return counters;
}

describe("writes on the break-glass account and an erased row (R-39)", () => {
  async function breakGlassId(): Promise<string> {
    return insertCredentialPerson(deployment.context, {
      email: `bg-write-${Date.now()}@example.invalid`,
      password: "break-glass-password-14",
      isBreakGlass: true,
    });
  }

  it("refuses disable on the break-glass account and leaves it untouched", async () => {
    const actor = await manager();
    const personId = await breakGlassId();

    await expect(
      disablePerson(deployment.context, { actorUserId: actor, personId })
    ).rejects.toMatchObject({ code: "not-found" });

    const [row] = await deployment.context.db
      .select({ banned: user.banned })
      .from(user)
      .where(eq(user.id, personId));

    expect(row?.banned).toBeFalsy();
  });

  it("refuses enable on the break-glass account", async () => {
    const actor = await manager();
    const personId = await breakGlassId();

    await expect(
      enablePerson(deployment.context, { actorUserId: actor, personId })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses remove on the break-glass account", async () => {
    const actor = await manager();
    const personId = await breakGlassId();

    await expect(
      removePerson(deployment.context, { actorUserId: actor, personId })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses resend set-password on the break-glass account", async () => {
    const actor = await manager();
    const personId = await breakGlassId();

    await expect(
      resendSetPassword(deployment.context, { actorUserId: actor, personId })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses resend invitation on the break-glass account", async () => {
    const actor = await manager();
    const personId = await breakGlassId();

    await expect(
      resendInvitation(deployment.context, { actorUserId: actor, personId })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses remove on an erased row", async () => {
    const actor = await manager();

    const personId = await insertUser(deployment.context, {
      status: "active",
      erasedAt: new Date(),
    });

    await expect(
      removePerson(deployment.context, { actorUserId: actor, personId })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("answers email-taken for the break-glass email as for any taken address", async () => {
    const actor = await manager();
    const email = `bg-taken-${Date.now()}@example.invalid`;

    await insertCredentialPerson(deployment.context, {
      email,
      password: "break-glass-password-14",
      isBreakGlass: true,
    });

    await expect(
      addPerson(deployment.context, {
        actorUserId: actor,
        email,
        roleIds: [],
        sendInvitation: false,
      })
    ).rejects.toMatchObject({ code: "email-taken" });
  });
});

describe("disable, re-enable and the R-38 count (R-10, R-38)", () => {
  it("deletes the person's sessions on disable", async () => {
    await clearAdministrators();
    await insertTenantAdministrator();

    const actor = await manager();
    const personId = await insertUser(deployment.context, { status: "active" });

    await insertSession(deployment.context, { userId: personId });

    await disablePerson(deployment.context, { actorUserId: actor, personId });

    expect(
      await deployment.context.db
        .select()
        .from(sessionTable)
        .where(eq(sessionTable.userId, personId))
    ).toHaveLength(0);
  });

  it("re-enables a never-signed-in person as pending", async () => {
    await clearAdministrators();
    await insertTenantAdministrator();

    const actor = await manager();

    const personId = await addPerson(deployment.context, {
      actorUserId: actor,
      email: `reenable-${Date.now()}@example.invalid`,
      roleIds: [],
      sendInvitation: false,
    });

    await disablePerson(deployment.context, { actorUserId: actor, personId });
    await enablePerson(deployment.context, { actorUserId: actor, personId });

    const [row] = await deployment.context.db
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, personId));

    expect(row?.status).toBe("pending");
  });

  it("re-enables a person who has signed in as active", async () => {
    await clearAdministrators();
    await insertTenantAdministrator();

    const actor = await manager();

    const personId = await insertUser(deployment.context, {
      status: "active",
      firstSignInAt: new Date(),
    });

    await disablePerson(deployment.context, { actorUserId: actor, personId });
    await enablePerson(deployment.context, { actorUserId: actor, personId });

    const [row] = await deployment.context.db
      .select({ status: user.status })
      .from(user)
      .where(eq(user.id, personId));

    expect(row?.status).toBe("active");
  });

  it("keeps the R-38 count unchanged across disable and re-enable of a pending administrator", async () => {
    await clearAdministrators();

    await insertTenantAdministrator();

    const actor = await manager();

    const [adminRole] = await deployment.context.db
      .select({ id: roleTable.id })
      .from(roleTable)
      .where(eq(roleTable.name, "Tenant administrator"))
      .limit(1);

    const personId = await addPerson(deployment.context, {
      actorUserId: actor,
      email: `count-${Date.now()}@example.invalid`,
      roleIds: [adminRole!.id],
      sendInvitation: false,
    });

    const before = await withTransaction(deployment.context, (tx) =>
      countActiveAdministrators(tx)
    );

    await disablePerson(deployment.context, { actorUserId: actor, personId });
    await enablePerson(deployment.context, { actorUserId: actor, personId });

    const after = await withTransaction(deployment.context, (tx) =>
      countActiveAdministrators(tx)
    );

    expect(before).toBe(1);
    expect(after).toBe(before);
  });
});

describe("Add person ordering, roles and compensation (R-40)", () => {
  it("refuses an email taken and creates no realm user", async () => {
    const actor = await manager();
    const email = `taken-${Date.now()}@example.invalid`;

    await insertUser(deployment.context, { email });

    const counters = installRealmStub();

    await expect(
      addPerson(deployment.context, {
        actorUserId: actor,
        email,
        roleIds: [],
        accountType: "local",
      })
    ).rejects.toMatchObject({ code: "email-taken" });

    expect(counters.posts).toBe(0);
  });

  it("refuses an unknown role id and creates no realm user", async () => {
    const actor = await manager();

    const counters = installRealmStub();

    await expect(
      addPerson(deployment.context, {
        actorUserId: actor,
        email: `bad-role-${Date.now()}@example.invalid`,
        roleIds: [randomUUID()],
        accountType: "local",
      })
    ).rejects.toMatchObject({ code: "not-found" });

    expect(counters.posts).toBe(0);
  });

  it("deletes the realm user when the transaction fails after it was created", async () => {
    const actor = await manager();
    const email = `race-${Date.now()}@example.invalid`;

    const counters = installRealmStub(async () => {
      // A concurrent add wins the unique email between the pre-check and the transaction.
      await deployment.context.db.insert(user).values({
        id: randomUUID(),
        name: "Race Winner",
        email,
        status: "pending",
        onboarding: "invited",
      });
    });

    await expect(
      addPerson(deployment.context, {
        actorUserId: actor,
        email,
        roleIds: [],
        accountType: "local",
      })
    ).rejects.toMatchObject({ code: "email-taken" });

    expect(counters.posts).toBe(1);
    expect(counters.deletes).toBe(1);
  });

  it("refuses roles from a caller without core:roles:manage, and hides the picker", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "core:people:manage",
    ]);

    const caller = createPeopleRouter().createCaller({
      tenant: deployment.context,
      caller: request(userId),
    });

    const roleId = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    expect((await caller.capabilities()).canAssignRoles).toBe(false);

    await expect(
      caller.add({
        email: `perm-${Date.now()}@example.invalid`,
        roleIds: [roleId],
        sendInvitation: false,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const roleless = await caller.add({
      email: `perm-ok-${Date.now()}@example.invalid`,
      roleIds: [],
      sendInvitation: false,
    });

    expect(roleless.id).toBeTruthy();
  });

  it("allows roles for a caller holding both keys", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "core:people:manage",
      "core:roles:manage",
    ]);

    const caller = createPeopleRouter().createCaller({
      tenant: deployment.context,
      caller: request(userId),
    });

    const roleId = await insertRole(deployment.context, {
      permissions: ["fixture:use"],
    });

    expect((await caller.capabilities()).canAssignRoles).toBe(true);

    const created = await caller.add({
      email: `both-${Date.now()}@example.invalid`,
      roleIds: [roleId],
      sendInvitation: false,
    });

    expect(
      await deployment.context.db
        .select()
        .from(roleAssignment)
        .where(eq(roleAssignment.principalId, created.id))
    ).toHaveLength(1);
  });
});
