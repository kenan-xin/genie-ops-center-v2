import { and, eq } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { ASK_USER_ROLE } from "../../lib/module-contract/system-roles.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { roleAssignment } from "../../schema.ts";
import {
  assertAdministratorRemains,
  lockAdministratorGuard,
} from "../authorization/administrators.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import {
  assignRoleInTransaction,
  removeAssignmentInTransaction,
} from "../authorization/role-assignment.ts";
import { ASK_PERMISSION } from "../authorization/roles.ts";
import { groupLabelSql } from "../groups/label.ts";
import {
  type AccessRecipient,
  assertManagesAllRoles,
  recipientDisabled,
} from "./effective-access.ts";
import { entitlementByModule, type RolesModule } from "./index.ts";

/** The Core row that `Ask user` grants. A module id is kebab-case, so it never takes this key. */
export const ASK_ROW = "core:ask";

export type GrantRole = {
  readonly id: string;
  readonly name: string;
  readonly kind: "system" | "custom";
};

/** One row of the Grants transfer list: a module, or the Core row for Ask (P2). */
export type GrantRow = {
  /** The module id, or ASK_ROW. */
  readonly id: string;
  /** The module display name, or "Ask". */
  readonly name: string;
  /** `identity.description`, or a fixed line for Ask. */
  readonly description: string | null;
  readonly group: "modules" | "core";
  /** The entitlement. Ask is core, so always true. */
  readonly enabled: boolean;
  /** `<id>:use`, or `core:ask:use`. */
  readonly useKey: string;
  /** The role choice, in order (P3). */
  readonly roles: readonly GrantRole[];
  /** Null only when no role row carries the default name. */
  readonly defaultRoleId: string | null;
};

export type GrantRecipients = {
  readonly groups: readonly {
    readonly id: string;
    readonly name: string;
    readonly memberCount: number;
  }[];
  readonly people: readonly {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  }[];
};

type RawRole = {
  readonly id: string;
  readonly name: string;
  readonly isSystem: boolean;
  readonly moduleId: string | null;
};

const byName = (a: { readonly name: string }, b: { readonly name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

function toGrantRole(raw: RawRole): GrantRole {
  return {
    id: raw.id,
    name: raw.name,
    kind: raw.isSystem ? "system" : "custom",
  };
}

/**
 * The role choice of one module (P3): its default access role, then its other declared roles in
 * declared order, then every other role of the module by name, custom roles included (A6).
 */
function moduleRoles(
  module: RolesModule,
  owned: readonly RawRole[]
): readonly GrantRole[] {
  const declared = [
    module.defaultAccessRole,
    ...module.defaultRoles.map((entry) => entry.name),
  ];

  const rank = (name: string) => {
    const index = declared.indexOf(name);

    return index === -1 ? declared.length : index;
  };

  return owned
    .toSorted((a, b) => rank(a.name) - rank(b.name) || byName(a, b))
    .map(toGrantRole);
}

/**
 * The Grants rows (R-37a, P2): every module that declares a default access role, by display name,
 * then the Core row of Ask. A module row owns every role whose `module_id` is the module. The Ask
 * row owns only the system role `Ask user`, never `Tenant administrator`, which also carries
 * `core:ask:use`.
 */
export async function readGrantCatalogue(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
}): Promise<readonly GrantRow[]> {
  await assertManagesAllRoles(input.caller);

  const listed = input.modules
    .filter((module) => module.defaultAccessRole !== undefined)
    .toSorted((a, b) =>
      a.identity.displayName.localeCompare(b.identity.displayName)
    );

  const entitled = await entitlementByModule(input.tenant, input.modules);

  const result = await input.tenant.db.$client.query<RawRole>(
    `select r.id::text as id, r.name, r.is_system as "isSystem", r.module_id as "moduleId"
       from role r
      where r.module_id = any($1::text[])
         or (r.name = $2 and r.is_system and r.module_id is null)`,
    [listed.map((module) => module.identity.id), ASK_USER_ROLE]
  );

  const rows: GrantRow[] = listed.map((module) => {
    const roles = moduleRoles(
      module,
      result.rows.filter((raw) => raw.moduleId === module.identity.id)
    );

    return {
      id: module.identity.id,
      name: module.identity.displayName,
      description: module.identity.description ?? null,
      group: "modules",
      enabled: entitled.get(module.identity.id) === true,
      useKey: `${module.identity.id}:use`,
      roles,
      defaultRoleId:
        roles.find((role) => role.name === module.defaultAccessRole)?.id ??
        null,
    };
  });

  const ask = result.rows
    .filter((raw) => raw.moduleId === null)
    .map(toGrantRole);

  rows.push({
    id: ASK_ROW,
    name: "Ask",
    description: "The agent chat on every page.",
    group: "core",
    enabled: true,
    useKey: ASK_PERMISSION,
    roles: ask,
    defaultRoleId: ask[0]?.id ?? null,
  });

  return rows;
}

/** The staged changes of one Grants save (P1, P7, P8). */
export type GrantChanges = {
  readonly add: readonly { readonly row: string; readonly roleId: string }[];
  readonly change: readonly {
    readonly row: string;
    readonly assignmentId: string;
    readonly roleId: string;
  }[];
  readonly remove: readonly { readonly row: string }[];
};

function notFound(reason: string): AppError {
  return new AppError(CORE_ERRORS["not-found"], { cause: new Error(reason) });
}

/**
 * Applies Add, the role swap and Remove for one recipient in one transaction (R-37a, P1). Every
 * write goes through the one assignment writer (DEC-39), so the audit rows and the role events are
 * the same as on every other screen. A refused entry refuses the whole save, and nothing is
 * written.
 */
export async function saveGrants(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly recipient: AccessRecipient;
  readonly changes: GrantChanges;
}): Promise<void> {
  await assertManagesAllRoles(input.caller);
  // Refuses an erased person, the break-glass account and an unknown id (R-39).
  await recipientDisabled(input.tenant, input.recipient);

  const { add, change, remove } = input.changes;

  const named = [...add, ...change, ...remove].map((entry) => entry.row);

  if (new Set(named).size !== named.length) {
    throw new AppError(CORE_ERRORS["invalid-input"]);
  }

  const catalogue = new Map(
    (await readGrantCatalogue(input)).map((row) => [row.id, row])
  );

  /** The role ids a row owns, or `not-found` for an unknown row. */
  const rolesOf = (rowId: string): ReadonlySet<string> => {
    const row = catalogue.get(rowId);

    if (row === undefined) throw notFound(`No Grants row ${rowId}`);

    return new Set(row.roles.map((role) => role.id));
  };

  for (const entry of [...add, ...change]) {
    if (!rolesOf(entry.row).has(entry.roleId)) {
      throw notFound(`Role ${entry.roleId} is not a role of ${entry.row}`);
    }

    // R-37a, P9: a switched-off module takes no new grant. Remove stays open (R-33d).
    if (catalogue.get(entry.row)?.enabled !== true) {
      throw new AppError(CORE_ERRORS["module-disabled"]);
    }
  }

  for (const entry of remove) rolesOf(entry.row);

  const { recipient } = input;

  const actorUserId = input.caller.userId;

  await withTransaction(input.tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    let deleted = false;

    // Read again before each step, so a swap sees its own delete.
    const held = () =>
      tx
        .select({
          id: roleAssignment.id,
          roleId: roleAssignment.roleId,
          scopeType: roleAssignment.scopeType,
        })
        .from(roleAssignment)
        .where(
          and(
            eq(roleAssignment.principalType, recipient.type),
            eq(roleAssignment.principalId, recipient.id)
          )
        );

    const grant = async (roleId: string) => {
      const tenantWide = (await held()).some(
        (row) => row.roleId === roleId && row.scopeType === null
      );

      if (!tenantWide) {
        await assignRoleInTransaction(input.tenant, tx, {
          actorUserId,
          roleId,
          principal: recipient,
        });
      }
    };

    const take = async (assignmentId: string) => {
      await removeAssignmentInTransaction(input.tenant, tx, {
        actorUserId,
        assignmentId,
        expect: recipient,
      });
      deleted = true;
    };

    // One statement at a time on the one transaction.
    /* oxlint-disable no-await-in-loop */
    for (const entry of remove) {
      const owned = rolesOf(entry.row);

      // P5: every scope, so a record-scoped role does not keep the module open.
      for (const row of await held()) {
        if (owned.has(row.roleId)) await take(row.id);
      }
    }

    for (const entry of change) {
      const owned = rolesOf(entry.row);

      const shown = (await held()).find(
        (row) =>
          row.id === entry.assignmentId &&
          row.scopeType === null &&
          owned.has(row.roleId)
      );

      if (shown === undefined) {
        throw notFound(
          `Assignment ${entry.assignmentId} is not a whole-tenant role of ${entry.row}`
        );
      }

      await take(shown.id);
      await grant(entry.roleId);
    }

    for (const entry of add) await grant(entry.roleId);
    /* oxlint-enable no-await-in-loop */

    // R-38: the one check, once, on the final state of the batch.
    if (deleted) await assertAdministratorRemains(tx);
  });
}

/**
 * The recipients the Grants picker offers (P12, R-39): groups that are not archived, with their
 * member count, and people who are not erased, never the break-glass account.
 */
export async function readGrantRecipients(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
}): Promise<GrantRecipients> {
  await assertManagesAllRoles(input.caller);

  const [groups, people] = await Promise.all([
    input.tenant.db.$client.query<GrantRecipients["groups"][number]>(
      `select g.id::text as id, ${groupLabelSql("g")} as name,
              (select count(*) from group_member m join "user" u on u.id = m.user_id
                where m.group_id = g.id and u.is_break_glass = false)::int as "memberCount"
         from "group" g
        where g.archived_at is null`
    ),
    input.tenant.db.$client.query<GrantRecipients["people"][number]>(
      `select u.id, u.name, u.email from "user" u
        where u.is_break_glass = false and u.erased_at is null`
    ),
  ]);

  return {
    groups: groups.rows.toSorted(byName),
    people: people.rows.toSorted(byName),
  };
}
