import { sql } from "drizzle-orm";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { retirement } from "../../schema.ts";

/** The row columns the `--confirm` checks read, with the age decided by the database clock. */
type Confirmation = {
  readonly tooEarly: boolean;
  readonly deletionHold: boolean;
};

/**
 * `genie-ops retire` (R-69). Without `--confirm` it records intent: it writes the single
 * `retirement` row with `retired_at` taken from the database clock and `deletion_hold` false, and
 * deletes nothing. A second run keeps the first row through the singleton index, so the retirement
 * date is the one the operator first recorded.
 *
 * With `--confirm` it enforces the two refusal rules and then does nothing else: it refuses while
 * fewer than 90 days have passed since `retired_at` and while `deletion_hold` is set. The age
 * comparison runs in the database against `now()`, so a `genie-ops` container with a skewed clock
 * cannot shift the guard. On success it prints that the checks passed and that deletion lands with
 * Section 5 item 7, so an operator does not read exit 0 as a completed deletion.
 */
export async function runRetire(
  context: TenantContext,
  confirm: boolean,
  output: (line: string) => void
): Promise<void> {
  if (!confirm) {
    await context.db
      .insert(retirement)
      .values({ retiredAt: sql`now()`, deletionHold: false })
      .onConflictDoNothing();

    return;
  }

  const result = await context.db.$client.query<Confirmation>(
    'select now() - retired_at < interval \'90 days\' as "tooEarly", deletion_hold as "deletionHold" from retirement'
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(
      "retire --confirm: no retirement row exists; run `genie-ops retire` first"
    );
  }

  if (row.tooEarly) {
    throw new Error(
      "retire --confirm: fewer than 90 days have passed since retirement; deletion refuses before 90 days"
    );
  }

  if (row.deletionHold) {
    throw new Error(
      "retire --confirm: deletion_hold is set; clear the hold before confirming"
    );
  }

  output(
    "retire --confirm: checks passed; deletion lands with Section 5 item 7"
  );
}
