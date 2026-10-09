import { AppError, CORE_ERRORS, implementModule, scopesFor } from "@genie/core";
import { inArray, sql } from "drizzle-orm";

import { placeholderContract } from "./contract.ts";
import { placeholderRecord } from "./schema.ts";

const os = implementModule("placeholder", placeholderContract);

/**
 * The module's one router, built by core from the contract and mounted under the module id when
 * the module is enabled. The list read asks `scopesFor()` first and reads only the records the
 * person's grants cover, only through `context.tenant.db` (DEC-34, DEC-39): a tenant-wide grant
 * reads every row, a record-scoped grant reads the records it names, and no grant is refused
 * before any read. The placeholder record declares no parent type, so only its own scopes filter
 * the list. The `implementModule` base refuses the call with `module-disabled` when the
 * placeholder entitlement is off, before any handler runs (d1y).
 */
export const placeholderRouter = os.router({
  read: os.read.handler(async ({ context }) => {
    const scopes = await scopesFor(context.caller, "placeholder:read");

    if (scopes.kind === "none") {
      throw new AppError(CORE_ERRORS.forbidden);
    }

    const rows = context.tenant.db.select().from(placeholderRecord);

    if (scopes.kind === "all") return rows;

    const ids = scopes.scopes
      .filter((scope) => scope.type === "placeholder-record")
      .map((scope) => scope.id);

    // Compared as text, so a scope id that is not a uuid matches nothing instead of failing.
    return rows.where(inArray(sql`${placeholderRecord.id}::text`, ids));
  }),
});

export type PlaceholderRouter = typeof placeholderRouter;
