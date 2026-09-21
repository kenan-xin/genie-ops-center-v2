import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool, PoolClient } from "pg";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { DeploymentEnvironment } from "../../lib/tenant-context/index.ts";

/** One migration history: a folder of SQL files and the table that records what was applied. */
export type MigrationHistory = {
  /** The name in a log line, `core` or the module id. */
  readonly name: string;
  readonly folder: string;
  readonly table: string;
};

/** Core's own history. Core applies first, then each included module in registry order (R-25). */
export const CORE_HISTORY: MigrationHistory = {
  name: "core",
  folder: "packages/core/drizzle",
  table: "__drizzle_migrations",
};

/**
 * The one advisory lock key for the whole application (R-26). It is fixed, because every start
 * of every process of this deployment must contend for the same lock. The value is arbitrary
 * and permanent: changing it would let two versions migrate at once during a rolling start.
 */
export const MIGRATION_LOCK_KEY = 7562301498120384n;

/** Postgres raises this when `lock_timeout` expires before the lock is granted. */
const LOCK_NOT_AVAILABLE = "55P03";

/** What the migrator writes to a log. The logger itself belongs to the caller. */
export type MigrationLog = (event: {
  readonly event: string;
  readonly history?: string;
}) => void;

export type MigrationRun = {
  readonly env: DeploymentEnvironment;
  readonly pool: Pool;
  /** Core first, then each included module in registry order. */
  readonly histories: readonly MigrationHistory[];
  readonly log?: MigrationLog;
};

/** The histories one run applies, core first, in registry order after it (R-25). */
export function migrationPlan(
  modules: readonly MigrationHistory[]
): readonly MigrationHistory[] {
  return [CORE_HISTORY, ...modules];
}

/** True when Postgres refused the lock because the wait limit expired. */
function isLockTimeout(error: Error): boolean {
  return "code" in error && error.code === LOCK_NOT_AVAILABLE;
}

/**
 * Applies every history on one reserved session (R-25a). The same client sets the lock wait
 * limit, takes the advisory lock, applies each history with its own ledger, and unlocks. The
 * lock is held across the transaction boundary between two histories, and no history begins
 * before the lock is held.
 *
 * A failure keeps its original error as the cause and leaves the caller to exit unhealthy
 * (R-27). Cleanup never turns a failed run into a successful one: a cleanup problem is logged
 * and the migration error is still raised.
 *
 * The environment is validated by the caller, before the pool exists, because validation runs
 * before anything connects (R-25).
 */
export async function runMigrations(run: MigrationRun): Promise<void> {
  const log = run.log ?? (() => {});
  const client = await run.pool.connect();

  let locked = false;
  let healthy = true;

  try {
    await client.query(`SET lock_timeout = ${run.env.lockTimeoutMs}`);

    try {
      await client.query("SELECT pg_advisory_lock($1)", [
        MIGRATION_LOCK_KEY.toString(),
      ]);
    } catch (caught) {
      const error = caught instanceof Error ? caught : undefined;

      if (error !== undefined && isLockTimeout(error)) {
        throw new AppError(CORE_ERRORS["migration-lock-timeout"], {
          cause: error,
        });
      }

      throw caught;
    }

    locked = true;
    log({ event: "migration-lock-held" });

    const db = drizzle(client);

    for (const history of run.histories) {
      log({ event: "migration-history-start", history: history.name });

      try {
        // A history runs after the one before it, on the same session and under the same
        // lock. Running them together would apply two ledgers to one database at once.
        // oxlint-disable-next-line no-await-in-loop
        await migrate(db, {
          migrationsFolder: history.folder,
          migrationsTable: history.table,
        });
      } catch (error) {
        healthy = false;

        throw new AppError(CORE_ERRORS["migration-failed"], { cause: error });
      }

      log({ event: "migration-history-done", history: history.name });
    }
  } finally {
    healthy = (await releaseSession(client, locked, log)) && healthy;

    // An uncertain session never goes back to the pool for another caller (R-26a).
    client.release(!healthy);
  }
}

/**
 * Unlocks and restores the session, and answers whether the session is fit for reuse. A cleanup
 * failure is reported and swallowed here, so the migration error the caller is already raising
 * stays the one it sees.
 */
async function releaseSession(
  client: PoolClient,
  locked: boolean,
  log: MigrationLog
): Promise<boolean> {
  if (!locked) return true;

  try {
    await client.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);

    await client.query("RESET lock_timeout");

    return true;
  } catch {
    log({ event: "migration-cleanup-failed" });

    return false;
  }
}
