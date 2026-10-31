import { moduleAudit, type TenantContext, withTransaction } from "@genie/core";
import { and, eq, sql } from "drizzle-orm";

import { type DashboardConfig, dashboardConfigSchema } from "../src/config.ts";
import { dashboard } from "../src/schema.ts";

/**
 * A seed's dashboard for one owner, written directly with no chart gate, because a seed runs in
 * plain Node (plan D11); its test runs every panel through the gate. Imports no `.tsx` file, so
 * `node testing/seed-demo.ts` loads it. The config comes from the caller: the module knows no
 * other module's datasets.
 */
const audit = moduleAudit("analytics");

/** The owner's dashboard of that name, whatever its case and outer spaces (`dashboard_owner_name_key`). */
const sameName = (input: {
  readonly ownerUserId: string;
  readonly name: string;
}) =>
  and(
    eq(dashboard.ownerUserId, input.ownerUserId),
    sql`lower(btrim(${dashboard.name})) = lower(btrim(${input.name}))`
  );

export async function planDashboardSeed(
  tenant: TenantContext,
  input: { readonly ownerUserId: string; readonly name: string }
): Promise<{ readonly toWrite: 0 | 1; readonly present: 0 | 1 }> {
  const [row] = await tenant.db
    .select({ id: dashboard.id })
    .from(dashboard)
    .where(sameName(input));

  return row === undefined
    ? { toWrite: 1, present: 0 }
    : { toWrite: 0, present: 1 };
}

export async function seedDashboard(
  tenant: TenantContext,
  input: {
    readonly ownerUserId: string;
    readonly name: string;
    readonly config: DashboardConfig;
  }
): Promise<void> {
  const config = dashboardConfigSchema.parse(input.config);

  await withTransaction(tenant, async (tx) => {
    const [row] = await tx
      .insert(dashboard)
      .values({ ownerUserId: input.ownerUserId, name: input.name, config })
      .onConflictDoNothing()
      .returning({ id: dashboard.id });

    // Already present: the owner's name key held, so nothing was written.
    if (row === undefined) return;

    await audit(
      { tenant, tx },
      "analytics:dashboard-created",
      { type: "analytics-dashboard", id: row.id },
      "Created a dashboard."
    );
  });
}
