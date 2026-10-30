import { and, eq, inArray, isNull, sql } from "drizzle-orm";

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
};

type DemoAccessInput = {
  readonly email: string;
  readonly moduleIds: readonly string[];
  readonly reportingDate: string;
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
    .select({ reportingDate: tenantSettings.reportingDate })
    .from(tenantSettings);

  if (settings === undefined) {
    throw new DemoSeedRefused(
      "this deployment has no settings row. Run genie-ops setup on it first, then run the seed again."
    );
  }

  const missing = roles.filter((row) => row.held === null);

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
    },
    grantIds: missing.map((row) => row.id),
  };
}

/**
 * What the demo account's access needs: the person found by its lower-case address, every role of
 * the named modules it does not yet hold tenant-wide and directly, and the reporting date. Writes
 * nothing.
 */
export async function planDemoAccess(
  context: Db,
  input: DemoAccessInput
): Promise<DemoAccessPlan> {
  return (await readAccess(context, input)).plan;
}

/**
 * Grants the planned roles tenant-wide to the person directly and sets the reporting date when it
 * differs. Written as `dev-session` writes its grants, so no audit row, notification or email
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
  });

  return plan;
}
