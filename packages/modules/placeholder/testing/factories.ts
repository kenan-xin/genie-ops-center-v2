import type { TenantContext } from "@genie/core";

import { placeholderRecord } from "../src/schema.ts";

export type PlaceholderRecordRow = typeof placeholderRecord.$inferSelect;

/**
 * Inserts one real row and answers it. The module owns the factories for its own tables, and
 * core never imports this file (R-39). It writes through the tenant context, so a test proves
 * the same path the product uses.
 */
export async function insertPlaceholderRecord(
  tenant: TenantContext,
  values: { readonly label?: string } = {}
): Promise<PlaceholderRecordRow> {
  const [row] = await tenant.db
    .insert(placeholderRecord)
    .values({ label: values.label ?? "A placeholder record" })
    .returning();

  if (row === undefined) {
    throw new Error("the insert returned no row");
  }

  return row;
}
