import { can, type ModuleRequestContext } from "@genie/core";
import { TRPCError, initTRPC } from "@trpc/server";

import { placeholderRecord } from "./schema.ts";

const t = initTRPC.context<ModuleRequestContext>().create();

/**
 * The module's one router, mounted under the module id when the module is enabled. Every
 * procedure checks `can()` first and reads only through `ctx.tenant.db` (DEC-34, DEC-39). The
 * dot in the path `placeholder.read` is a tRPC path, not the permission key.
 */
export const placeholderRouter = t.router({
  read: t.procedure.query(async ({ ctx }) => {
    if (!(await can(ctx.caller, "placeholder:read"))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return ctx.tenant.db.select().from(placeholderRecord);
  }),
});

export type PlaceholderRouter = typeof placeholderRouter;
