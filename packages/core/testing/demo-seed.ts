import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { isEqual } from "es-toolkit";

import { ASK_USER_ROLE } from "../src/lib/module-contract/system-roles.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { role, roleAssignment, tenantSettings, user } from "../src/schema.ts";

/**
 * A demo seed refused before it wrote anything. The message says what to do first, so the command
 * prints it as it is and exits without a stack.
 */
export class DemoSeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoSeedRefused";
  }
}

export type DemoAccessPlan = {
  readonly userId: string;
  readonly roles: {
    readonly toGrant: readonly string[];
    readonly present: readonly string[];
    /** Roles of listed modules that an earlier seed granted and the plan no longer holds. */
    readonly toRemove: readonly string[];
  };
  readonly reportingDate: { readonly from: string | null; readonly to: string };
  readonly models: {
    readonly from: ModelConnection;
    readonly to: ModelConnection;
  };
};

type ModelConnection = {
  readonly allowed: readonly string[];
  readonly chat: string | null;
  readonly document: string | null;
};

type DemoAccessInput = {
  readonly email: string;
  readonly moduleIds: readonly string[];
  /** One role per listed module, by name; the seed adds `Ask user`. */
  readonly roles: readonly string[];
  readonly reportingDate: string;
  /** The chat and document defaults and the other allowed models; the seed adds all to the allowed models it finds. */
  readonly models: {
    readonly chat: string;
    readonly document: string;
    readonly allowed: readonly string[];
  };
};

type Db = Pick<TenantContext, "db">;

/**
 * The plan, the ids of the roles still to grant and the ids of the assignments to remove, so the
 * seed writes what the plan names.
 */
async function readAccess(
  context: Db,
  input: DemoAccessInput
): Promise<{
  readonly plan: DemoAccessPlan;
  readonly grantIds: string[];
  readonly removeIds: string[];
}> {
  const [person] = await context.db
    .select({ id: user.id, isBreakGlass: user.isBreakGlass })
    .from(user)
    .where(eq(sql`lower(${user.email})`, input.email.toLowerCase()));

  if (person === undefined) {
    throw new DemoSeedRefused(
      "no person has the address in DEMO_ACCOUNT_EMAIL. The demo account signs in once, then you run the seed again."
    );
  }

  if (person.isBreakGlass) {
    throw new DemoSeedRefused(
      "the address in DEMO_ACCOUNT_EMAIL is the break-glass account, which holds no roles. Name the demo account instead."
    );
  }

  const planned = [...input.roles, ASK_USER_ROLE];

  const roles = await context.db
    .select({
      id: role.id,
      name: role.name,
      moduleId: role.moduleId,
      held: roleAssignment.id,
      createdBy: roleAssignment.createdByUserId,
    })
    .from(role)
    .leftJoin(
      roleAssignment,
      and(
        eq(roleAssignment.roleId, role.id),
        eq(roleAssignment.principalType, "user"),
        eq(roleAssignment.principalId, person.id),
        isNull(roleAssignment.scopeType)
      )
    )
    .where(
      or(
        inArray(role.moduleId, [...input.moduleIds]),
        inArray(role.name, planned)
      )
    )
    .orderBy(role.name);

  for (const moduleId of input.moduleIds) {
    if (!roles.some((row) => row.moduleId === moduleId)) {
      throw new DemoSeedRefused(
        `the ${moduleId} module has no roles on this deployment. Switching the module on in Admin > Modules creates them.`
      );
    }
  }

  for (const name of planned) {
    if (!roles.some((row) => row.name === name)) {
      throw new DemoSeedRefused(
        `the ${name} role does not exist on this deployment, so the seed cannot grant it.`
      );
    }
  }

  const [settings] = await context.db
    .select({
      reportingDate: tenantSettings.reportingDate,
      allowed: tenantSettings.allowedModels,
      chat: tenantSettings.chatModel,
      document: tenantSettings.documentModel,
    })
    .from(tenantSettings);

  if (settings === undefined) {
    throw new DemoSeedRefused(
      "this deployment has no settings row. Run genie-ops setup on it first, then run the seed again."
    );
  }

  const wanted = roles.filter((row) => planned.includes(row.name));
  const missing = wanted.filter((row) => row.held === null);

  // Only a grant an earlier seed made: direct, tenant-wide (the join), and with no creator. A
  // grant through Access carries its creator, so it stays.
  const extra = roles.filter(
    (row) =>
      !planned.includes(row.name) &&
      row.moduleId !== null &&
      input.moduleIds.includes(row.moduleId) &&
      row.held !== null &&
      row.createdBy === null
  );

  const { chat, document, allowed } = input.models;

  return {
    plan: {
      userId: person.id,
      roles: {
        toGrant: missing.map((row) => row.name),
        present: wanted
          .filter((row) => row.held !== null)
          .map((row) => row.name),
        toRemove: extra.map((row) => row.name),
      },
      reportingDate: { from: settings.reportingDate, to: input.reportingDate },
      models: {
        from: {
          allowed: settings.allowed,
          chat: settings.chat,
          document: settings.document,
        },
        to: {
          allowed: [
            ...new Set([...settings.allowed, ...allowed, chat, document]),
          ],
          chat,
          document,
        },
      },
    },
    grantIds: missing.map((row) => row.id),
    removeIds: extra.flatMap((row) => (row.held === null ? [] : [row.held])),
  };
}

/**
 * What the demo account's access needs: the person found by its lower-case address, the one named
 * role per module and `Ask user` that it does not yet hold tenant-wide and directly, the other
 * roles of the named modules that an earlier seed granted, the reporting date and the model
 * connection. Writes nothing.
 */
export async function planDemoAccess(
  context: Db,
  input: DemoAccessInput
): Promise<DemoAccessPlan> {
  return (await readAccess(context, input)).plan;
}

/** Whether the model connection differs from the one the seed writes. */
export function modelsDiffer(plan: DemoAccessPlan): boolean {
  return !isEqual(plan.models.from, plan.models.to);
}

/**
 * Removes the earlier seed's extra grants, grants the planned roles tenant-wide to the person
 * directly, and sets the reporting date and the model connection when they differ. A grant that an
 * administrator made in Access carries its creator and stays. The model key stays the administrator's to store. Written as `dev-session` writes its grants, so no audit row, notification or email
 * follows (P13); `assignRole` would send a notification and an email per role.
 */
export async function seedDemoAccess(
  context: Db,
  input: DemoAccessInput
): Promise<DemoAccessPlan> {
  const { plan, grantIds, removeIds } = await readAccess(context, input);

  await context.db.transaction(async (tx) => {
    if (removeIds.length > 0) {
      await tx
        .delete(roleAssignment)
        .where(inArray(roleAssignment.id, removeIds));
    }

    if (grantIds.length > 0) {
      await tx
        .insert(roleAssignment)
        .values(
          grantIds.map((roleId) => ({
            roleId,
            principalType: "user",
            principalId: plan.userId,
          }))
        )
        .onConflictDoNothing();
    }

    if (plan.reportingDate.from !== plan.reportingDate.to) {
      await tx
        .update(tenantSettings)
        .set({ reportingDate: plan.reportingDate.to });
    }

    if (modelsDiffer(plan)) {
      const { allowed, chat, document } = plan.models.to;

      await tx.update(tenantSettings).set({
        allowedModels: [...allowed],
        chatModel: chat,
        documentModel: document,
      });
    }
  });

  return plan;
}
