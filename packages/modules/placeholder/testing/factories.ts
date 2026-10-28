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
  values: {
    readonly id?: string;
    readonly label?: string;
    readonly amountCents?: number;
    readonly currency?: string;
    readonly recordedOn?: string;
    readonly quantity?: number;
  } = {}
): Promise<PlaceholderRecordRow> {
  const [row] = await tenant.db
    .insert(placeholderRecord)
    .values({
      id: values.id,
      label: values.label ?? "A placeholder record",
      recordedOn: values.recordedOn ?? null,
      amountCents: values.amountCents ?? null,
      currency: values.currency ?? null,
      quantity: values.quantity ?? null,
    })
    .returning();

  if (row === undefined) {
    throw new Error("the insert returned no row");
  }

  return row;
}
