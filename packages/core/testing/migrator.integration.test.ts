import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
    silentLogger()
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

/** Every ledger table this database holds, whatever schema drizzle put it in. */
async function ledgerNames(context: TenantContext): Promise<string[]> {
  const result = await context.db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where tablename ~ '^__drizzle_migrations' order by tablename"
  );

  return result.rows.map((row) => row.tablename);
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
    });

    expect(await ledgerNames(context)).toEqual([
      "__drizzle_migrations",
      "__drizzle_migrations_alpha",
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
    }).then(
      () => undefined,
      (error: Error) => error
    );

    expect(raised).toMatchObject({ code: "migration-failed" });
    expect(raised?.cause).toBeInstanceOf(Error);

    // The failed run left nothing applied: a later run takes the lock and finishes.
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
    });

    // Drizzle creates a history's ledger table before it opens the transaction that runs the
    // statements, so a history that fails leaves its ledger behind, empty. That is drizzle's
    // own order and it predates this migrator: what matters is that the failed statement
    // recorded nothing and applied nothing.
    expect(await ledgerNames(context)).toEqual([
      "__drizzle_migrations",
      "__drizzle_migrations_broken",
    ]);

    expect(await appliedCount(context, "__drizzle_migrations_broken")).toBe(0);
    expect(await tableExists(context, "broken_record")).toBe(false);
    expect(await advisoryLocks(context)).toBe(0);
  });
});
