import type { TenantContext } from "../src/lib/tenant-context/index.ts";

/** Waits, at most 10 s, until `count` sessions of the database wait on a lock. */
export async function lockWaitersReach(
  context: TenantContext,
  count: number
): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    // oxlint-disable-next-line no-await-in-loop -- polls until the lock waits show.
    const { rows } = await context.db.$client.query<{ waiting: number }>(
      "select count(distinct pid)::int as waiting from pg_locks where not granted"
    );

    if (rows[0]?.waiting === count) return;

    // oxlint-disable-next-line no-await-in-loop -- polls until the lock waits show.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`${count} sessions never waited on a lock.`);
}
