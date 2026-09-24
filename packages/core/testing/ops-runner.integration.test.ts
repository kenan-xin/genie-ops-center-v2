import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, describe, expect, it } from "vitest";

import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import { writeAuditEvent } from "../src/services/audit/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  CORE_HISTORY,
  type MigrationHistory,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

type Fixture = {
  readonly source: { DATABASE_URL: string; PUBLIC_URL: string };
  readonly context: TenantContext;
};

type AuditMetadata = {
  readonly osUser: string;
  readonly args: readonly string[];
  readonly outcome: string;
};

async function fixture(): Promise<Fixture> {
  const postgres = await startDisposablePostgres();

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    },
    silentLogger(),
    ["fixture"]
  );

  cleanups.push(async () => {
    await context.db.$client.end();
    await postgres.stop();
  });

  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: [CORE_HISTORY],
    compiledModuleIds: ["fixture"],
  });

  return {
    source: {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    },
    context,
  };
}

async function history(
  name: string,
  statement: string
): Promise<MigrationHistory> {
  const folder = await mkdtemp(join(tmpdir(), `genie-ops-${name}-`));

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
      migrationsTable: moduleLedgerTable(name),
    }),
    table: moduleLedgerTable(name),
  };
}

async function auditRows(context: Fixture["context"]): Promise<
  Array<{
    actor_user_id: string | null;
    action: string;
    metadata: AuditMetadata;
  }>
> {
  const result = await context.db.$client.query<{
    actor_user_id: string | null;
    action: string;
    metadata: AuditMetadata;
  }>(
    "select actor_user_id, action, metadata from audit_event order by occurred_at, id"
  );

  return result.rows;
}

function outputCapture() {
  const lines: string[] = [];

  return {
    lines,
    output: (line: string) => lines.push(line),
    errorOutput: (line: string) => lines.push(line),
  };
}

describe("genie-ops migrate", () => {
  it("runs twice, applies nothing on the second run, and logs pending before SQL", async () => {
    const { source } = await fixture();

    const migration = await history(
      "pending-order",
      'create table "ops_runner_record" ("id" integer primary key);'
    );

    const captured = outputCapture();

    const options = {
      source,
      compiledModuleIds: [migration.name],
      histories: [migration],
      ...captured,
    };

    await expect(runGenieOps(["migrate"], options)).resolves.toBe(0);

    const firstRun = [...captured.lines];

    captured.lines.length = 0;

    await expect(runGenieOps(["migrate"], options)).resolves.toBe(0);

    const secondRun = [...captured.lines];

    const pending = firstRun.findIndex((line) =>
      line.includes("migration-pending")
    );

    const firstHistory = firstRun.findIndex((line) =>
      line.includes("migration-history-start")
    );

    expect(pending).toBeGreaterThanOrEqual(0);
    expect(firstHistory).toBeGreaterThan(pending);
    expect(firstRun).toContain("migration-history-done pending-order");

    // The second run applies nothing: the count is zero and the module's history is skipped
    // rather than run as a no-op.
    expect(secondRun).toContain("migration-pending 0");
    expect(
      secondRun.some((line) =>
        line.includes("migration-history-done pending-order")
      )
    ).toBe(false);
  }, 120000);

  it("writes exactly one success audit row with only allow-listed arguments", async () => {
    const { source, context } = await fixture();
    const migration = await history("audit-success", "select 1;");
    const captured = outputCapture();

    await expect(
      runGenieOps(["migrate"], {
        source,
        compiledModuleIds: [migration.name],
        histories: [migration],
        ...captured,
      })
    ).resolves.toBe(0);

    const rows = await auditRows(context);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      action: "ops:migrate",
      metadata: {
        osUser: expect.any(String),
        args: [],
        outcome: "success",
      },
    });
    expect(JSON.stringify(rows[0]?.metadata)).not.toContain("DATABASE_URL");
  }, 120000);

  it("writes one failing audit row and prints the cause with a nonzero exit", async () => {
    const { source, context } = await fixture();

    const migration = await history(
      "audit-failure",
      "select no_such_ops_function();"
    );

    const captured = outputCapture();

    await expect(
      runGenieOps(["migrate"], {
        source,
        compiledModuleIds: [migration.name],
        histories: [migration],
        ...captured,
      })
    ).resolves.not.toBe(0);

    const rows = await auditRows(context);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      action: "ops:migrate",
      metadata: {
        outcome: "failure",
      },
    });
    expect(captured.lines.join("\n")).toContain("no_such_ops_function");
  }, 120000);
});

describe("genie-ops parse guards", () => {
  it("dispatches on the first positional and parses each subcommand independently", async () => {
    const { source } = await fixture();
    const captured = outputCapture();

    await expect(
      runGenieOps(["unknown-command"], {
        source,
        compiledModuleIds: [],
        histories: [],
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).toMatch(/unknown|command|usage/i);
  }, 120000);

  it("does not echo an unexpected positional value or write an audit row", async () => {
    const { source, context } = await fixture();
    const captured = outputCapture();
    const fakeSecret = "fake-secret-that-must-not-echo";

    await expect(
      runGenieOps(["migrate", fakeSecret], {
        source,
        compiledModuleIds: [],
        histories: [],
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).not.toContain(fakeSecret);
    await expect(
      context.db.$client.query("select count(*)::int as count from audit_event")
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  }, 120000);

  it("fails before creating a context when parsing rejects", async () => {
    const captured = outputCapture();

    const fakeSecret =
      "postgres://operator:fake-secret@database.invalid:5432/tenant";

    await expect(
      runGenieOps(["migrate", "--unexpected", fakeSecret], {
        source: {
          DATABASE_URL: "not-a-database-url",
          PUBLIC_URL: "not-a-public-url",
        },
        compiledModuleIds: [],
        histories: [],
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).not.toContain(fakeSecret);
  }, 120000);
});

describe("audit helper fallback", () => {
  it("writes the outcome to command output when audit_event does not exist", async () => {
    const { context } = await fixture();
    const lines: string[] = [];

    await context.db.$client.query("drop table audit_event");

    await expect(
      writeAuditEvent(context, {
        action: "ops:migrate",
        metadata: { osUser: "operator", args: [], outcome: "failure" },
        output: (line: string) => lines.push(line),
      })
    ).resolves.toBeUndefined();

    // 42P01: undefined_table. Read from drizzle's DrizzleQueryError wrapper via `.cause`,
    // never from the wrapper's own message, which carries the SQL and the parameters.
    expect(lines.join("\n")).toContain("(not recorded: 42P01)");
  }, 120000);
});
