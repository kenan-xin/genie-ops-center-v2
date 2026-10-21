import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { WORKSPACE_ROOT } from "../src/__testing__/target-probe.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  type MigrationHistory,
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function freshContext(compiledModuleIds: readonly string[] = []) {
  const postgres = await startDisposablePostgres();

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    },
    silentLogger(),
    compiledModuleIds
  );

  cleanups.push(async () => {
    await context.db.$client.end();
    await postgres.stop();
  });

  return context;
}

function emptyHistory(name: string): MigrationHistory {
  return { name, migrations: [], table: moduleLedgerTable(name) };
}

async function runCore(
  context: Awaited<ReturnType<typeof freshContext>>,
  compiledModuleIds: readonly string[] = []
) {
  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: migrationPlan([]),
    compiledModuleIds,
  });
}

async function moduleRows(
  context: Awaited<ReturnType<typeof freshContext>>
): Promise<Array<{ module_id: string; enabled: boolean }>> {
  const result = await context.db.$client.query<{
    module_id: string;
    enabled: boolean;
  }>("select module_id, enabled from tenant_module order by module_id");

  return result.rows;
}

async function moduleState(context: Awaited<ReturnType<typeof freshContext>>) {
  const result = await context.db.$client.query<{
    module_id: string;
    enabled: boolean;
    enabled_at: Date | null;
    category_id: string | null;
    config: { label?: string };
  }>(
    `select module_id, enabled, enabled_at, category_id, config
       from tenant_module
      order by module_id`
  );

  return result.rows;
}

async function tenantSettings(
  context: Awaited<ReturnType<typeof freshContext>>
) {
  const result = await context.db.$client.query(
    "select * from tenant_settings"
  );

  return result.rows;
}

async function tableExists(
  context: Awaited<ReturnType<typeof freshContext>>,
  schema: string,
  table: string
): Promise<boolean> {
  const result = await context.db.$client.query(
    "select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = $1 and c.relname = $2 and c.relkind = 'r'",
    [schema, table]
  );

  return result.rowCount === 1;
}

describe("MigrationRun compiled-module guards", () => {
  it("refuses a module omission before a pending core migration and leaves that migration unapplied", async () => {
    const context = await freshContext();
    const appliedCoreHistory = migrationPlan([])[0];

    if (appliedCoreHistory === undefined) {
      throw new Error("the core migration history is missing");
    }

    await runCore(context);
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('removed-module', false)"
    );

    const pendingTable = "acceptance_pending_core_migration";

    const pendingCoreHistory: MigrationHistory = {
      ...appliedCoreHistory,
      migrations: [
        ...appliedCoreHistory.migrations,
        {
          sql: [`create table ${pendingTable} (id integer primary key);`],
          bps: true,
          folderMillis: 1790380800000,
          hash: "acceptance-pending-core-migration",
        },
      ],
    };

    const before = await context.db.$client.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations"
    );

    await expect(
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories: migrationPlan([pendingCoreHistory]),
        compiledModuleIds: [],
      })
    ).rejects.toThrow("removed-module");

    const after = await context.db.$client.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations"
    );

    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    expect(await tableExists(context, "public", pendingTable)).toBe(false);
    expect(await moduleRows(context)).toEqual([
      { module_id: "removed-module", enabled: false },
    ]);
  });

  it("refuses an installed tenant_module row before any history and deletes nothing", async () => {
    const context = await freshContext();
    await runCore(context);
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ($1, false)",
      ["removed-module"]
    );

    await expect(
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories: migrationPlan([emptyHistory("removed-module")]),
        compiledModuleIds: [],
      })
    ).rejects.toThrow("removed-module");

    expect(await moduleRows(context)).toEqual([
      { module_id: "removed-module", enabled: false },
    ]);
    expect(
      await tableExists(context, "drizzle", moduleLedgerTable("removed-module"))
    ).toBe(false);
  });

  it("refuses an installed module ledger before any history and leaves the ledger", async () => {
    const context = await freshContext();
    await runCore(context);
    const table = moduleLedgerTable("ledger-only-module");
    await context.db.$client.query(
      `create table drizzle."${table}" ("id" integer primary key)`
    );

    await expect(
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories: migrationPlan([emptyHistory("ledger-only-module")]),
        compiledModuleIds: [],
      })
    ).rejects.toThrow("ledger-only-module");

    expect(await tableExists(context, "drizzle", table)).toBe(true);
    expect(await moduleRows(context)).toEqual([]);
  });

  it("refuses the corrected image after a pre-seed image installed a module and retains its data", async () => {
    const moduleId = "preseed-module";
    const moduleTable = "preseed_module_record";
    const context = await freshContext([moduleId]);

    const moduleHistory: MigrationHistory = {
      ...emptyHistory(moduleId),
      migrations: [
        {
          sql: [
            `create table "${moduleTable}" (id integer primary key, label text not null);`,
            `insert into "${moduleTable}" (id, label) values (1, 'retained');`,
          ],
          bps: true,
          folderMillis: 1789948987482,
          hash: "preseed-module-history",
        },
      ],
    };

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([moduleHistory]),
      compiledModuleIds: [moduleId],
    });

    expect(await moduleRows(context)).toEqual([]);
    expect(await tableExists(context, "public", moduleTable)).toBe(true);
    expect(
      await tableExists(context, "drizzle", moduleLedgerTable(moduleId))
    ).toBe(true);

    await expect(
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories: migrationPlan([]),
        compiledModuleIds: [],
      })
    ).rejects.toThrow(moduleId);

    await expect(
      context.db.$client.query(`select id, label from "${moduleTable}"`)
    ).resolves.toMatchObject({ rows: [{ id: 1, label: "retained" }] });
    expect(
      await tableExists(context, "drizzle", moduleLedgerTable(moduleId))
    ).toBe(true);
    expect(await moduleRows(context)).toEqual([]);
  });

  it("does not register modules until seed is done, then inserts disabled rows idempotently", async () => {
    const originalCompiledModuleIds = ["alpha"];
    const upgradedCompiledModuleIds = ["alpha", "beta"];
    const context = await freshContext(originalCompiledModuleIds);

    const originalHistories = migrationPlan(
      originalCompiledModuleIds.map(emptyHistory)
    );

    const upgradedHistories = migrationPlan(
      upgradedCompiledModuleIds.map(emptyHistory)
    );

    const categoryId = "11111111-1111-4111-8111-111111111111";

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: originalHistories,
      compiledModuleIds: originalCompiledModuleIds,
    });

    expect(await moduleRows(context)).toEqual([]);

    await context.db.$client.query(
      "insert into setup_step (step, state) values ('seed', 'done')"
    );
    await context.db.$client.query(
      "insert into tenant_settings (onboarding_mode, local_accounts_enabled, session_idle_minutes) values ('jit', true, 42)"
    );

    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled, enabled_at, category_id, config) values ('alpha', true, $1, $2, $3)",
      [
        new Date("2025-04-03T02:01:00.000Z"),
        categoryId,
        { label: "administrator value" },
      ]
    );

    const originalSettings = await tenantSettings(context);
    const originalModules = await moduleState(context);

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: upgradedHistories,
      compiledModuleIds: upgradedCompiledModuleIds,
    });

    expect(await moduleState(context)).toEqual([
      {
        module_id: "alpha",
        enabled: true,
        enabled_at: new Date("2025-04-03T02:01:00.000Z"),
        category_id: categoryId,
        config: { label: "administrator value" },
      },
      {
        module_id: "beta",
        enabled: false,
        enabled_at: null,
        category_id: null,
        config: {},
      },
    ]);

    expect(await moduleState(context)).toEqual(
      expect.arrayContaining(originalModules)
    );

    expect(await tenantSettings(context)).toEqual(originalSettings);

    const registeredState = {
      modules: await moduleState(context),
      settings: await tenantSettings(context),
    };

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: upgradedHistories,
      compiledModuleIds: upgradedCompiledModuleIds,
    });

    await expect(moduleState(context)).resolves.toEqual(
      registeredState.modules
    );
    await expect(tenantSettings(context)).resolves.toEqual(
      registeredState.settings
    );
  });

  it("accepts an image omitting a never-installed module on a fresh database", async () => {
    const moduleId = "never-installed-module";
    const context = await freshContext();

    expect(await tableExists(context, "drizzle", "__drizzle_migrations")).toBe(
      false
    );
    expect(await tableExists(context, "public", "tenant_module")).toBe(false);

    await expect(
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories: migrationPlan([]),
        compiledModuleIds: [],
      })
    ).resolves.toBeUndefined();

    expect(await moduleRows(context)).toEqual([]);
    expect(
      await tableExists(context, "drizzle", moduleLedgerTable(moduleId))
    ).toBe(false);
    expect(await tableExists(context, "drizzle", "__drizzle_migrations")).toBe(
      true
    );

    await expect(
      runMigrations({
        env: context.env,
        pool: context.db.$client,
        histories: migrationPlan([]),
        compiledModuleIds: [],
      })
    ).resolves.toBeUndefined();
  });

  it("starts a fresh database with no drizzle schema and creates an empty module ledger", async () => {
    const context = await freshContext(["empty-module"]);

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([emptyHistory("empty-module")]),
      compiledModuleIds: ["empty-module"],
    });

    expect(await tableExists(context, "drizzle", "__drizzle_migrations")).toBe(
      true
    );
    expect(
      await tableExists(context, "drizzle", moduleLedgerTable("empty-module"))
    ).toBe(true);
  });
});

function sourceFiles(root: string): string[] {
  // A customer root may not exist in this checkout; the scan treats an absent root as no files
  // rather than failing, so the root can be listed before any customer app lands.
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);

    if (entry.isDirectory()) return sourceFiles(path);

    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [path]
      : [];
  });
}

describe("tenant_module write boundary", () => {
  it("keeps runtime references allowlisted for the migrator, seed, enable procedure and readers", () => {
    const roots = [
      join(WORKSPACE_ROOT, "packages"),
      join(WORKSPACE_ROOT, "apps"),
      join(WORKSPACE_ROOT, "customers"),
    ];

    const allowlisted = new Set([
      "packages/core/src/schema.ts",
      "packages/core/src/services/migrator/index.ts",
      "packages/core/src/services/setup/index.ts",
      "packages/core/src/services/module-management/index.ts",
      "packages/core/src/lib/tenant-context/readers.ts",
    ]);

    // Both the SQL name and the drizzle table object name count: a core file reaches the table
    // through `db.select().from(tenantModule)`, which never spells `tenant_module`.
    const writeReference = /tenant_module|\btenantModule\b/;

    const offenders = roots.flatMap(sourceFiles).flatMap((path) => {
      const relativePath = relative(WORKSPACE_ROOT, path);

      if (
        !path.includes("/src/") ||
        path.endsWith(".test.ts") ||
        !writeReference.test(readFileSync(path, "utf8")) ||
        allowlisted.has(relativePath)
      ) {
        return [];
      }

      return [relativePath];
    });

    expect(offenders).toEqual([]);
  });
});
