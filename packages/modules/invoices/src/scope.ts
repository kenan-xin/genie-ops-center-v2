import type { ScopeSet } from "@genie/core";
import { type AnyColumn, inArray, or, sql, type SQL } from "drizzle-orm";

import { RECORD_TYPES } from "./record-types.ts";
import { customer, invoice, payment } from "./schema.ts";

/**
 * The read scope filters (DEC-39): `all` reads every row, `none` reads nothing, and `some` reads
 * the records its scopes name or whose customer they name, as the record types' parent mapping
 * does. Ids are compared as text, so a scope id that is not a uuid matches nothing.
 */
function scoped(
  scopes: ScopeSet,
  match: readonly (readonly [type: string, column: AnyColumn])[]
): SQL | undefined {
  if (scopes.kind === "all") return undefined;

  if (scopes.kind === "none") return sql`false`;

  return or(
    ...match.map(([type, column]) =>
      inArray(
        sql`${column}::text`,
        scopes.scopes.filter((scope) => scope.type === type).map((s) => s.id)
      )
    )
  );
}

export const invoiceScope = (scopes: ScopeSet) =>
  scoped(scopes, [
    [RECORD_TYPES.invoice, invoice.id],
    [RECORD_TYPES.customer, invoice.customerId],
  ]);

export const paymentScope = (scopes: ScopeSet) =>
  scoped(scopes, [
    [RECORD_TYPES.payment, payment.id],
    [RECORD_TYPES.customer, payment.customerId],
  ]);

export const customerScope = (scopes: ScopeSet) =>
  scoped(scopes, [[RECORD_TYPES.customer, customer.id]]);
