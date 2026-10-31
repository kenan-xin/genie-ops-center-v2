import { setTimeout as sleep } from "node:timers/promises";

import type { TenantContext } from "@genie/core";

/**
 * Waits until `count` sessions of this database wait on a lock, and answers that count. It reads
 * `pg_locks`, which the releasing session updates itself, so a wait that just ended never counts.
 */
export async function untilWaiting(
  db: TenantContext["db"],
  count: number
): Promise<number> {
  let waiting = 0;

  for (let tries = 0; tries < 200 && waiting < count; tries += 1) {
    // oxlint-disable-next-line no-await-in-loop -- polling one value until it holds.
    await sleep(50);

    // oxlint-disable-next-line no-await-in-loop
    const { rows } = await db.$client.query<{ n: number }>(
      "select count(*)::int as n from pg_locks l join pg_stat_activity a using (pid) where not l.granted and a.datname = current_database()"
    );

    waiting = rows[0]?.n ?? 0;
  }

  return waiting;
}
