import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool, PoolClient } from "pg";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type {
  ModuleIdentity,
  ModuleSchema,
} from "../../lib/module-contract/module.ts";
import type { DeploymentEnvironment } from "../../lib/tenant-context/index.ts";

/** One migration history: a folder of SQL files and the table that records what was applied. */
export type MigrationHistory = {
  /** The name in a log line, `core` or the module id. */
  readonly name: string;
  /**
   * An absolute path to the folder of SQL files. Drizzle resolves a relative folder against
   * the working directory of the process, and that directory differs between the image, a
   * test run and a command, so a relative folder fails the start wherever it does not match.
   */
  readonly folder: string;
  readonly table: string;
};

/** Core's own history. Core applies first, then each included module in registry order (R-25). */
export const CORE_HISTORY: MigrationHistory = {
  name: "core",
  folder: fileURLToPath(new URL("../../../drizzle", import.meta.url)),
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
  /** The original cleanup error, for the caller's redacting logger to record. */
  readonly error?: unknown;
}) => void;

/** Applies one history on the run's own session. The default is Drizzle's own migrator. */
export type ApplyHistory = (
  db: NodePgDatabase,
  history: MigrationHistory
) => Promise<void>;

export type MigrationRun = {
  readonly env: DeploymentEnvironment;
  /**
   * Where the run reserves its one session. Only `connect` is read: the run holds that one
   * client from the lock to the unlock and dispatches nothing to the pool (R-25a).
   */
  readonly pool: Pick<Pool, "connect">;
  /** Core first, then each included module in registry order. */
  readonly histories: readonly MigrationHistory[];
  readonly log?: MigrationLog;
  /**
   * The seam a caller-level test uses to watch the session without a database. Production
   * passes nothing, so the real migrator runs.
   */
  readonly apply?: ApplyHistory;
};

const applyWithDrizzle: ApplyHistory = (db, history) =>
  migrate(db, {
    migrationsFolder: history.folder,
    migrationsTable: history.table,
  });

/**
 * What the migrator needs from a module declaration. It is the declaration itself, never a
 * part of it, so that a caller cannot hand over a shape that happens to compile.
 */
export type ModuleHistorySource = {
  readonly identity: Pick<ModuleIdentity, "id">;
  readonly schema: Pick<ModuleSchema, "migrationsFolder" | "migrationsTable">;
};

/**
 * The history a module declares, in the shape the migrator applies. The contract names the
 * folder and the table on the schema, and the migrator names them beside the module id, so a
 * log line can say which history is running. Every caller converts here, so the app bootstrap
 * and the test helper cannot disagree about the mapping.
 */
export function moduleHistory(module: ModuleHistorySource): MigrationHistory {
  return {
    name: module.identity.id,
    folder: module.schema.migrationsFolder,
    table: module.schema.migrationsTable,
  };
}

/** The histories one run applies, core first, in registry order after it (R-25). */
export function migrationPlan(
  modules: readonly MigrationHistory[]
): readonly MigrationHistory[] {
  return [CORE_HISTORY, ...modules];
}

/** What the run changed on its session, tracked apart, because each is undone on its own. */
export type SessionState = {
  /** `SET lock_timeout` succeeded, so the setting must be reset even if the lock never came. */
  readonly settingApplied: boolean;
  /** The advisory lock is held by this session, so it must be released. */
  readonly locked: boolean;
};

/** One step of restoring a session, in the order it must run. */
export type CleanupStep = "unlock" | "reset";

/**
 * What a session needs before it may go back to the pool. The lock is released first and the
 * setting is reset after, and each is decided on its own: an acquisition that timed out leaves
 * no lock to release and still leaves `lock_timeout` set on that session.
 */
export function sessionCleanupPlan(
  state: SessionState
): readonly CleanupStep[] {
  const steps: CleanupStep[] = [];

  if (state.locked) steps.push("unlock");

  if (state.settingApplied) steps.push("reset");

  return steps;
}

/**
 * Whether a client may serve another caller. A session whose restoration did not confirm is
 * destroyed instead, so no later caller inherits a lock or a changed setting (R-26a).
 */
export function releaseMode(cleanupConfirmed: boolean): "reuse" | "destroy" {
  return cleanupConfirmed ? "reuse" : "destroy";
}

/** What a finished run raises: the error it already had, one for the cleanup, or nothing. */
export type RunFailure = "original" | "cleanup" | "none";

/**
 * The outcome of one run. A cleanup that did not confirm fails the start, because the session
 * state is unknown and a container that starts on an unknown state is worse than one that does
 * not start (R-27). The only thing cleanup suppression may do is keep an earlier migration
 * error as the error the caller sees (R-26a).
 */
export function runFailure(result: {
  readonly migrationFailed: boolean;
  readonly cleanupConfirmed: boolean;
}): RunFailure {
  if (result.migrationFailed) return "original";

  return result.cleanupConfirmed ? "none" : "cleanup";
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

  let settingApplied = false;
  let locked = false;
  let migrationFailed = false;
  let failure: unknown;

  try {
    await client.query(`SET lock_timeout = ${run.env.lockTimeoutMs}`);
    settingApplied = true;

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
        await (run.apply ?? applyWithDrizzle)(db, history);
      } catch (error) {
        // The original error stays the direct cause. The log line before this one names the
        // history that failed, so nothing is wrapped to carry that name.
        throw new AppError(CORE_ERRORS["migration-failed"], { cause: error });
      }

      log({ event: "migration-history-done", history: history.name });
    }
  } catch (error) {
    migrationFailed = true;
    failure = error;
  }

  let cleanupConfirmed = false;

  try {
    // A failed SET may have changed the session before the connection error surfaced. Since
    // neither its state nor its health can be confirmed, this client is never reusable.
    if (settingApplied) {
      cleanupConfirmed = await releaseSession(
        client,
        { settingApplied, locked },
        log
      );
    }
  } finally {
    // An uncertain session never goes back to the pool for another caller (R-26a).
    client.release(releaseMode(cleanupConfirmed) === "destroy");
  }

  const outcome = runFailure({
    migrationFailed,
    cleanupConfirmed,
  });

  // An earlier error stays the one the caller sees. Without one, a cleanup that did not
  // confirm still fails the start rather than passing quietly.
  if (outcome === "original") throw failure;

  if (outcome === "cleanup") {
    throw new AppError(CORE_ERRORS["migration-failed"], {
      cause: new Error("the migration session could not be restored"),
    });
  }
}

const CLEANUP_SQL: Readonly<Record<CleanupStep, string>> = {
  unlock: "SELECT pg_advisory_unlock($1)",
  reset: "RESET lock_timeout",
};

/**
 * Runs the cleanup plan and answers whether every step confirmed. A cleanup failure is reported
 * here and swallowed, so the migration error the caller is already raising stays the one it
 * sees; the false answer is what sends the client away instead of back to the pool.
 */
async function releaseSession(
  client: PoolClient,
  state: SessionState,
  log: MigrationLog
): Promise<boolean> {
  for (const step of sessionCleanupPlan(state)) {
    try {
      // Each step depends on the one before it, on this one session.
      // oxlint-disable-next-line no-await-in-loop
      const result = await client.query<{ pg_advisory_unlock: boolean }>(
        CLEANUP_SQL[step],
        step === "unlock" ? [MIGRATION_LOCK_KEY.toString()] : []
      );

      if (step === "unlock" && result.rows[0]?.pg_advisory_unlock !== true) {
        reportCleanupFailure(
          log,
          step,
          new Error("the migration session did not hold the advisory lock")
        );

        return false;
      }
    } catch (error) {
      reportCleanupFailure(log, step, error);

      return false;
    }
  }

  return true;
}

/** Reports the cleanup cause without allowing a broken logger to skip client destruction. */
function reportCleanupFailure(
  log: MigrationLog,
  step: CleanupStep,
  cause: unknown
): void {
  try {
    log({ event: "migration-cleanup-failed", history: step, error: cause });
  } catch {
    // The migration outcome and release decision must not depend on the logging transport.
  }
}
