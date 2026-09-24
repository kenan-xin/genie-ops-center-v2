import { sql } from "drizzle-orm";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDialect, PgSession } from "drizzle-orm/pg-core";
import type { Pool, PoolClient } from "pg";

import coreJournal from "../../../drizzle/meta/_journal.json" with { type: "json" };
import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { moduleIdFromLedgerTable } from "../../lib/module-contract/ledger.ts";
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
  /** The pending migration count, on `migration-pending` (R-10). */
  readonly count?: number;
  /** The original cleanup error, for the caller's redacting logger to record. */
  readonly error?: unknown;
}) => void;

/** Applies one history on the run's own session. The default is Drizzle's own migrator. */
export type ApplyHistory = (
  db: NodePgDatabase,
  history: MigrationHistory
) => Promise<void>;

/** Refuses a run whose image omits a module the deployment already installed (R-79). */
export type CheckOmissions = (
  db: MigrationDatabase,
  compiledModuleIds: readonly string[]
) => Promise<void>;

/** Registers a compiled module the deployment has no row for, once `seed` is done (R-27). */
export type RegisterModules = (
  db: MigrationDatabase,
  compiledModuleIds: readonly string[]
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
  /**
   * The ids the image compiled, which the omission check compares with what the deployment
   * already installed and the registration step inserts rows for (R-27, R-79). Required and not
   * derived from `histories`: a history list is a derived value a caller can filter, so a module
   * left out of it would be invisible to the check.
   */
  readonly compiledModuleIds: readonly string[];
  readonly log?: MigrationLog;
  /**
   * The seam a caller-level test uses to watch the session without a database. Production
   * passes nothing, so the real migrator runs.
   */
  readonly apply?: ApplyHistory;
  /** The seam a caller-level test uses in place of the real omission check. */
  readonly checkOmissions?: CheckOmissions;
  /** The seam a caller-level test uses in place of the real registration insert. */
  readonly registerModules?: RegisterModules;
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

/** The one schema every migration ledger records in (R-9, DEC-50). */
const LEDGER_SCHEMA = "drizzle";

/**
 * The database a run's steps receive: drizzle's node-postgres database over the run's one
 * reserved client. `$client` is that client, so a step sends a statement as text with parameters,
 * which is what the run's own control statements use and what a caller-level recording double can
 * read. It is not a pool: the run dispatches nothing to a pool (R-25a).
 */
export type MigrationDatabase = NodePgDatabase & {
  readonly $client: Pick<PoolClient, "query">;
};

/**
 * Every module id the deployment already installed, read without the module's declaration. A
 * module counts as installed when its `tenant_module` row exists or its ledger table
 * `drizzle.__drizzle_migrations_<id>` exists (R-79). The ledger name is read back as an id, so
 * this works for a module the image no longer carries.
 *
 * The catalog is read rather than the tables, so a fresh database with no `drizzle` schema and no
 * `tenant_module` table returns nothing instead of failing: on a first boot the check runs before
 * core's migrations, when both are still absent (R-79).
 */
async function installedModuleIds(db: MigrationDatabase): Promise<string[]> {
  const ledgers = await db.$client.query<{ name: string }>(
    `select c.relname as name
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind = 'r'`,
    [LEDGER_SCHEMA]
  );

  const installed = ledgers.rows.flatMap((row) => {
    const id = moduleIdFromLedgerTable(row.name);

    return id === undefined ? [] : [id];
  });

  const present = await db.$client.query<{ present: boolean }>(
    `select to_regclass('tenant_module') is not null as present`
  );

  if (present.rows[0]?.present !== true) return installed;

  const rows = await db.$client.query<{ module_id: string }>(
    `select module_id from tenant_module`
  );

  return [...new Set([...installed, ...rows.rows.map((row) => row.module_id)])];
}

/**
 * Refuses a run whose image omits a module the deployment already installed (R-79). The refusal
 * names every omitted module and deletes nothing; the operator restores the image that includes
 * them or, for a deployment that never went live, recreates an empty database. Controlled
 * removal, which lets an image drop a module on purpose, is not built yet (Section 5 item 4a).
 */
async function checkOmissions(
  db: MigrationDatabase,
  compiledModuleIds: readonly string[]
): Promise<void> {
  const compiled = new Set(compiledModuleIds);
  const installed = await installedModuleIds(db);
  const omitted = installed.filter((id) => !compiled.has(id));

  if (omitted.length === 0) return;

  const named = omitted.map((id) => `"${id}"`).join(", ");

  throw new Error(
    `The image omits the installed module(s) ${named}. An image cannot drop an installed module; controlled removal is not built yet. Restore the image that includes them, or recreate an empty database if this deployment never went live.`
  );
}

/** One history's ledger as the run reads it under the lock: what it applied, and whether it exists. */
type LedgerState = {
  readonly applied: number;
  readonly present: boolean;
};

/** The migrations one history still owes, never negative when a ledger holds more than it declares. */
function outstanding(
  history: MigrationHistory,
  state: LedgerState | undefined
): number {
  return Math.max(0, history.migrations.length - (state?.applied ?? 0));
}

/**
 * The state of every history's ledger, read on the run's own locked session (R-10). A ledger that
 * does not exist yet — a fresh database, or a module applied for the first time — records nothing
 * and is marked absent, which is also what tells the run to create it (R-27). The counts only
 * decide the pending log line and which histories still have work; the migrator itself decides
 * what to apply.
 */
async function ledgerStates(
  db: MigrationDatabase,
  histories: readonly MigrationHistory[]
): Promise<readonly LedgerState[]> {
  const states: LedgerState[] = [];

  for (const history of histories) {
    // One reserved session serves every read, and two queries in flight on one connection is
    // not allowed, so the ledger reads are sequential like the histories themselves.
    // oxlint-disable-next-line no-await-in-loop
    const present = await db.$client.query<{ present: boolean }>(
      "select to_regclass($1) is not null as present",
      [`${LEDGER_SCHEMA}."${history.table}"`]
    );

    if (present.rows[0]?.present !== true) {
      states.push({ applied: 0, present: false });

      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const counted = await db.$client.query<{ count: number }>(
      `select count(*)::int as count from ${LEDGER_SCHEMA}."${history.table}"`
    );

    states.push({ applied: counted.rows[0]?.count ?? 0, present: true });
  }

  return states;
}

/**
 * Registers a compiled module the deployment has no `tenant_module` row for, as `enabled: false`
 * (R-27). It runs only once the `seed` step is `done`: before that the seed step is the only
 * writer of the initial rows, and it applies its own initial policy. The insert uses
 * `ON CONFLICT DO NOTHING`, so a repeated start changes nothing and an existing row's enabled
 * state is preserved. It commits in one transaction on the run's own locked session.
 */
async function registerModules(
  db: MigrationDatabase,
  compiledModuleIds: readonly string[]
): Promise<void> {
  if (compiledModuleIds.length === 0) return;

  const seed = await db.$client.query<{ state: string }>(
    `select state from setup_step where step = $1`,
    ["seed"]
  );

  if (seed.rows[0]?.state !== "done") return;

  const rows = sql.join(
    compiledModuleIds.map((moduleId) => sql`(${moduleId}, false)`),
    sql`, `
  );

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into tenant_module (module_id, enabled)
      values ${rows}
      on conflict (module_id) do nothing
    `);
  });
}

/**
 * Applies every history on one reserved session (R-25a). The same client sets the lock wait
 * limit, takes the advisory lock, refuses an image that omits an installed module, reads the
 * ledgers and logs the pending count (R-10), applies each history that still has work with its
 * own ledger, registers the compiled modules missing a row once `seed` is done, and unlocks. A
 * history whose ledger is in place and which owes nothing is skipped, so a rerun does no work;
 * one whose ledger is absent still runs, because an empty compiled module must get its ledger
 * (R-27). The lock is held across the transaction boundary between two histories, and no history
 * begins before the lock is held.
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

    // The omission check runs before any history, under the same lock, so a run that would drop
    // an installed module refuses before it touches a ledger or a table (R-79). Its refusal is
    // its own error, so the module names reach the operator rather than a generic wrap.
    await (run.checkOmissions ?? checkOmissions)(db, run.compiledModuleIds);

    // The ledger state is read under the lock and before the first history applies, so the
    // pending count of an upgrade that lagged is visible in the deployment log (R-10).
    const ledgers = await ledgerStates(db, run.histories);

    const pending = run.histories.reduce(
      (total, history, index) => total + outstanding(history, ledgers[index]),
      0
    );

    log({ event: "migration-pending", count: pending });

    for (const [index, history] of run.histories.entries()) {
      const state = ledgers[index];

      const owed = outstanding(history, state);

      // A history with nothing to apply whose ledger is already in place is skipped: a rerun
      // applies nothing and does no work. A history whose ledger is absent still runs, because
      // an empty compiled module must get its ledger (R-27).
      if (owed === 0 && state?.present === true) continue;

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

    // Registration runs after the histories commit and only once `seed` is done (R-27). A
    // failure here is the run's own, so it is wrapped like a failed history.
    try {
      await (run.registerModules ?? registerModules)(db, run.compiledModuleIds);
    } catch (error) {
      throw new AppError(CORE_ERRORS["migration-failed"], { cause: error });
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
