import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { isEqual } from "es-toolkit";

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
  readonly reportingDate: string;
  /** The chat and document defaults; the seed adds both to the allowed models it finds. */
  readonly models: { readonly chat: string; readonly document: string };
};

type Db = Pick<TenantContext, "db">;

/** The plan, and the ids of the roles still to grant, so the seed writes what the plan names. */
async function readAccess(
  context: Db,
  input: DemoAccessInput
): Promise<{ readonly plan: DemoAccessPlan; readonly grantIds: string[] }> {
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

  const roles = await context.db
    .select({
      id: role.id,
      name: role.name,
      moduleId: role.moduleId,
      held: roleAssignment.id,
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
    .where(inArray(role.moduleId, [...input.moduleIds]))
    .orderBy(role.name);

  for (const moduleId of input.moduleIds) {
    if (!roles.some((row) => row.moduleId === moduleId)) {
      throw new DemoSeedRefused(
        `the ${moduleId} module has no roles on this deployment. Switching the module on in Admin > Modules creates them.`
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

  const missing = roles.filter((row) => row.held === null);
  const { chat, document } = input.models;

  return {
    plan: {
      userId: person.id,
      roles: {
        toGrant: missing.map((row) => row.name),
        present: roles
          .filter((row) => row.held !== null)
          .map((row) => row.name),
      },
      reportingDate: { from: settings.reportingDate, to: input.reportingDate },
      models: {
        from: {
          allowed: settings.allowed,
          chat: settings.chat,
          document: settings.document,
        },
        to: {
          allowed: [...new Set([...settings.allowed, chat, document])],
          chat,
          document,
        },
      },
    },
    grantIds: missing.map((row) => row.id),
  };
}

/**
 * What the demo account's access needs: the person found by its lower-case address, every role of
 * the named modules it does not yet hold tenant-wide and directly, the reporting date and the model
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
 * Grants the planned roles tenant-wide to the person directly, and sets the reporting date and the
 * model connection when they differ. The model key stays the administrator's to store. Written as `dev-session` writes its grants, so no audit row, notification or email
 * follows (P13); `assignRole` would send a notification and an email per role.
 */
export async function seedDemoAccess(
  context: Db,
  input: DemoAccessInput
): Promise<DemoAccessPlan> {
  const { plan, grantIds } = await readAccess(context, input);

  await context.db.transaction(async (tx) => {
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
