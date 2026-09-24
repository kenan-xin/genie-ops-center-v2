import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { retirement } from "../../schema.ts";

/** The age a `--confirm` must reach before Section 5's deletion may run (R-69). */
const CONFIRM_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

/** Whole days between two instants, for the refusal message. */
function daysBetween(earlier: Date, later: number): number {
  return Math.floor((later - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * `genie-ops retire` (R-69). Without `--confirm` it records intent: it writes the single
 * `retirement` row with `retired_at` set and `deletion_hold` false, and deletes nothing. A second
 * run keeps the first row, so the retirement date is the one the operator first recorded.
 *
 * With `--confirm` it enforces the two refusal rules and then does nothing else: it refuses while
 * fewer than 90 days have passed since `retired_at`, and refuses while `deletion_hold` is set.
 * The deletion itself, the placing of the hold and personal erasure land in Section 5 item 7; this
 * command only decides whether the checks pass.
 */
export async function runRetire(
  context: TenantContext,
  confirm: boolean
): Promise<void> {
  if (!confirm) {
    await context.db
      .insert(retirement)
      .values({ retiredAt: new Date(), deletionHold: false })
      .onConflictDoNothing();

    return;
  }

  const rows = await context.db
    .select({
      retiredAt: retirement.retiredAt,
      deletionHold: retirement.deletionHold,
    })
    .from(retirement);

  const row = rows[0];

  if (row === undefined) {
    throw new Error("retire --confirm: no retirement row exists");
  }

  if (Date.now() - row.retiredAt.getTime() < CONFIRM_AFTER_MS) {
    throw new Error(
      `retire --confirm: fewer than 90 days have passed since retirement (${daysBetween(
        row.retiredAt,
        Date.now()
      )} days)`
    );
  }

  if (row.deletionHold) {
    throw new Error(
      "retire --confirm: deletion_hold is set; clear the hold before confirming"
    );
  }
}
