import { createModuleTRPC, scopesFor, TRPCError } from "@genie/core";
import { inArray, sql } from "drizzle-orm";

import { placeholderRecord } from "./schema.ts";

const t = createModuleTRPC("placeholder");

/**
 * The module's one router, mounted under the module id when the module is enabled. The list read
 * asks `scopesFor()` first and reads only the records the person's grants cover, only through
 * `ctx.tenant.db` (DEC-34, DEC-39): a tenant-wide grant reads every row, a record-scoped grant
 * reads the records it names, and no grant is refused before any read. The placeholder record
 * declares no parent type, so only its own scopes filter the list. The
 * `createModuleTRPC` base refuses the call with `module-disabled` when the placeholder
 * entitlement is off, before any resolver runs (d1y). The dot in the path `placeholder.read` is
 * a tRPC path, not the permission key.
 */
export const placeholderRouter = t.router({
  read: t.procedure.query(async ({ ctx }) => {
    const scopes = await scopesFor(ctx.caller, "placeholder:read");

    if (scopes.kind === "none") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const rows = ctx.tenant.db.select().from(placeholderRecord);

    if (scopes.kind === "all") return rows;

    const ids = scopes.scopes
      .filter((scope) => scope.type === "placeholder-record")
      .map((scope) => scope.id);

    // Compared as text, so a scope id that is not a uuid matches nothing instead of failing.
    return rows.where(inArray(sql`${placeholderRecord.id}::text`, ids));
  }),
});

export type PlaceholderRouter = typeof placeholderRouter;
