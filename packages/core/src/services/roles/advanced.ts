import { and, eq } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Scope } from "../../lib/module-contract/keys.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import {
  ASK_USER_ROLE,
  AUDITOR_ROLE,
  TENANT_ADMINISTRATOR_ROLE,
} from "../../lib/module-contract/system-roles.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { role, roleAssignment } from "../../schema.ts";
import {
  assertAdministratorRemains,
  countActiveAdministrators,
  lockAdministratorGuard,
} from "../authorization/administrators.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import {
  assignRoleInTransaction,
  removeAssignmentInTransaction,
} from "../authorization/role-assignment.ts";
import {
  type AccessRecipient,
  assertManagesAllRoles,
  recipientDisabled,
} from "./effective-access.ts";
import { byName, moduleRoles } from "./grants.ts";
import { entitlementByModule, type RolesModule } from "./index.ts";

/** The staged changes of one Advanced access save for one recipient (R-37c). */
export type AdvancedChanges = {
  readonly add: readonly {
    readonly roleId: string;
    readonly scope: Scope | null;
  }[];
  readonly remove: readonly { readonly assignmentId: string }[];
};

/** Why Remove is disabled in place on one assignment (R-38, AD7). */
export type RemovalGuard = {
  readonly assignmentId: string;
  readonly reason: "self-protection" | "last-administrator";
};

/** One role that Advanced access can add (AD8). */
export type AdvancedOption = {
  readonly roleId: string;
  readonly roleName: string;
  readonly kind: "system" | "custom";
  readonly moduleId: string | null;
  /** The module display name, or "Core administration" for a core role. */
  readonly moduleName: string;
  readonly enabled: boolean;
  readonly wholeTenant: boolean;
  /** The record type a scope of this option points at, or null for the whole tenant. */
  readonly recordType: string | null;
};

/** The three groups of the Add a role picker (AD8). */
export type AdvancedCatalogue = {
  readonly core: readonly AdvancedOption[];
  readonly record: readonly AdvancedOption[];
  readonly custom: readonly AdvancedOption[];
};

/**
 * The recipient's direct `Tenant administrator` assignments whose Remove the screen disables in
 * place (R-38, AD7): the caller's own row, else the last active administrator path. It reads saved
 * rows only, so the writer's check stays the backstop for a stale screen.
 */
export async function readAdministratorGuards(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly recipient: AccessRecipient;
}): Promise<readonly RemovalGuard[]> {
  await assertManagesAllRoles(input.caller);
  await recipientDisabled(input.tenant, input.recipient);

  const { recipient } = input;

  return withTransaction(input.tenant, async (tx) => {
    const rows = await tx
      .select({ id: roleAssignment.id })
      .from(roleAssignment)
      .innerJoin(role, eq(role.id, roleAssignment.roleId))
      .where(
        and(
          eq(role.name, TENANT_ADMINISTRATOR_ROLE),
          eq(role.isSystem, true),
          eq(roleAssignment.principalType, recipient.type),
          eq(roleAssignment.principalId, recipient.id)
        )
      );

    const guards: RemovalGuard[] = [];

    for (const row of rows) {
      if (recipient.type === "user" && recipient.id === input.caller.userId) {
        guards.push({ assignmentId: row.id, reason: "self-protection" });
      } else if (
        // One count at a time on the one transaction.
        // oxlint-disable-next-line no-await-in-loop
        (await countActiveAdministrators(tx, {
          exceptAssignmentId: row.id,
        })) === 0
      ) {
        guards.push({ assignmentId: row.id, reason: "last-administrator" });
      }
    }

    return guards;
  });
}

const CORE_ADMINISTRATION = "Core administration";

/** `Tenant administrator`, then `Auditor`, then any other core system role by name. */
const CORE_ORDER: readonly string[] = [TENANT_ADMINISTRATOR_ROLE, AUDITOR_ROLE];

function coreRank(name: string): number {
  const index = CORE_ORDER.indexOf(name);

  return index === -1 ? CORE_ORDER.length : index;
}

/**
 * The one record type of a module that takes a record scope in Advanced access (AD1, Spec 2 U3):
 * the module declares exactly one record type, and that type declares `search`. Else null.
 */
export function scopeRecordType(
  module: Pick<Module, "recordTypes">
): string | null {
  const [only, ...rest] = module.recordTypes;

  return only?.search !== undefined && rest.length === 0 ? only.type : null;
}

/**
 * The roles Advanced access can add, in the picker's groups (AD8). Core holds the core system
 * roles other than `Ask user`, which is a Grants row. Module role at one record holds the system
 * roles of each module with a scope record type, by module name. Custom roles holds every custom
 * role of core or of a compiled module, by name.
 */
export async function readAdvancedCatalogue(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
}): Promise<AdvancedCatalogue> {
  await assertManagesAllRoles(input.caller);

  const result = await input.tenant.db.$client.query<NamedRole>(
    `select r.id::text as id, r.name, r.is_system as "isSystem", r.module_id as "moduleId"
       from role r`
  );

  const core = result.rows
    .filter(
      (row) =>
        row.isSystem && row.moduleId === null && row.name !== ASK_USER_ROLE
    )
    .toSorted(
      (a, b) =>
        coreRank(a.name) - coreRank(b.name) || a.name.localeCompare(b.name)
    )
    .map((row): AdvancedOption => ({
      roleId: row.id,
      roleName: row.name,
      kind: "system",
      moduleId: null,
      moduleName: CORE_ADMINISTRATION,
      enabled: true,
      wholeTenant: true,
      recordType: null,
    }));

  const entitled = await entitlementByModule(input.tenant, input.modules);

  const record = input.modules
    .filter((module) => scopeRecordType(module) !== null)
    .toSorted((a, b) =>
      a.identity.displayName.localeCompare(b.identity.displayName)
    )
    .flatMap((module) => {
      const moduleId = module.identity.id;

      return moduleRoles(
        module,
        result.rows.filter((row) => row.isSystem && row.moduleId === moduleId)
      ).map((owned): AdvancedOption => ({
        roleId: owned.id,
        roleName: owned.name,
        kind: "system",
        moduleId,
        moduleName: module.identity.displayName,
        enabled: entitled.get(moduleId) === true,
        wholeTenant: false,
        recordType: scopeRecordType(module),
      }));
    });

  const compiled = new Map(
    input.modules.map((module) => [module.identity.id, module])
  );

  const custom = result.rows
    .filter(
      (row) =>
        !row.isSystem && (row.moduleId === null || compiled.has(row.moduleId))
    )
    .toSorted(byName)
    .map((row): AdvancedOption => {
      const module =
        row.moduleId === null ? undefined : compiled.get(row.moduleId);

      return {
        roleId: row.id,
        roleName: row.name,
        kind: "custom",
        moduleId: row.moduleId,
        moduleName: module?.identity.displayName ?? CORE_ADMINISTRATION,
        enabled:
          module === undefined || entitled.get(module.identity.id) === true,
        wholeTenant: true,
        recordType: module === undefined ? null : scopeRecordType(module),
      };
    });

  return { core, record, custom };
}

type NamedRole = {
  readonly id: string;
  readonly name: string;
  readonly isSystem: boolean;
  readonly moduleId: string | null;
};

const scopeKey = (roleId: string, scope: Scope | null) =>
  scope === null ? roleId : `${roleId}\u0000${scope.type}\u0000${scope.id}`;

const invalidInput = () => new AppError(CORE_ERRORS["invalid-input"]);

type AddCheck = {
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly entitled: ReadonlyMap<string, boolean>;
};

/**
 * The module checks of a module role (AD5): its module is compiled (`not-found`) and on
 * (`module-disabled`). A scope must be a record type of that module (`invalid-input`) and a record
 * its resolver finds (`not-found`). A role that needs a scope and has none is `invalid-input`.
 */
async function assertModuleScope(
  check: AddCheck,
  moduleId: string,
  scope: Scope | null,
  needsScope: boolean
): Promise<void> {
  const module = check.modules.find(
    (candidate) => candidate.identity.id === moduleId
  );

  if (module === undefined) {
    throw new AppError(CORE_ERRORS["not-found"], {
      cause: new Error(`No compiled module ${moduleId}`),
    });
  }

  if (check.entitled.get(moduleId) !== true) {
    throw new AppError(CORE_ERRORS["module-disabled"]);
  }

  if (scope === null) {
    if (needsScope) throw invalidInput();

    return;
  }

  if (!module.recordTypes.some((entry) => entry.type === scope.type)) {
    throw invalidInput();
  }

  if ((await check.caller.recordOf(scope)) === undefined) {
    throw new AppError(CORE_ERRORS["not-found"], {
      cause: new Error(`No record ${scope.type} ${scope.id}`),
    });
  }
}

/**
 * Refuses an add Advanced access does not take (AD5). A core role, system or custom, goes to the
 * whole tenant, except `Ask user`, which is a Grants row like a whole-tenant module system role. A
 * module system role goes to one record of its module, and a module custom role to the whole
 * tenant or one record.
 */
async function assertAddable(
  check: AddCheck,
  named: NamedRole,
  scope: Scope | null
): Promise<void> {
  if (named.moduleId === null) {
    if (scope !== null || (named.isSystem && named.name === ASK_USER_ROLE)) {
      throw invalidInput();
    }

    return;
  }

  await assertModuleScope(check, named.moduleId, scope, named.isSystem);
}

async function readNamedRoles(
  tenant: TenantContext,
  roleIds: readonly string[]
): Promise<readonly NamedRole[]> {
  const result = await tenant.db.$client.query<NamedRole>(
    `select r.id::text as id, r.name, r.is_system as "isSystem", r.module_id as "moduleId"
       from role r where r.id = any($1::uuid[])`,
    [roleIds]
  );

  return result.rows;
}

/**
 * Refuses one grant that Advanced access would refuse (d8l5.51): a caller who does not manage all
 * roles (`forbidden`), a missing role (`not-found`), and an add `assertAddable` refuses.
 */
export async function assertAssignable(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly roleId: string;
  readonly scope: Scope | null;
}): Promise<void> {
  await assertManagesAllRoles(input.caller);

  const [found] = await readNamedRoles(input.tenant, [input.roleId]);

  if (found === undefined) {
    throw new AppError(CORE_ERRORS["not-found"], {
      cause: new Error(`No role ${input.roleId}`),
    });
  }

  await assertAddable(
    {
      caller: input.caller,
      modules: input.modules,
      entitled: await entitlementByModule(input.tenant, input.modules),
    },
    found,
    input.scope
  );
}

/**
 * Applies the Advanced access adds and removals for one recipient in one transaction (R-37c, AD4).
 * Every write goes through the one assignment writer (DEC-39), and the R-38 check runs once on the
 * final state. A refused entry refuses the whole save, and nothing is written.
 */
export async function saveAdvanced(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly recipient: AccessRecipient;
  readonly changes: AdvancedChanges;
}): Promise<void> {
  await assertManagesAllRoles(input.caller);
  // Refuses an erased person, the break-glass account and an unknown id (R-39).
  await recipientDisabled(input.tenant, input.recipient);

  const { add, remove } = input.changes;

  const removed = remove.map((entry) => entry.assignmentId);
  const added = add.map((entry) => scopeKey(entry.roleId, entry.scope));

  if (
    new Set(removed).size !== removed.length ||
    new Set(added).size !== added.length
  ) {
    throw new AppError(CORE_ERRORS["invalid-input"]);
  }

  const roles = new Map(
    (
      await readNamedRoles(input.tenant, [
        ...new Set(add.map((entry) => entry.roleId)),
      ])
    ).map((row) => [row.id, row])
  );

  const check: AddCheck = {
    caller: input.caller,
    modules: input.modules,
    entitled: await entitlementByModule(input.tenant, input.modules),
  };

  for (const entry of add) {
    const found = roles.get(entry.roleId);

    if (found === undefined) {
      throw new AppError(CORE_ERRORS["not-found"], {
        cause: new Error(`No role ${entry.roleId}`),
      });
    }

    // One add at a time; the principal memoises each record.
    // oxlint-disable-next-line no-await-in-loop
    await assertAddable(check, found, entry.scope);
  }

  const { recipient } = input;
  const actorUserId = input.caller.userId;

  await withTransaction(input.tenant, async (tx) => {
    await lockAdministratorGuard(tx);

    // One statement at a time on the one transaction.
    /* oxlint-disable no-await-in-loop */
    for (const entry of remove) {
      await removeAssignmentInTransaction(input.tenant, tx, {
        actorUserId,
        assignmentId: entry.assignmentId,
        expect: recipient,
      });
    }

    const held = new Set(
      (
        await tx
          .select({
            roleId: roleAssignment.roleId,
            scopeType: roleAssignment.scopeType,
            scopeId: roleAssignment.scopeId,
          })
          .from(roleAssignment)
          .where(
            and(
              eq(roleAssignment.principalType, recipient.type),
              eq(roleAssignment.principalId, recipient.id)
            )
          )
      ).map((row) =>
        scopeKey(
          row.roleId,
          row.scopeType !== null && row.scopeId !== null
            ? { type: row.scopeType, id: row.scopeId }
            : null
        )
      )
    );

    for (const entry of add) {
      // An add the recipient holds already, directly at the same scope, is skipped.
      if (!held.has(scopeKey(entry.roleId, entry.scope))) {
        await assignRoleInTransaction(input.tenant, tx, {
          actorUserId,
          roleId: entry.roleId,
          principal: recipient,
          scope: entry.scope,
        });
      }
    }
    /* oxlint-enable no-await-in-loop */

    // R-38: the one check, once, on the final state of the batch.
    if (remove.length > 0) await assertAdministratorRemains(tx);
  });
}
