import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addPerson,
  createPeopleRouter,
  disablePerson,
  enablePerson,
  listPeople,
  principalFor,
  readPerson,
  removePerson,
  resendInvitation,
  resendSetPassword,
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

    expect(enabled?.status).toBe("active");
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
