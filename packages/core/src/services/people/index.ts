import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { account, groupMember, session, user } from "../../schema.ts";
import { writeAdminAuditEvent, writeAuthAuditEvent } from "../audit/index.ts";
import { describeUserAgent } from "../auth/user-agent.ts";
import {
  assertAdministratorRemains,
  assertNotSelf,
  lockAdministratorGuard,
} from "../authorization/administrators.ts";
import {
  assignRoleInTransaction,
  removeUserAssignments,
} from "../authorization/role-assignment.ts";
import {
  createRealmUser,
  executeActionsEmail,
  serviceAccountToken,
  type KeycloakTarget,
} from "../keycloak/client.ts";
import { GENIE_ADMIN_CLIENT_ID } from "../keycloak/environment.ts";
import { consumeRateLimit } from "../rate-limit/index.ts";

/**
 * The People administration reads and writes (Spec 2 R-37 to R-43, R-40a, R-51a). The one People
 * router is the only caller; every writer re-checks R-38 through the shared administrator guard and
 * every write records a catalogue audit action. Role assignments go through the one
 * role-assignment service, and a local account's realm account and set-password email go through
 * the `genie-admin` service client.
 */

export type PersonStatus = "active" | "pending" | "disabled";

export type AccountType = "brokered" | "local";

/** One group a person belongs to, as a directory pill reads it (R-24c). */
export type PersonGroupChipRow = {
  readonly id: string;
  readonly label: string;
};

/** One person the People directory lists. The break-glass account is never among them (R-39). */
export type PersonRow = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: PersonStatus;
  /** R-51a: fixed at creation and read from the account's own provider row. */
  readonly accountType: AccountType;
  /** Server-derived: the identity provider label, or "Genie (local password)". */
  readonly identitySource: string;
  readonly groups: readonly PersonGroupChipRow[];
  /** The number of role assignments the person holds, direct and through groups. */
  readonly roleCount: number;
  readonly firstSignInAt: string | null;
  readonly lastSignInAt: string | null;
  readonly onboarding: "invited" | "jit" | null;
  /** R-41: read from the latest `core:set_password_sent` audit row. */
  readonly setPasswordSentAt: string | null;
  /** R-41: read from the latest `core:invitation_sent` audit row. */
  readonly invitationSentAt: string | null;
};

/** One group a person belongs to, as the inspector's Groups tab reads it. */
export type PersonGroupRow = {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly source: "idp" | "local";
  readonly syncedAt: string | null;
};

/** One assignment a person holds, direct or through a group, as the Roles tab reads it. */
export type PersonAssignmentRow = {
  readonly id: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly moduleId: string | null;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
  readonly source: "direct" | "group";
  readonly groupId: string | null;
  readonly groupName: string | null;
};

/** One session of a person, as the Sessions tab reads it. */
export type PersonSessionRow = {
  readonly id: string;
  readonly device: string;
  readonly browser: string;
  readonly ipAddress: string;
  readonly signedInAt: string;
  readonly lastActiveAt: string;
};

export type PersonDetail = Omit<PersonRow, "groups"> & {
  readonly groups: readonly PersonGroupRow[];
  readonly assignments: readonly PersonAssignmentRow[];
  readonly sessions: readonly PersonSessionRow[];
  /** R-38: true when disabling or removing this person would leave no active administrator. */
  readonly lastAdministrator: boolean;
};

/** One person the local-group member picker may offer (R-39, moved from the groups router). */
export type AssignablePerson = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
};

function identitySourceOf(accountType: AccountType): string {
  return accountType === "local"
    ? "Genie (local password)"
    : "External identity provider";
}

function statusOf(status: string | null, banned: boolean): PersonStatus {
  if (banned) return "disabled";

  return status === "pending" || status === "disabled" ? status : "active";
}

type RawPerson = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: string | null;
  readonly banned: boolean | null;
  readonly onboarding: string | null;
  readonly firstSignInAt: string | null;
  readonly lastSignInAt: string | null;
  readonly local: boolean;
  readonly groups: readonly PersonGroupChipRow[];
  readonly roleCount: number;
  readonly setPasswordSentAt: string | null;
  readonly invitationSentAt: string | null;
};

/**
 * The People directory's one read shape. The break-glass account and an erased person are excluded
 * (R-39); status comes from the stored column with `banned` overriding it, so a removed person
 * reads `disabled`. The two "last sent" times are the latest matching audit row (R-41).
 */
const PERSON_COLUMNS = `
  u.id,
  u.name,
  u.email,
  u.status,
  u.banned,
  u.onboarding,
  u.first_sign_in_at::text as "firstSignInAt",
  u.last_sign_in_at::text as "lastSignInAt",
  exists(select 1 from account a where a.user_id = u.id and a.provider_id = 'credential') as local,
  coalesce(
    (select json_agg(json_build_object('id', g.id::text, 'label', coalesce(g.display_label, g.name))
                     order by lower(coalesce(g.display_label, g.name)))
       from group_member m join "group" g on g.id = m.group_id
      where m.user_id = u.id),
    '[]'::json) as groups,
  ((select count(*) from role_assignment a
     where a.principal_type = 'user' and a.principal_id = u.id)
   + (select count(*)
        from group_member m
        join role_assignment a on a.principal_type = 'group' and a.principal_id = m.group_id::text
       where m.user_id = u.id))::int as "roleCount",
  (select max(e.occurred_at)::text from audit_event e
    where e.action = 'core:set_password_sent' and e.target_id = u.id) as "setPasswordSentAt",
  (select max(e.occurred_at)::text from audit_event e
    where e.action = 'core:invitation_sent' and e.target_id = u.id) as "invitationSentAt"`;

function normalizePerson(row: RawPerson): PersonRow {
  const accountType = row.local ? "local" : "brokered";

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: statusOf(row.status, row.banned === true),
    accountType,
    identitySource: identitySourceOf(accountType),
    groups: row.groups ?? [],
    roleCount: Number(row.roleCount),
    firstSignInAt: row.firstSignInAt,
    lastSignInAt: row.lastSignInAt,
    onboarding:
      row.onboarding === "invited" || row.onboarding === "jit"
        ? row.onboarding
        : null,
    setPasswordSentAt: row.setPasswordSentAt,
    invitationSentAt: row.invitationSentAt,
  };
}

/** The People directory (design: search, status and group filters, sort). The break-glass account
 * and an erased person never appear (R-39). */
export async function listPeople(
  tenant: TenantContext
): Promise<readonly PersonRow[]> {
  const result = await tenant.db.$client.query(
    `select ${PERSON_COLUMNS}
       from "user" u
      where u.is_break_glass = false
        and u.erased_at is null
      order by lower(u.name), lower(u.email)`
  );

  // SAFETY: the statement selects exactly the person columns.
  return (result.rows as readonly RawPerson[]).map(normalizePerson);
}

/** The people a local group may take: active, not banned, not erased, never break-glass (R-39). */
export async function listActivePeople(
  tenant: TenantContext
): Promise<readonly AssignablePerson[]> {
  const result = await tenant.db.$client.query(
    `select u.id, u.name, u.email
       from "user" u
      where u.status = 'active'
        and u.banned is not true
        and u.erased_at is null
        and u.is_break_glass = false
      order by lower(u.name), lower(u.email)`
  );

  // SAFETY: the statement selects exactly these three columns.
  return result.rows as readonly AssignablePerson[];
}

async function readPersonRow(
  tenant: TenantContext,
  personId: string
): Promise<PersonRow | undefined> {
  const result = await tenant.db.$client.query(
    `select ${PERSON_COLUMNS}
       from "user" u
      where u.id = $1
        and u.is_break_glass = false
        and u.erased_at is null`,
    [personId]
  );

  // SAFETY: the statement selects exactly the person columns.
  const [row] = result.rows as readonly RawPerson[];

  return row === undefined ? undefined : normalizePerson(row);
}

/** R-38: true when no active administrator would remain if this person could no longer administer. */
async function isLastAdministratorPerson(
  tenant: TenantContext,
  personId: string
): Promise<boolean> {
  const result = await tenant.db.$client.query(
    `select count(distinct u.id)::int as count
       from "user" u
      where u.status = 'active'
        and u.banned is not true
        and u.erased_at is null
        and u.is_break_glass = false
        and u.id <> $1
        and (
          exists (
            select 1 from role_assignment a
              join role r on r.id = a.role_id
             where r.name = $2 and r.is_system = true
               and a.principal_type = 'user' and a.principal_id = u.id
          )
          or exists (
            select 1
              from group_member m
              join "group" g on g.id = m.group_id and g.archived_at is null
              join role_assignment a
                on a.principal_type = 'group' and a.principal_id = g.id::text
              join role r on r.id = a.role_id
             where m.user_id = u.id and r.name = $2 and r.is_system = true
          )
        )`,
    [personId, "Tenant administrator"]
  );

  // SAFETY: the statement selects one `::int` count.
  const rows = result.rows as readonly { count: number }[];

  return (rows[0]?.count ?? 0) === 0;
}

/** One person with their groups, assignments and sessions, for the inspector (R-37). */
export async function readPerson(
  tenant: TenantContext,
  personId: string
): Promise<PersonDetail | undefined> {
  const row = await readPersonRow(tenant, personId);

  if (row === undefined) return undefined;

  const groups = await tenant.db.$client.query(
    `select g.id::text as id, g.name,
            coalesce(g.display_label, g.name) as label, g.source,
            m.synced_at::text as "syncedAt"
       from group_member m
       join "group" g on g.id = m.group_id
      where m.user_id = $1
      order by lower(coalesce(g.display_label, g.name))`,
    [personId]
  );

  const assignments = await tenant.db.$client.query(
    `select a.id::text as id, a.role_id::text as "roleId", r.name as "roleName",
            r.module_id as "moduleId", a.scope_type as "scopeType", a.scope_id as "scopeId",
            'direct' as source, null::uuid as "groupId", null::text as "groupName"
       from role_assignment a
       join role r on r.id = a.role_id
      where a.principal_type = 'user' and a.principal_id = $1
      union all
     select a.id::text as id, a.role_id::text as "roleId", r.name as "roleName",
            r.module_id as "moduleId", a.scope_type as "scopeType", a.scope_id as "scopeId",
            'group' as source, g.id as "groupId", coalesce(g.display_label, g.name) as "groupName"
       from group_member m
       join "group" g on g.id = m.group_id
       join role_assignment a
         on a.principal_type = 'group' and a.principal_id = g.id::text
       join role r on r.id = a.role_id
      where m.user_id = $1
      order by "roleName"`,
    [personId]
  );

  const sessions = await tenant.db.$client.query(
    `select id, user_agent as "userAgent", ip_address as "ipAddress",
            created_at::text as "signedInAt",
            coalesce(last_active_at, updated_at)::text as "lastActiveAt"
       from session
      where user_id = $1
      order by coalesce(last_active_at, updated_at) desc`,
    [personId]
  );

  // SAFETY: the group statement selects exactly the group columns.
  const groupRows = groups.rows as readonly PersonGroupRow[];

  // SAFETY: the union selects exactly the assignment columns, and each branch's `source` is the
  // SQL literal 'direct' or 'group'.
  const assignmentRows = assignments.rows as readonly PersonAssignmentRow[];

  type RawSession = {
    readonly id: string;
    readonly userAgent: string | null;
    readonly ipAddress: string | null;
    readonly signedInAt: string;
    readonly lastActiveAt: string;
  };

  // SAFETY: the session statement selects exactly the session columns.
  const rawSessions = sessions.rows as readonly RawSession[];

  const sessionRows = rawSessions.map((one) => {
    const described = describeUserAgent(one.userAgent);

    return {
      id: one.id,
      device: described.device,
      browser: described.browser,
      ipAddress: one.ipAddress ?? "",
      signedInAt: one.signedInAt,
      lastActiveAt: one.lastActiveAt,
    };
  }) satisfies readonly PersonSessionRow[];

  return {
    ...row,
    groups: groupRows,
    assignments: assignmentRows,
    sessions: sessionRows,
    lastAdministrator: await isLastAdministratorPerson(tenant, personId),
  };
}

/** The realm, its admin target and the `genie-admin` secret a local-account writer needs. */
type RealmAdmin = {
  readonly target: KeycloakTarget;
  readonly realm: string;
  readonly secret: string;
};

/**
 * The realm admin target, or nothing when the context carries no authentication values. The
 * `genie-admin` secret is required by the local-account writers and refused when absent, because
 * client-only mode has no such client (ADR 0010).
 */
function realmTarget(tenant: TenantContext): RealmAdmin {
  const auth = tenant.env.auth;

  if (auth === undefined || auth.keycloakAdminClientSecret === undefined) {
    throw new AppError(CORE_ERRORS["local-accounts-unavailable"]);
  }

  return {
    target: { baseUrl: auth.keycloakUrl, fetch },
    realm: auth.keycloakRealm,
    secret: auth.keycloakAdminClientSecret,
  };
}

/** Consumes one attempt against an endpoint and writes the refusal audit row (R-21). */
async function rateLimit(
  tenant: TenantContext,
  endpoint: "add_person" | "resend_set_password" | "resend_invitation",
  subject: string,
  summary: string
): Promise<void> {
  const decision = await consumeRateLimit(tenant, { endpoint, subject });

  if (decision.allowed) return;

  await writeAuthAuditEvent(tenant, {
    action: "auth:rate_limited",
    summary,
    metadata: {
      endpoint: decision.endpoint,
      subjectKind: decision.subjectKind,
      windowMinutes: decision.windowMinutes,
      retryAfterMinutes: decision.retryAfterMinutes,
    },
  });

  throw new AppError(CORE_ERRORS["invalid-input"]);
}

/** Records one standalone administration audit row after a committed write (R-41). */
async function auditAfterCommit(
  tenant: TenantContext,
  input: Parameters<typeof writeAdminAuditEvent>[1]
): Promise<void> {
  await withTransaction(tenant, (tx) => writeAdminAuditEvent(tx, input));
}

/** The inviter's display name, falling back to a neutral label. */
async function inviterName(
  tenant: TenantContext,
  actorUserId: string
): Promise<string> {
  const result = await tenant.db.$client.query<{ name: string }>(
    `select name from "user" where id = $1`,
    [actorUserId]
  );

  return result.rows[0]?.name ?? "An administrator";
}

/** Sends the brokered invitation email and records its audit row (R-40a). */
async function sendInvitation(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly personId: string;
    readonly email: string;
    readonly name: string;
    readonly resend: boolean;
  }
): Promise<void> {
  const branding = await tenant.branding.get();

  await tenant.mailer.send({
    templateId: "invitation-brokered",
    to: input.email,
    variables: {
      name: input.name,
      email: input.email,
      companyName: branding.companyName,
      productName: branding.productName,
      inviterName: await inviterName(tenant, input.actorUserId),
      invitationUrl: tenant.publicUrl("/sign-in"),
    },
  });

  await auditAfterCommit(tenant, {
    action: "core:invitation_sent",
    actorUserId: input.actorUserId,
    targetType: "user",
    targetId: input.personId,
    summary: input.resend
      ? `Resent the invitation email to ${input.email}`
      : `Sent the invitation email to ${input.email}`,
    metadata: { resend: input.resend },
  });
}

/** Triggers the realm set-password email and records `core:set_password_sent` (R-40, R-41). */
async function sendSetPassword(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly personId: string;
    readonly email: string;
    readonly resend: boolean;
  }
): Promise<void> {
  const realm = realmTarget(tenant);

  const accountRows = await tenant.db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eq(account.userId, input.personId))
    .limit(1);

  const keycloakUserId = accountRows[0]?.accountId;

  if (keycloakUserId === undefined) {
    throw new AppError(CORE_ERRORS["realm-account-failed"]);
  }

  const token = await serviceAccountToken(
    realm.target,
    realm.realm,
    GENIE_ADMIN_CLIENT_ID,
    realm.secret
  );

  await executeActionsEmail(realm.target, realm.realm, token, keycloakUserId, [
    "UPDATE_PASSWORD",
  ]);

  await auditAfterCommit(tenant, {
    action: "core:set_password_sent",
    actorUserId: input.actorUserId,
    targetType: "user",
    targetId: input.personId,
    summary: input.resend
      ? `Resent the set-password email to ${input.email}`
      : `Triggered the set-password email for ${input.email}`,
    metadata: { resend: input.resend },
  });
}

export type AddPersonInput = {
  readonly actorUserId: string;
  readonly email: string;
  readonly name?: string | undefined;
  readonly roleIds: readonly string[];
  readonly accountType?: AccountType | undefined;
  /** Brokered accounts only: send the invitation email. Defaults to true (R-40a). */
  readonly sendInvitation?: boolean | undefined;
};

/**
 * Add person (R-40, R-40a): one transaction writes the `user` row and every picked role through
 * the one role-assignment service, so both are saved or neither is. A local account also creates
 * the realm account through `genie-admin`; a brokered add optionally sends the invitation email.
 */
export async function addPerson(
  tenant: TenantContext,
  input: AddPersonInput
): Promise<string> {
  const email = input.email.trim().toLowerCase();

  if (email === "" || !email.includes("@")) {
    throw new AppError(CORE_ERRORS["invalid-input"]);
  }

  await rateLimit(
    tenant,
    "add_person",
    input.actorUserId,
    "Add person refused by the fixed-window rate limit"
  );

  const settings = await tenant.settings.get();

  const requestedLocal = input.accountType === "local";

  const local =
    requestedLocal &&
    settings.localAccountsEnabled &&
    settings.realmSupportsLocalAccounts;

  if (requestedLocal && !local) {
    throw new AppError(CORE_ERRORS["local-accounts-unavailable"]);
  }

  const shouldSendInvitation = input.sendInvitation ?? true;

  if (!local && shouldSendInvitation) {
    // R-45: refuse before writing the row when this deployment cannot send the email.
    tenant.mailer.requireConfigured();
  }

  // A local account's realm account is created first, so its Keycloak id can be stored on the
  // account row in the same transaction that creates the person (R-40). A failure here writes
  // nothing.
  let keycloakUserId: string | null = null;

  if (local) {
    const realm = realmTarget(tenant);

    const token = await serviceAccountToken(
      realm.target,
      realm.realm,
      GENIE_ADMIN_CLIENT_ID,
      realm.secret
    );

    keycloakUserId = await createRealmUser(realm.target, realm.realm, token, {
      username: email,
      email,
      firstName: input.name?.trim() || email.split("@")[0] || email,
      enabled: true,
      emailVerified: false,
    });
  }

  const personId = randomUUID();

  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const existing = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(CORE_ERRORS["email-taken"]);
    }

    await tx.insert(user).values({
      id: personId,
      name: input.name?.trim() || email.split("@")[0] || email,
      email,
      status: "pending",
      onboarding: "invited",
    });

    if (local && keycloakUserId !== null) {
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: keycloakUserId,
        providerId: "credential",
        userId: personId,
      });
    }

    for (const roleId of new Set(input.roleIds)) {
      // One assignment at a time on the one transaction (DEC-39, R-40).
      // oxlint-disable-next-line no-await-in-loop
      await assignRoleInTransaction(tenant, tx, {
        actorUserId: input.actorUserId,
        roleId,
        principal: { type: "user", id: personId },
        scope: null,
      });
    }

    await writeAdminAuditEvent(tx, {
      action: "core:person_added",
      actorUserId: input.actorUserId,
      targetType: "user",
      targetId: personId,
      summary: `Added ${email}`,
      metadata: { email, local, roleIds: [...input.roleIds] },
    });
  });

  if (local) {
    await sendSetPassword(tenant, {
      actorUserId: input.actorUserId,
      personId,
      email,
      resend: false,
    });
  } else if (shouldSendInvitation) {
    await sendInvitation(tenant, {
      actorUserId: input.actorUserId,
      personId,
      email,
      name: input.name?.trim() || email.split("@")[0] || email,
      resend: false,
    });
  }

  return personId;
}

async function loadPersonForWrite(
  tx: TenantTransaction,
  personId: string
): Promise<{ readonly email: string; readonly banned: boolean | null }> {
  const rows = await tx
    .select({ email: user.email, banned: user.banned })
    .from(user)
    .where(eq(user.id, personId))
    .limit(1);

  const row = rows[0];

  if (row === undefined) {
    throw new AppError(CORE_ERRORS["not-found"], {
      cause: new Error(`No person ${personId}`),
    });
  }

  return row;
}

/** R-38: no person may disable or remove themselves. */
export async function disablePerson(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly personId: string }
): Promise<void> {
  assertNotSelf(input.actorUserId, input.personId);

  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const person = await loadPersonForWrite(tx, input.personId);

    await tx
      .update(user)
      .set({ banned: true, status: "disabled", updatedAt: sql`now()` })
      .where(eq(user.id, input.personId));

    await assertAdministratorRemains(tx);

    await writeAdminAuditEvent(tx, {
      action: "core:person_disabled",
      actorUserId: input.actorUserId,
      targetType: "user",
      targetId: input.personId,
      summary: `Disabled ${person.email}`,
      metadata: { email: person.email },
    });
  });
}

/** Re-enable a disabled person. */
export async function enablePerson(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly personId: string }
): Promise<void> {
  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const person = await loadPersonForWrite(tx, input.personId);

    await tx
      .update(user)
      .set({ banned: false, status: "active", updatedAt: sql`now()` })
      .where(eq(user.id, input.personId));

    await writeAdminAuditEvent(tx, {
      action: "core:person_enabled",
      actorUserId: input.actorUserId,
      targetType: "user",
      targetId: input.personId,
      summary: `Re-enabled ${person.email}`,
      metadata: { email: person.email },
    });
  });
}

/**
 * Remove a person (R-43): delete their user-principal role assignments, their group memberships and
 * their sessions, and ban them. The `user` row, its name and email, and every audit row stay.
 */
export async function removePerson(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly personId: string }
): Promise<void> {
  assertNotSelf(input.actorUserId, input.personId);

  await withTransaction(tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    const person = await loadPersonForWrite(tx, input.personId);

    await removeUserAssignments(tenant, tx, {
      actorUserId: input.actorUserId,
      userId: input.personId,
    });

    await tx.delete(groupMember).where(eq(groupMember.userId, input.personId));

    await tx.delete(session).where(eq(session.userId, input.personId));

    await tx
      .update(user)
      .set({ banned: true, status: "disabled", updatedAt: sql`now()` })
      .where(eq(user.id, input.personId));

    await assertAdministratorRemains(tx);

    await writeAdminAuditEvent(tx, {
      action: "core:person_removed",
      actorUserId: input.actorUserId,
      targetType: "user",
      targetId: input.personId,
      summary: `Removed ${person.email}`,
      metadata: { email: person.email },
    });
  });
}

/**
 * Resend the set-password email to a pending local-account person (R-41). It is refused for any
 * other person, because there is nothing to resend.
 */
export async function resendSetPassword(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly personId: string }
): Promise<void> {
  await rateLimit(
    tenant,
    "resend_set_password",
    input.personId,
    "Resend set-password refused by the fixed-window rate limit"
  );

  const person = await readPersonRow(tenant, input.personId);

  if (
    person === undefined ||
    person.status !== "pending" ||
    person.accountType !== "local"
  ) {
    throw new AppError(CORE_ERRORS["invalid-input"]);
  }

  await sendSetPassword(tenant, {
    actorUserId: input.actorUserId,
    personId: input.personId,
    email: person.email,
    resend: true,
  });
}

/**
 * Resend the invitation email to a pending brokered person (R-41). It is refused for any other
 * person, because there is nothing to resend.
 */
export async function resendInvitation(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly personId: string }
): Promise<void> {
  await rateLimit(
    tenant,
    "resend_invitation",
    input.personId,
    "Resend invitation refused by the fixed-window rate limit"
  );

  const person = await readPersonRow(tenant, input.personId);

  if (
    person === undefined ||
    person.status !== "pending" ||
    person.accountType !== "brokered"
  ) {
    throw new AppError(CORE_ERRORS["invalid-input"]);
  }

  await sendInvitation(tenant, {
    actorUserId: input.actorUserId,
    personId: input.personId,
    email: person.email,
    name: person.name,
    resend: true,
  });
}

/** The roles a person may be given in Add person, system first then by name. */
export type AssignableRole = {
  readonly id: string;
  readonly name: string;
  readonly moduleId: string | null;
};

export async function listAssignableRoles(
  tenant: TenantContext
): Promise<readonly AssignableRole[]> {
  const result = await tenant.db.$client.query(
    `select r.id::text as id, r.name, r.module_id as "moduleId"
       from role r
      order by r.is_system desc, lower(r.name)`
  );

  // SAFETY: the statement selects exactly these three columns.
  return result.rows as readonly AssignableRole[];
}
