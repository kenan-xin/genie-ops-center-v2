import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import {
  account,
  session,
  twoFactor,
  user,
  verification,
} from "../src/schema.ts";
import { writeAuditEvent } from "../src/services/audit/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  CORE_HISTORY,
  type MigrationHistory,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { IDENTITY_COMMANDS, runGenieOps } from "../src/services/ops/index.ts";
import { insertCredentialPerson, startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

function moduleFor(id: string): Module {
  return {
    ...validModule,
    identity: { ...validModule.identity, id },
    schema: { ...validModule.schema, migrationsTable: moduleLedgerTable(id) },
  };
}

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
      compiledModules: [moduleFor(migration.name)],
      histories: [migration],
      ...captured,
    };

    await expect(runGenieOps(["migrate"], options)).resolves.toBe(0);

    // Each line is a pino JSON line (R-75); the event is its message.
    // SAFETY: the runner writes every line through pino, which always sets `msg`.
    const messages = () =>
      captured.lines.map((line) => (JSON.parse(line) as { msg: string }).msg);

    const firstRun = messages();

    captured.lines.length = 0;

    await expect(runGenieOps(["migrate"], options)).resolves.toBe(0);

    const secondRun = messages();

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
        compiledModules: [moduleFor(migration.name)],
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
        compiledModules: [moduleFor(migration.name)],
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

/** The five Section 2 values, so the built context carries an auth member the guard compares. */
const AUTH_ENV = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  KEYCLOAK_URL: "http://127.0.0.1:1",
  KEYCLOAK_REALM: "genie",
  KEYCLOAK_CLIENT_ID: "genie-ops-center",
  KEYCLOAK_CLIENT_SECRET: "test-client-secret",
};

/** A tenant_settings row whose recorded address is not `AUTH_ENV.KEYCLOAK_URL` (R-54c). */
async function recordMismatchedAddress(
  context: Fixture["context"]
): Promise<void> {
  await context.db.$client.query(
    "insert into tenant_settings (realm_mode, keycloak_url_at_setup) values ('managed', 'https://id.example.com')"
  );
}

describe("the R-54c identity-command guard", () => {
  it("refuses a listed identity command on an address mismatch and writes a failing row", async () => {
    const { source, context } = await fixture();

    await recordMismatchedAddress(context);

    const captured = outputCapture();

    await expect(
      runGenieOps(["module", "enable", "fixture"], {
        source: { ...source, ...AUTH_ENV },
        compiledModules: [],
        histories: [],
        identityCommands: ["module-enable"],
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).toContain(
      "KEYCLOAK_URL is not the Keycloak that setup used"
    );

    const rows = await auditRows(context);

    expect(rows.at(-1)).toMatchObject({
      action: "ops:module-enable",
      metadata: { outcome: "failure" },
    });
  }, 120000);

  it("lists idp set, and only idp set, as an identity command", () => {
    expect(IDENTITY_COMMANDS).toEqual(["idp-set"]);
  });

  it("refuses idp set on an address mismatch before any realm call", async () => {
    const { source, context } = await fixture();

    await recordMismatchedAddress(context);

    const captured = outputCapture();

    await expect(
      runGenieOps(
        [
          "idp",
          "set",
          "--protocol",
          "oidc",
          "--issuer-url",
          "https://idp.example.com/realms/company",
          "--client-id",
          "genie-oidc",
        ],
        {
          source: { ...source, ...AUTH_ENV },
          compiledModules: [],
          histories: [],
          ...captured,
        }
      )
    ).resolves.not.toBe(0);

    const joined = captured.lines.join("\n");

    expect(joined).toContain(
      "KEYCLOAK_URL is not the Keycloak that setup used"
    );

    const rows = await auditRows(context);

    expect(rows.at(-1)).toMatchObject({
      action: "ops:idp-set",
      metadata: { outcome: "failure" },
    });
  }, 120000);

  it("refuses an issuer URL that carries a username or password, and writes no row", async () => {
    const { source, context } = await fixture();
    const captured = outputCapture();
    const secretUrl = "https://user:pass@idp.example.com/realms/company";

    await expect(
      runGenieOps(
        [
          "idp",
          "set",
          "--protocol",
          "oidc",
          "--issuer-url",
          secretUrl,
          "--client-id",
          "genie-oidc",
        ],
        {
          source: { ...source, ...AUTH_ENV },
          compiledModules: [],
          histories: [],
          ...captured,
        }
      )
    ).resolves.not.toBe(0);

    // A parse failure writes no audit row and never echoes the rejected value.
    expect(captured.lines.join("\n")).not.toContain("user:pass");
    expect(captured.lines.join("\n")).not.toContain(secretUrl);
    await expect(
      context.db.$client.query("select count(*)::int as count from audit_event")
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  }, 120000);

  it("records --allow-http in the audited arguments", async () => {
    const { source, context } = await fixture();

    await recordMismatchedAddress(context);

    const captured = outputCapture();

    await expect(
      runGenieOps(
        [
          "idp",
          "set",
          "--protocol",
          "oidc",
          "--issuer-url",
          "http://idp.example.com/realms/company",
          "--client-id",
          "genie-oidc",
          "--allow-http",
        ],
        {
          source: { ...source, ...AUTH_ENV },
          compiledModules: [],
          histories: [],
          ...captured,
        }
      )
    ).resolves.not.toBe(0);

    const rows = await auditRows(context);

    expect(rows.at(-1)).toMatchObject({
      action: "ops:idp-set",
      metadata: {
        outcome: "failure",
        args: expect.arrayContaining(["--allow-http"]),
      },
    });
  }, 120000);

  it("does not guard module or retire, so an address mismatch leaves them alone", async () => {
    const { source, context } = await fixture();

    await recordMismatchedAddress(context);
    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('fixture', true) on conflict (module_id) do update set enabled = true"
    );

    const captured = outputCapture();

    await expect(
      runGenieOps(["module", "disable", "fixture"], {
        source: { ...source, ...AUTH_ENV },
        compiledModules: [moduleFor("fixture")],
        histories: [],
        ...captured,
      })
    ).resolves.toBe(0);
  }, 120000);

  it("does not guard setup", async () => {
    const { source, context } = await fixture();

    await recordMismatchedAddress(context);

    const captured = outputCapture();

    const code = await runGenieOps(
      [
        "setup",
        "--tenant-config",
        "/nonexistent-tenant.yaml",
        "--branding-seed",
        "/nonexistent-branding.json",
      ],
      {
        source: { ...source, ...AUTH_ENV },
        compiledModules: [],
        histories: [],
        ...captured,
      }
    );

    expect(code).not.toBe(0);
    expect(captured.lines.join("\n")).not.toContain(
      "KEYCLOAK_URL is not the Keycloak that setup used"
    );
  }, 120000);
});

describe("genie-ops parse guards", () => {
  it("dispatches on the first positional and parses each subcommand independently", async () => {
    const { source } = await fixture();
    const captured = outputCapture();

    await expect(
      runGenieOps(["unknown-command"], {
        source,
        compiledModules: [],
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
        compiledModules: [],
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
        compiledModules: [],
        histories: [],
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).not.toContain(fakeSecret);
  }, 120000);
});

describe("genie-ops break-glass rotate", () => {
  it("rotates the password, clears the authenticator, sets the forced change and deletes sessions in one transaction, with one audit row (R-60, R-61, AC-13)", async () => {
    const { source, context } = await fixture();

    const oldPassword = "temporary-pass-1!";

    const userId = await insertCredentialPerson(context, {
      email: "rotate@example.invalid",
      password: oldPassword,
    });

    // A verified authenticator and a live session, both of which the rotation must clear.
    await context.db.insert(twoFactor).values({
      id: "tf-rotate",
      userId,
      secret: "sealed-secret",
      backupCodes: "sealed-codes",
      verified: true,
    });
    await context.db.insert(session).values({
      id: "s-rotate",
      token: "token-rotate",
      userId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // A stored trust-device row (B1): its `value` is the account id, as the two-factor plugin
    // writes it, so the rotation must delete it too.
    await context.db.insert(verification).values({
      id: "verify-rotate",
      identifier: "trust-device-fixture",
      value: userId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const captured = outputCapture();

    await expect(
      runGenieOps(["break-glass", "rotate"], {
        source,
        compiledModules: [],
        histories: [],
        ...captured,
      })
    ).resolves.toBe(0);

    // One operator row, and the summary prints the password exactly once (R-61, R-60).
    const rows = await auditRows(context);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      action: "ops:break-glass-rotate",
      metadata: { args: [], outcome: "success" },
    });
    expect(JSON.stringify(rows[0]?.metadata)).not.toContain("password");

    const printed = captured.lines.filter((line) =>
      line.includes("break-glass rotate:")
    );

    expect(printed).toHaveLength(1);

    // The old password no longer verifies and the printed one does.
    const [credential] = await context.db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, userId));

    expect(
      await verifyPassword({
        hash: credential?.password ?? "",
        password: oldPassword,
      })
    ).toBe(false);

    // The command's output is the tenant-bound JSON log line; the one-time password is its `msg`.
    const line = z
      .object({ msg: z.string() })
      .safeParse(JSON.parse(printed[0] ?? "{}"));

    const newPassword = line.success
      ? (line.data.msg.match(/password: (\S+)$/)?.[1] ?? "")
      : "";

    expect(newPassword).toHaveLength(20);
    expect(
      await verifyPassword({
        hash: credential?.password ?? "",
        password: newPassword,
      })
    ).toBe(true);

    // The forced change is set, the authenticator is gone, and every session is deleted.
    const [owner] = await context.db
      .select({
        mustChangePassword: user.mustChangePassword,
        twoFactorEnabled: user.twoFactorEnabled,
      })
      .from(user)
      .where(eq(user.id, userId));

    expect(owner).toMatchObject({
      mustChangePassword: true,
      twoFactorEnabled: false,
    });
    expect(
      await context.db
        .select()
        .from(twoFactor)
        .where(eq(twoFactor.userId, userId))
    ).toHaveLength(0);
    expect(
      await context.db.select().from(session).where(eq(session.userId, userId))
    ).toHaveLength(0);
    expect(
      await context.db
        .select()
        .from(verification)
        .where(eq(verification.value, userId))
    ).toHaveLength(0);
  }, 120000);

  it("refuses a rotation when the deployment has no break-glass account", async () => {
    const { source, context } = await fixture();
    const captured = outputCapture();

    await expect(
      runGenieOps(["break-glass", "rotate"], {
        source,
        compiledModules: [],
        histories: [],
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).toMatch(/no break-glass account/);

    const rows = await auditRows(context);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "ops:break-glass-rotate",
      metadata: { outcome: "failure" },
    });
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
