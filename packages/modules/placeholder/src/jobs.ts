import { can, type JobDeclaration, moduleAudit } from "@genie/core";
import { eq, sql } from "drizzle-orm";

import { placeholderRecord } from "./schema.ts";

const audit = moduleAudit("placeholder");

/**
 * Touches one record as the person who started the job (R-12, AC-3). A record that does not
 * exist yet fails the run, so pg-boss retries it by the declared policy. A run without a starter,
 * or a starter who cannot read the record, ends with no effect.
 *
 * A retried run after a completion that was lost writes a second row, which reads as a second
 * touch; that is the at-least-once cost the audit trail accepts.
 */
export const touchRecordJob: JobDeclaration<{ readonly id: string }> = {
  name: "placeholder.touch-record",
  retry: { limit: 3, delaySeconds: 1, backoff: true },
  handler: async ({ tenant, caller }, { id }) => {
    // The record is read before the caller is checked, so a missing record fails and retries even
    // for a starter without placeholder:read; the retry case depends on this order. The id is
    // compared as text, so a value that is not a uuid finds nothing instead of failing.
    const [record] = await tenant.db
      .select({ label: placeholderRecord.label })
      .from(placeholderRecord)
      .where(eq(sql`${placeholderRecord.id}::text`, id));

    if (record === undefined) {
      throw new Error(`placeholder record ${id} does not exist yet`);
    }

    const target = { type: "placeholder-record", id };

    if (
      caller === undefined ||
      !(await can(caller, "placeholder:read", target))
    ) {
      return;
    }

    await audit(
      { tenant, caller },
      "placeholder:record_touched",
      target,
      `Touched ${record.label}`
    );
  },
};
