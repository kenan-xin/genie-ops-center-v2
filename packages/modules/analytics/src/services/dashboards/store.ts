import type { ModuleRequestContext } from "@genie/core";
import { desc, eq } from "drizzle-orm";

import type { DashboardSummary } from "../../contract.ts";
import { dashboard } from "../../schema.ts";

/** The caller's own dashboards, the last changed first. Another owner's row never reads (R-48). */
export async function listOwnDashboards(
  ctx: ModuleRequestContext
): Promise<DashboardSummary[]> {
  const rows = await ctx.tenant.db
    .select({
      id: dashboard.id,
      name: dashboard.name,
      config: dashboard.config,
      updatedAt: dashboard.updatedAt,
    })
    .from(dashboard)
    .where(eq(dashboard.ownerUserId, ctx.caller.userId))
    .orderBy(desc(dashboard.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    panelCount: row.config.panels.length,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
