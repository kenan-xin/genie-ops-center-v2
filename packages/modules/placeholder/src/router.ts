import {
  AppError,
  can,
  CORE_ERRORS,
  enqueueJob,
  implementModule,
  scopesFor,
} from "@genie/core";
import { eq, sql } from "drizzle-orm";

import { placeholderContract } from "./contract.ts";
import { touchRecordJob } from "./jobs.ts";
import { placeholderRecord } from "./schema.ts";
import { recordScope } from "./scope.ts";

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

    return context.tenant.db
      .select()
      .from(placeholderRecord)
      .where(recordScope(scopes));
  }),
  // The id is compared as text, so a value that is not a uuid finds nothing instead of failing.
  get: os.get.handler(async ({ context, input }) => {
    const target = { type: "placeholder-record", id: input.id };

    if (!(await can(context.caller, "placeholder:use", target))) {
      throw new AppError(CORE_ERRORS.forbidden);
    }

    const [record] = await context.tenant.db
      .select()
      .from(placeholderRecord)
      .where(eq(sql`${placeholderRecord.id}::text`, input.id));

    if (record === undefined) {
      throw new AppError(CORE_ERRORS["not-found"]);
    }

    return record;
  }),
  // The job runs as the caller and checks their read grant on the record itself, so the procedure
  // asks only for the workspace key.
  touch: os.touch.handler(async ({ context, input }) => {
    if (!(await can(context.caller, "placeholder:use"))) {
      throw new AppError(CORE_ERRORS.forbidden);
    }

    return {
      jobId: await enqueueJob(context, touchRecordJob, { id: input.id }),
    };
  }),
});

export type PlaceholderRouter = typeof placeholderRouter;
