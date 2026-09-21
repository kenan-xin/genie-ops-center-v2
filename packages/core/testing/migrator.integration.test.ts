import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import {
  type TenantContext,
  createTenantContext,
} from "../src/lib/tenant-context/index.ts";
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
 * rather than taken from a module package.
 */
const ALPHA_TABLE = 'CREATE TABLE "alpha_record" ("id" integer PRIMARY KEY);';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** One empty Postgres and a context bound to it. No history is applied. */
async function freshDeployment(lockTimeoutMs = 120000): Promise<TenantContext> {
  const postgres = await startDisposablePostgres();

  const context = createTenantContext({
    DATABASE_URL: postgres.url,
    PUBLIC_URL: "https://test.example.invalid",
    LOCK_TIMEOUT_MS: String(lockTimeoutMs),
  });

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

  return { name, folder, table: `__drizzle_migrations_${name}` };
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

    const missing: MigrationHistory = {
      name: "missing",
      folder: join(tmpdir(), "genie-history-that-does-not-exist"),
      table: "__drizzle_migrations_missing",
    };

    const raised: Error | undefined = await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([missing]),
    }).then(
      () => undefined,
      (error: Error) => error
    );

    expect(raised).toMatchObject({ code: "migration-failed" });
    expect(raised?.cause).toBeInstanceOf(Error);

    // The failed run left nothing behind: a later run takes the lock and finishes.
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
    });

    expect(await ledgerNames(context)).toEqual(["__drizzle_migrations"]);
    expect(await advisoryLocks(context)).toBe(0);
  });
});
