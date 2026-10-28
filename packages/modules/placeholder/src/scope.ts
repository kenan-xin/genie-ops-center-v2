import type { ScopeSet } from "@genie/core";
import { inArray, sql, type SQL } from "drizzle-orm";

import { placeholderRecord } from "./schema.ts";

/**
 * The scope filter over this module's records (DEC-39): `all` reads every row, `none` reads
 * nothing, and `some` reads the records its scopes name. The ids are compared as text, so a
 * scope id that is not a uuid matches nothing instead of failing.
 */
export function recordScope(scopes: ScopeSet): SQL | undefined {
  if (scopes.kind === "all") return undefined;

  if (scopes.kind === "none") return sql`false`;

  // Only this module's own record type carries a scope; another type names another module's record.
  const ids = scopes.scopes
    .filter((scope) => scope.type === "placeholder-record")
    .map((scope) => scope.id);

  return inArray(sql`${placeholderRecord.id}::text`, ids);
}
