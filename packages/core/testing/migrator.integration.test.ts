import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client, type Pool, type PoolClient, type QueryConfig } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import {
  type TenantContext,
  createTenantContext,
} from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  MIGRATION_LOCK_KEY,
  type MigrationHistory,
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { startDisposablePostgres } from "./index.ts";

/**
 * The migrator against a real Postgres (R-25, R-25a, R-26, R-26a). Nothing here is mocked: a
 * lock is a real advisory lock, a ledger is a real table and a timeout is Postgres refusing to
 * wait. The unit tests beside the migrator prove the statement order on a recording client;
 * these prove what the database does with those statements.
 *
 * Core imports no module (R-39), so the second history is written to a temporary folder here
 * and read with drizzle's own folder reader, rather than taken from a module package. A module
 * declares the same data from files the build traced; what reaches the migrator is identical.
 */
const ALPHA_TABLE = 'CREATE TABLE "alpha_record" ("id" integer PRIMARY KEY);';

/** What a deferred resolver holds until the promise beside it hands over the real one. */
const UNRESOLVED = () => {};

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** One empty Postgres and a context bound to it. No history is applied. */
async function freshDeployment(lockTimeoutMs = 120000): Promise<TenantContext> {
  const postgres = await startDisposablePostgres();

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
      LOCK_TIMEOUT_MS: String(lockTimeoutMs),
    },
    silentLogger(),
    []
  );

  cleanups.push(async () => {
    await context.db.$client.end();
    await postgres.stop();
  });

  return context;
}

/** A real history on disk, in the layout drizzle-kit generates, for the length of one test. */
async function writeHistory(
  name: string,
  statement: string
): Promise<MigrationHistory> {
  const folder = await mkdtemp(join(tmpdir(), `genie-history-${name}-`));

  cleanups.push(() => rm(folder, { recursive: true, force: true }));

  await mkdir(join(folder, "meta"), { recursive: true });
  await writeFile(join(folder, "0000_first.sql"), statement, "utf8");

  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [
        {
          idx: 0,
          version: "7",
          when: 1789948987482,
          tag: "0000_first",
          breakpoints: true,
        },
      ],
    }),
    "utf8"
  );

  return {
    name,
    migrations: readMigrationFiles({
      migrationsFolder: folder,
      migrationsTable: `__drizzle_migrations_${name}`,
    }),
    table: `__drizzle_migrations_${name}`,
  };
}

/**
 * The migrations one history's folder holds right now, read fresh (R2 of the eab6bef
 * re-check). A build re-reads a module's folder on every start (`moduleHistory`), so a history
 * whose journal grew between two runs is exactly this: the same folder, read again.
 */
function readHistory(folder: string, name: string): MigrationHistory {
  return {
    name,
    migrations: readMigrationFiles({
      migrationsFolder: folder,
      migrationsTable: `__drizzle_migrations_${name}`,
    }),
    table: `__drizzle_migrations_${name}`,
  };
}

/** Adds a second migration file and journal entry to a history a prior call already wrote. */
async function growHistory(
  folder: string,
  name: string,
  statement: string
): Promise<MigrationHistory> {
  await writeFile(join(folder, "0001_second.sql"), statement, "utf8");

  // SAFETY: this test wrote the journal a few lines above via `writeFile`, in the exact shape
  // drizzle-kit emits, so the entries array is present.
  const journal = JSON.parse(
    await readFile(join(folder, "meta", "_journal.json"), "utf8")
  ) as { entries: unknown[] };

  journal.entries.push({
    idx: 1,
    version: "7",
    when: 1789948987483,
    tag: "0001_second",
    breakpoints: true,
  });

  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify(journal),
    "utf8"
  );

  return readHistory(folder, name);
}

/** Every ledger table this database holds in the schema reserved for migrations. */
async function ledgerNames(
  context: TenantContext
): Promise<Array<{ schema: string; table: string }>> {
  const result = await context.db.$client.query<{
    schema: string;
    table: string;
  }>(
    "select n.nspname as schema, c.relname as table from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and c.relname ~ '^__drizzle_migrations' order by n.nspname, c.relname"
  );

  return result.rows;
}

/** How many migrations one ledger records. */
async function appliedCount(
  context: TenantContext,
  table: string
): Promise<number> {
  const result = await context.db.$client.query<{ count: number }>(
    `select count(*)::int as count from drizzle."${table}"`
  );

  return result.rows[0]?.count ?? 0;
}

/** How many advisory locks this whole database holds, from any session. */
async function advisoryLocks(context: TenantContext): Promise<number> {
  const result = await context.db.$client.query<{ count: number }>(
    "select count(*)::int as count from pg_locks where locktype = 'advisory'"
  );

  return result.rows[0]?.count ?? 0;
}

/** Whether a table exists on the default search path. */
async function tableExists(
  context: TenantContext,
  table: string
): Promise<boolean> {
  const result = await context.db.$client.query(
    "select 1 from pg_tables where tablename = $1",
    [table]
  );

  return result.rowCount === 1;
}

/** The pid of one real session, the name Postgres knows it by everywhere else. */
async function backendPidOf(client: Client): Promise<number | undefined> {
  const result = await client.query<{ pid: number }>(
    "select pg_backend_pid() as pid"
  );

  return result.rows[0]?.pid;
}

/** The session that owns this database's advisory lock, when one is held anywhere. */
async function advisoryLockOwner(client: Client): Promise<number | undefined> {
  const result = await client.query<{ pid: number }>(
    "select pid from pg_locks where locktype = 'advisory' limit 1"
  );

  return result.rows[0]?.pid;
}

/**
 * A latch that opens the first time a run reports one named event. A second run starts on it,
 * so the contention is real: the first run is inside its lock window when the second begins.
 */
function eventLatch(name: string) {
  let open: () => void = UNRESOLVED;

  const reached = new Promise<void>((resolve) => {
    open = resolve;
  });

  return {
    reached,
    hit: (event: string) => {
      if (event === name) open();
    },
  };
}

/** A statement as pg accepts it: plain text, or a config naming its text. */
type PgStatement = string | QueryConfig;

/** Whether the statement arrived as plain text rather than a config naming its text. */
function isPgText(statement: PgStatement): statement is string {
  return !(statement instanceof Object);
}

/** The text of a statement, whichever shape pg took it in. */
function statementText(statement: PgStatement): string {
  return isPgText(statement) ? statement : statement.text;
}

/**
 * The run's own pool, watched. The wrapper hands out the real client pg reserved, records
 * every statement the run and Drizzle's migrator send over it, and forwards each query and
 * the release verbatim. Nothing is mocked: the database sees the run exactly as production
 * sends it, and the test reads back which session carried it.
 */
function instrumentedPool(pool: Pick<Pool, "connect">) {
  const statements: string[] = [];
  const released: boolean[] = [];
  let reservedCount = 0;
  let backendPid: number | undefined;

  // SAFETY: `Pick<Pool, "connect">` is the whole pool surface `runMigrations` reads, so the
  // watched object below answers that one member and nothing else of the real pool is faked.
  return {
    statements,
    released,
    reservedCount: () => reservedCount,
    backendPid: () => backendPid,
    pool: {
      connect: async () => {
        reservedCount += 1;

        const client = await pool.connect();

        const identity = await client.query<{ pid: number }>(
          "select pg_backend_pid() as pid"
        );

        backendPid = identity.rows[0]?.pid;

        // SAFETY: the run and Drizzle's migrator call `query` with pg's own text and config
        // shapes, which this wrapper records and forwards verbatim; the cast only restores
        // pg's overloaded member type on the answer.
        const reserved: Partial<PoolClient> = {
          query: ((statement: PgStatement, values?: QueryConfig["values"]) => {
            statements.push(statementText(statement));

            return client.query(statement, values);
          }) as PoolClient["query"],
          release: (destroy?: boolean) => {
            released.push(destroy === true);

            client.release(destroy);
          },
        };

        // SAFETY: the run uses `query` and `release` on the client it reserves and nothing
        // else, so those two members are the whole surface this wrapper has to answer, and
        // both reach the real session untouched.
        return reserved as PoolClient;
      },
    } as Pick<Pool, "connect">,
  };
}

describe("the migrator's one reserved session, watched on a real database", () => {
  it("sends the setting, the lock, every history and the cleanup through one real session", async () => {
    const context = await freshDeployment();
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    // A history that sleeps keeps the lock window open long enough for a second, real
    // session to read who owns the lock while the run is inside it.
    const sleeper = await writeHistory("sleeper", "SELECT pg_sleep(0.5);");

    const observer = new Client({ connectionString: context.env.databaseUrl });

    await observer.connect();

    cleanups.push(() => observer.end());

    const watched = instrumentedPool(context.db.$client);

    let lockOwner: Promise<number | undefined> = Promise.resolve(undefined);

    await runMigrations({
      env: context.env,
      pool: watched.pool,
      histories: migrationPlan([alpha, sleeper]),
      compiledModuleIds: ["alpha", "sleeper"],
      log: (event) => {
        if (event.event === "migration-lock-held") {
          lockOwner = advisoryLockOwner(observer);
        }
      },
    });

    const owner = await lockOwner;

    // One reservation, one pid, and pg_locks names that same pid as the lock's owner: the
    // setting, the lock, Drizzle's ledger writes and the cleanup all crossed one session.
    expect(watched.reservedCount()).toBe(1);
    expect(watched.backendPid()).toBeDefined();
    expect(owner).toBe(watched.backendPid());

    expect(watched.statements[0]).toContain("SET lock_timeout");
    expect(watched.statements[1]).toContain("pg_advisory_lock");
    expect(
      watched.statements.some((statement) =>
        statement.includes('CREATE TABLE "alpha_record"')
      )
    ).toBe(true);
    expect(
      watched.statements.some((statement) =>
        /insert into "drizzle"\."__drizzle_migrations/.test(statement)
      )
    ).toBe(true);
    expect(watched.statements.at(-2)).toContain("pg_advisory_unlock");
    expect(watched.statements.at(-1)).toBe("RESET lock_timeout");

    expect(watched.released).toEqual([false]);
    expect(await advisoryLocks(context)).toBe(0);
  });

  it("leaves the lock with the foreign session it could not take, and takes none itself (negative control)", async () => {
    const context = await freshDeployment(250);
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    const holder = new Client({ connectionString: context.env.databaseUrl });

    await holder.connect();

    cleanups.push(() => holder.end());

    await holder.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);

    const holderPid = await backendPidOf(holder);

    const watched = instrumentedPool(context.db.$client);

    await expect(
      runMigrations({
        env: context.env,
        pool: watched.pool,
        histories: migrationPlan([alpha]),
        compiledModuleIds: ["alpha"],
      })
    ).rejects.toMatchObject({ code: "migration-lock-timeout" });

    // The pid comparison tells sessions apart, which is what makes the same-session proof
    // above mean something: the run's own session never became the lock's owner, the lock
    // stayed with the holder, and no unlock was sent from anywhere.
    expect(watched.backendPid()).toBeDefined();
    expect(watched.backendPid()).not.toBe(holderPid);
    expect(await advisoryLockOwner(holder)).toBe(holderPid);
    expect(watched.statements.join(" ")).not.toContain("pg_advisory_unlock");
    expect(watched.released).toEqual([false]);
  });
});

describe("the migrator against a real database", () => {
  it("applies core and then each module history on a fresh database", async () => {
    const context = await freshDeployment();
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([alpha]),
      compiledModuleIds: ["alpha"],
    });

    expect(await ledgerNames(context)).toEqual([
      { schema: "drizzle", table: "__drizzle_migrations" },
      { schema: "drizzle", table: "__drizzle_migrations_alpha" },
    ]);

    expect(await tableExists(context, "alpha_record")).toBe(true);
    expect(await appliedCount(context, alpha.table)).toBe(1);
  });

  it("applies nothing the second time it runs over the same database", async () => {
    const context = await freshDeployment();
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    const run = {
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([alpha]),
      compiledModuleIds: ["alpha"],
    };

    await runMigrations(run);

    const afterFirst = await appliedCount(context, alpha.table);

    // The statement creates a table, so a second application would fail outright. A clean
    // second run is therefore proof on its own, and the ledger says the same thing.
    await runMigrations(run);

    expect(afterFirst).toBe(1);
    expect(await appliedCount(context, alpha.table)).toBe(1);
    expect(await tableExists(context, "alpha_record")).toBe(true);
  });

  it("holds no advisory lock once a run has finished", async () => {
    const context = await freshDeployment();
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([alpha]),
      compiledModuleIds: ["alpha"],
    });

    expect(await advisoryLocks(context)).toBe(0);
  });

  it("waits for the lock, gives up at the limit and applies nothing", async () => {
    const context = await freshDeployment(250);
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    const holder = new Client({ connectionString: context.env.databaseUrl });

    await holder.connect();

    cleanups.push(() => holder.end());

    await holder.query("SELECT pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);

    await expect(
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories: migrationPlan([alpha]),
        compiledModuleIds: ["alpha"],
      })
    ).rejects.toMatchObject({ code: "migration-lock-timeout" });

    // No history began, so the database is untouched and the only lock is the one this test
    // is holding.
    expect(await ledgerNames(context)).toEqual([]);
    expect(await tableExists(context, "alpha_record")).toBe(false);
    expect(await advisoryLocks(context)).toBe(1);
  });

  it("keeps the original error when a history fails, and blocks no later run", async () => {
    const context = await freshDeployment();

    // A history whose statement the database refuses. It stands where a missing folder used to:
    // the migrator no longer reads a folder, so the failure a history can still raise is the
    // database rejecting what it was given.
    const broken: MigrationHistory = {
      name: "broken",
      migrations: [
        {
          sql: ['CREATE TABLE "broken_record" ("id" no_such_type);'],
          bps: true,
          folderMillis: 1789948987482,
          hash: "broken",
        },
      ],
      table: "__drizzle_migrations_broken",
    };

    const raised: Error | undefined = await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([broken]),
      compiledModuleIds: ["broken"],
    }).then(
      () => undefined,
      (error: Error) => error
    );

    expect(raised).toMatchObject({ code: "migration-failed" });
    expect(raised?.cause).toBeInstanceOf(Error);

    // The failed run left nothing applied: a later run takes the lock and finishes. The image
    // still compiles the module, so its empty ledger is installed and not an omission.
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: ["broken"],
    });

    // Drizzle creates a history's ledger table before it opens the transaction that runs the
    // statements, so a history that fails leaves its ledger behind, empty. That is drizzle's
    // own order and it predates this migrator: what matters is that the failed statement
    // recorded nothing and applied nothing.
    expect(await ledgerNames(context)).toEqual([
      { schema: "drizzle", table: "__drizzle_migrations" },
      { schema: "drizzle", table: "__drizzle_migrations_broken" },
    ]);

    expect(await appliedCount(context, "__drizzle_migrations_broken")).toBe(0);
    expect(await tableExists(context, "broken_record")).toBe(false);
    expect(await advisoryLocks(context)).toBe(0);
  });
});

/**
 * Two real migrator runs against one database, each on its own reserved session. The earlier
 * tests hold the lock from a plain `pg.Client`, which proves the wait but not that a second
 * migrator behaves. These start `runMigrations` twice and read what the loser did (R-26).
 */
describe("two migrator runs contending for the one lock", () => {
  it("makes the second wait, apply nothing while it waits, and finish after the release", async () => {
    const context = await freshDeployment();
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    // The sleep keeps the first run inside its lock window while the second one starts.
    const sleeper = await writeHistory("sleeper", "SELECT pg_sleep(0.5);");

    const plan = migrationPlan([alpha, sleeper]);
    const trace: string[] = [];
    const first = instrumentedPool(context.db.$client);
    const second = instrumentedPool(context.db.$client);
    const held = eventLatch("migration-lock-held");

    const firstRun = runMigrations({
      env: context.env,
      pool: first.pool,
      histories: plan,
      compiledModuleIds: ["alpha", "sleeper"],
      log: (event) => {
        trace.push(`first:${event.event}`);
        held.hit(event.event);
      },
    });

    await held.reached;

    const secondRun = runMigrations({
      env: context.env,
      pool: second.pool,
      histories: plan,
      compiledModuleIds: ["alpha", "sleeper"],
      log: (event) => {
        trace.push(`second:${event.event}`);
      },
    });

    await Promise.all([firstRun, secondRun]);

    // The second run reached its lock only after the first had applied every history, so it
    // executed no history for as long as the first held the lock.
    expect(trace).toContain("second:migration-lock-held");
    expect(trace.indexOf("second:migration-lock-held")).toBeGreaterThan(
      trace.lastIndexOf("first:migration-history-done")
    );

    // Two sessions, not one reused, and the loser applied nothing when its turn came.
    expect(first.backendPid()).not.toBe(second.backendPid());
    expect(second.statements.join("\n")).not.toContain(
      'CREATE TABLE "alpha_record"'
    );

    expect(await appliedCount(context, alpha.table)).toBe(1);
    expect(await tableExists(context, "alpha_record")).toBe(true);
    expect(await advisoryLocks(context)).toBe(0);
  });

  it("gives the second run its lock timeout, and lets a later run finish the same plan", async () => {
    const context = await freshDeployment(250);
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    // A second of sleep against a quarter second of patience: the loser must give up.
    const sleeper = await writeHistory("sleeper", "SELECT pg_sleep(1);");

    const plan = migrationPlan([alpha, sleeper]);
    const held = eventLatch("migration-lock-held");

    const firstRun = runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: plan,
      compiledModuleIds: ["alpha", "sleeper"],
      log: (event) => {
        held.hit(event.event);
      },
    });

    await held.reached;

    const second = instrumentedPool(context.db.$client);

    await expect(
      runMigrations({
        env: context.env,
        pool: second.pool,
        histories: plan,
        compiledModuleIds: ["alpha", "sleeper"],
      })
    ).rejects.toMatchObject({ code: "migration-lock-timeout" });

    // It never held the lock, so it sent no unlock, and its session goes back intact.
    expect(second.statements.join("\n")).not.toContain("pg_advisory_unlock");
    expect(second.released).toEqual([false]);

    await firstRun;

    // The lock is free again, so a later start of the same image succeeds and adds nothing.
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: plan,
      compiledModuleIds: ["alpha", "sleeper"],
    });

    expect(await appliedCount(context, alpha.table)).toBe(1);
    expect(await advisoryLocks(context)).toBe(0);
  });
});

/**
 * The recovery paths, caused by the database rather than scripted on a double (R-26a, R-27).
 * A backend is terminated for real, a history releases the session's locks for real, and a
 * failed statement is rolled back by Postgres itself.
 */
describe("the migrator recovering from a real database failure", () => {
  it("keeps the original error and destroys the session when the connection is lost", async () => {
    const context = await freshDeployment();
    const sleeper = await writeHistory("sleeper", "SELECT pg_sleep(2);");

    const executioner = new Client({
      connectionString: context.env.databaseUrl,
    });

    await executioner.connect();

    cleanups.push(() => executioner.end());

    const watched = instrumentedPool(context.db.$client);
    const kills: Array<Promise<unknown>> = [];

    const raised: Error | undefined = await runMigrations({
      env: context.env,
      pool: watched.pool,
      histories: migrationPlan([sleeper]),
      compiledModuleIds: ["sleeper"],
      log: (event) => {
        if (
          event.event !== "migration-history-start" ||
          event.history !== "sleeper"
        ) {
          return;
        }

        const pid = watched.backendPid();

        if (pid !== undefined) {
          kills.push(
            executioner.query("SELECT pg_terminate_backend($1)", [pid])
          );
        }
      },
    }).then(
      () => undefined,
      (error: Error) => error
    );

    await Promise.all(kills);

    // The database killed the session mid-history. The caller still sees the migration error
    // with its original cause, and the unusable session is destroyed rather than pooled.
    expect(raised).toMatchObject({ code: "migration-failed" });
    expect(raised?.cause).toBeInstanceOf(Error);
    expect(watched.released).toEqual([true]);
    expect(await advisoryLocks(context)).toBe(0);

    // A later start is not blocked by the session that died, and the image still compiles the
    // module whose ledger the killed run left behind.
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: ["sleeper"],
    });

    // No listener is attached here on purpose. A terminated backend makes pg emit `error` on
    // the client itself, and Node turns an `error` event with no listener into an uncaught
    // exception. `createTenantContext` now attaches a per-client listener at checkout, so this
    // case passing with no unhandled error is the proof that production, not the harness,
    // contains the lost session (genie-ops-center-v2-wwc).
  });

  it("fails the start and destroys the session when the lock is gone by cleanup time", async () => {
    const context = await freshDeployment();
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    // A session-level advisory lock is not transactional, so this release outlives drizzle's
    // migration transaction. By cleanup the run no longer holds the lock it took, and the
    // unlock answers false: the same uncertainty a lost and retaken lock would leave.
    const saboteur = await writeHistory(
      "saboteur",
      "SELECT pg_advisory_unlock_all();"
    );

    const watched = instrumentedPool(context.db.$client);

    const raised: Error | undefined = await runMigrations({
      env: context.env,
      pool: watched.pool,
      histories: migrationPlan([alpha, saboteur]),
      compiledModuleIds: ["alpha", "saboteur"],
    }).then(
      () => undefined,
      (error: Error) => error
    );

    // Every history applied and the start still fails, because a container must not serve on
    // a session nobody can account for (R-27).
    expect(raised).toMatchObject({ code: "migration-failed" });
    expect(raised?.cause).toBeInstanceOf(Error);
    expect(String(raised?.cause)).toContain("could not be restored");
    expect(watched.released).toEqual([true]);
    expect(await appliedCount(context, alpha.table)).toBe(1);
    expect(await advisoryLocks(context)).toBe(0);
  });

  it("rolls a failed history back whole, leaving no half applied table", async () => {
    const context = await freshDeployment();

    const partial = await writeHistory(
      "partial",
      [
        'CREATE TABLE "kept_record" ("id" integer PRIMARY KEY);',
        "--> statement-breakpoint",
        'CREATE TABLE "lost_record" ("id" no_such_type);',
      ].join("\n")
    );

    await expect(
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories: migrationPlan([partial]),
        compiledModuleIds: ["partial"],
      })
    ).rejects.toMatchObject({ code: "migration-failed" });

    // The first statement of the history succeeded and the second did not. Drizzle runs a
    // history in one transaction, so the rollback must take the first one back with it.
    expect(await tableExists(context, "kept_record")).toBe(false);
    expect(await tableExists(context, "lost_record")).toBe(false);
    expect(await appliedCount(context, partial.table)).toBe(0);
    expect(await advisoryLocks(context)).toBe(0);
  });
});

/**
 * The forward-only rerun a rolling start performs: the same image, then an image carrying one
 * more module, against a database that is already migrated (R-28).
 */
describe("the migrator over an already migrated database", () => {
  it("applies only what is missing, and applies it in registry order", async () => {
    const context = await freshDeployment();
    const alpha = await writeHistory("alpha", ALPHA_TABLE);

    const beta = await writeHistory(
      "beta",
      'CREATE TABLE "beta_record" ("id" integer PRIMARY KEY);'
    );

    const gamma = await writeHistory(
      "gamma",
      'CREATE TABLE "gamma_record" ("id" integer PRIMARY KEY);'
    );

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([alpha]),
      compiledModuleIds: ["alpha"],
    });

    const watched = instrumentedPool(context.db.$client);

    await runMigrations({
      env: context.env,
      pool: watched.pool,
      histories: migrationPlan([alpha, beta, gamma]),
      compiledModuleIds: ["alpha", "beta", "gamma"],
    });

    const sent = watched.statements.join("\n");

    // The history the database already carries is not applied again, and the two new ones
    // arrive in the order the plan names them, which is the order the image includes them.
    expect(sent).not.toContain('CREATE TABLE "alpha_record"');
    expect(sent.indexOf('CREATE TABLE "beta_record"')).toBeGreaterThan(-1);
    expect(sent.indexOf('CREATE TABLE "gamma_record"')).toBeGreaterThan(
      sent.indexOf('CREATE TABLE "beta_record"')
    );

    expect(await appliedCount(context, alpha.table)).toBe(1);
    expect(await appliedCount(context, beta.table)).toBe(1);
    expect(await appliedCount(context, gamma.table)).toBe(1);
    expect(await tableExists(context, "alpha_record")).toBe(true);
    expect(await advisoryLocks(context)).toBe(0);
  });

  it("still applies a migration a history's journal gained since the last run", async () => {
    // The skip that stands in for drizzle's own decision (`services/migrator/index.ts`,
    // ledgerStates/runMigrations) compares applied row counts against the history's migration
    // count. This is the one case that would expose a skip that only ever compared "is the
    // ledger present": an already-applied history whose journal grew a second entry.
    const context = await freshDeployment();
    const folder = await mkdtemp(join(tmpdir(), "genie-history-grown-"));

    cleanups.push(() => rm(folder, { recursive: true, force: true }));

    await mkdir(join(folder, "meta"), { recursive: true });
    await writeFile(join(folder, "0000_first.sql"), ALPHA_TABLE, "utf8");
    await writeFile(
      join(folder, "meta", "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [
          {
            idx: 0,
            version: "7",
            when: 1789948987482,
            tag: "0000_first",
            breakpoints: true,
          },
        ],
      }),
      "utf8"
    );

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([readHistory(folder, "grown")]),
      compiledModuleIds: ["grown"],
    });

    expect(await appliedCount(context, "__drizzle_migrations_grown")).toBe(1);

    const grown = await growHistory(
      folder,
      "grown",
      'CREATE TABLE "grown_second_record" ("id" integer PRIMARY KEY);'
    );

    const watched = instrumentedPool(context.db.$client);

    await runMigrations({
      env: context.env,
      pool: watched.pool,
      histories: migrationPlan([grown]),
      compiledModuleIds: ["grown"],
    });

    expect(watched.statements.join("\n")).toContain(
      'CREATE TABLE "grown_second_record"'
    );
    expect(await appliedCount(context, "__drizzle_migrations_grown")).toBe(2);
    expect(await tableExists(context, "grown_second_record")).toBe(true);
  });
});
