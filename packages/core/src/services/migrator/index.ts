import type { MigrationMeta } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDialect, PgSession } from "drizzle-orm/pg-core";
import type { Pool, PoolClient } from "pg";

import coreJournal from "../../../drizzle/meta/_journal.json" with { type: "json" };
import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type {
  ModuleIdentity,
  ModuleSchema,
} from "../../lib/module-contract/module.ts";
import type { DeploymentEnvironment } from "../../lib/tenant-context/index.ts";
import { type MigrationFiles, migrationsFromJournal } from "./history.ts";

/** One migration history: the SQL it applies and the table that records what was applied. */
export type MigrationHistory = {
  /** The name in a log line, `core` or the module id. */
  readonly name: string;
  /**
   * The migrations this history applies, in journal order, read from files the build traced.
   * It is data and not a folder path because a folder resolved at run time is invisible to a
   * production bundler: the bundler neither resolves the reference nor copies the SQL into the
   * image, so a container built that way cannot migrate at all.
   */
  readonly migrations: readonly MigrationMeta[];
  readonly table: string;
};

/**
 * Core's own SQL files, one entry per journal tag. The Section 1 migration adds its `new URL`
 * here in the same change that adds the file, and `migrationsFromJournal` refuses to start if a
 * journal entry has none. The spelling is what the production bundler traces to copy the SQL
 * into the image.
 */
const CORE_MIGRATION_FILES: MigrationFiles = {
  "0000_tearful_luminals": new URL(
    "../../../drizzle/0000_tearful_luminals.sql",
    import.meta.url
  ),
};

/** Core's own history. Core applies first, then each included module in registry order (R-25). */
export const CORE_HISTORY: MigrationHistory = {
  name: "core",
  table: "__drizzle_migrations",
  // A getter, not an eager value: core's SQL is read when the run asks for it, never at import
  // time. An eager read would run during a Next.js page-data collection, where the bundler has
  // rewritten the `new URL` above to a public asset path `readFileSync` cannot open, and the
  // build would fail. The `new URL` declarations stay at module scope on purpose: that spelling
  // is what the bundler traces to copy the SQL into the image. This defers only the read.
  get migrations() {
    return migrationsFromJournal(coreJournal, CORE_MIGRATION_FILES);
  },
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

/**
 * The database with the two properties drizzle's own `migrate()` uses to apply migrations it
 * has already read. Both are real properties of every `NodePgDatabase`, constructor arguments
 * that drizzle marks `@internal`, which hides them from the declaration without removing them
 * from the object. Both types here are drizzle's own.
 */
type MigrationApply = NodePgDatabase & {
  readonly dialect: PgDialect;
  readonly session: PgSession;
};

const applyWithDrizzle: ApplyHistory = (db, history) => {
  // Drizzle's `migrate()` is `readMigrationFiles(config)` followed by exactly the call below.
  // The folder read is the half a production bundler cannot follow, so the migrations arrive
  // as data and only the apply is borrowed. The statements, their order and the ledger rows
  // stay drizzle's own.
  // SAFETY: the assertion narrows the database to the same object with the two properties the
  // pinned drizzle-orm 0.45.2 `PgDatabase` assigns in its constructor and hides in its types.
  // Only `migrator.integration.test.ts` reaches this call, so only the Docker-gated
  // `test:integration` target catches an upgrade that renamed either property. The assertion
  // fabricates both, so neither `typecheck` nor the unit suite can see the rename. The failure
  // is loud when it comes: a `TypeError` on the first migration of a real run.
  const internals = db as MigrationApply;

  return internals.dialect.migrate([...history.migrations], internals.session, {
    // `migrate` reads only the table and the schema from this config. The folder is required
    // by drizzle's type and is never opened, which is the whole point of the change.
    migrationsFolder: "",
    // The ledger schema is pinned here rather than left to drizzle's default, so an upgrade
    // that moved that default cannot silently relocate core's or a module's ledger (Spec 1
    // R-9/R-79, DEC-50). Every history records in this one schema.
    migrationsSchema: "drizzle",
    migrationsTable: history.table,
  });
};

/**
 * What the migrator needs from a module declaration. It is the declaration itself, never a
 * part of it, so that a caller cannot hand over a shape that happens to compile.
 */
export type ModuleHistorySource = {
  readonly identity: Pick<ModuleIdentity, "id">;
  readonly schema: Pick<ModuleSchema, "migrations" | "migrationsTable">;
};

/**
 * The history a module declares, in the shape the migrator applies. The contract names the
 * migrations and the table on the schema, and the migrator names them beside the module id, so
 * a log line can say which history is running. Every caller converts here, so the app bootstrap
 * and the test helper cannot disagree about the mapping.
 */
export function moduleHistory(module: ModuleHistorySource): MigrationHistory {
  return {
    name: module.identity.id,
    // The declaration defers the SQL read to a thunk (module contract, Schema point), so the
    // read happens here and nowhere else: once per history, at bootstrap planning, never in a
    // hot path and never memoised (a cache would read at module scope on first bundle touch).
    migrations: module.schema.migrations(),
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
