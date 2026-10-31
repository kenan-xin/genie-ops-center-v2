import { randomBytes } from "node:crypto";

import type { TenantContext } from "@genie/core";

import {
  type DashboardConfig,
  EMPTY_DASHBOARD_CONFIG,
  type UndoEntry,
} from "../src/config.ts";
import { dashboard } from "../src/schema.ts";

/**
 * Inserts one `dashboard` row directly, with no gate, and answers its id. The module owns the
 * factories for its own tables, and core never imports this file (R-39).
 */
export async function insertDashboard(
  tenant: TenantContext,
  input: {
    readonly ownerUserId: string;
    readonly id?: string;
    readonly name?: string;
    readonly config?: DashboardConfig;
    readonly undo?: readonly UndoEntry[];
    readonly version?: number;
    readonly updatedAt?: Date;
  }
): Promise<string> {
  const [row] = await tenant.db
    .insert(dashboard)
    .values({
      // Drizzle writes the column default for an undefined value.
      id: input.id,
      ownerUserId: input.ownerUserId,
      name: input.name ?? `Dashboard ${randomBytes(4).toString("hex")}`,
      config: input.config ?? EMPTY_DASHBOARD_CONFIG,
      undo: input.undo ?? [],
      version: input.version ?? 1,
      updatedAt: input.updatedAt,
    })
    .returning({ id: dashboard.id });

  if (row === undefined) throw new Error("the insert returned no row");

  return row.id;
}
