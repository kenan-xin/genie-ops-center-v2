import { randomUUID } from "node:crypto";

import type { Scope } from "../src/lib/module-contract/keys.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import {
  group,
  groupMember,
  role,
  roleAssignment,
  user,
} from "../src/schema.ts";

/**
 * Real rows for the real evaluator: a person, a role, a group and an assignment, written with
 * Drizzle on the context's own pool. Sign-in does not exist yet (S2-04), so a test builds its
 * people here; nothing fakes a permission answer and no principal bypasses the loader.
 */
type Db = Pick<TenantContext, "db">;

export async function insertUser(
  context: Db,
  values: Partial<typeof user.$inferInsert> = {}
): Promise<string> {
  const id = values.id ?? randomUUID();

  await context.db.insert(user).values({
    name: `Person ${id}`,
    email: `${id}@example.invalid`,
    status: "active",
    ...values,
    id,
  });

  return id;
}

export async function insertRole(
  context: Db,
  values: { readonly permissions: readonly string[]; readonly name?: string }
): Promise<string> {
  const [row] = await context.db
    .insert(role)
    .values({
      name: values.name ?? `Role ${randomUUID()}`,
      permissions: [...values.permissions],
    })
    .returning({ id: role.id });

  if (row === undefined) throw new Error("the role insert returned no row");

  return row.id;
}

export async function insertGroup(
  context: Db,
  members: readonly string[],
  values: Partial<typeof group.$inferInsert> = {}
): Promise<string> {
  const [row] = await context.db
    .insert(group)
    .values({ name: `Group ${randomUUID()}`, source: "local", ...values })
    .returning({ id: group.id });

  if (row === undefined) throw new Error("the group insert returned no row");

  if (members.length > 0) {
    await context.db.insert(groupMember).values(
      members.map((userId) => ({
        groupId: row.id,
        userId,
        source: values.source ?? "local",
      }))
    );
  }

  return row.id;
}

export async function assignRole(
  context: Db,
  values: {
    readonly roleId: string;
    readonly principal: {
      readonly type: "user" | "group";
      readonly id: string;
    };
    readonly scope?: Scope | undefined;
  }
): Promise<string> {
  const [row] = await context.db
    .insert(roleAssignment)
    .values({
      roleId: values.roleId,
      principalType: values.principal.type,
      principalId: values.principal.id,
      scopeType: values.scope?.type ?? null,
      scopeId: values.scope?.id ?? null,
    })
    .returning({ id: roleAssignment.id });

  if (row === undefined) {
    throw new Error("the assignment insert returned no row");
  }

  return row.id;
}

/**
 * A new person holding `permissions` through one role assigned directly, tenant-wide or at
 * `scope`. The common case of a module test that needs one authorized caller.
 */
export async function insertPersonWith(
  context: Db,
  permissions: readonly string[],
  scope?: Scope
): Promise<{
  readonly userId: string;
  readonly roleId: string;
  readonly assignmentId: string;
}> {
  const userId = await insertUser(context);
  const roleId = await insertRole(context, { permissions });

  const assignmentId = await assignRole(context, {
    roleId,
    principal: { type: "user", id: userId },
    scope,
  });

  return { userId, roleId, assignmentId };
}
