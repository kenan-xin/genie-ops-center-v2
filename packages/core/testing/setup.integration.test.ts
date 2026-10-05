import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  migrationPlan,
  runMigrations,
  type MigrationHistory,
} from "../src/services/migrator/index.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

type SetupFixture = {
  readonly source: {
    readonly DATABASE_URL: string;
    readonly PUBLIC_URL: string;
    readonly KEYCLOAK_URL: string;
    readonly KEYCLOAK_REALM: string;
  };
  readonly compiledModules: readonly Module[];
  readonly histories: readonly MigrationHistory[];
  readonly observer: Client;
};

type ConfigFiles = {
  readonly tenantConfig: string;
  readonly brandingSeed: string;
};

type AuditRow = {
  readonly actor_user_id: string | null;
  readonly action: string;
  readonly metadata: {
    readonly osUser: string;
    readonly args: readonly string[];
    readonly outcome: string;
  };
};

type SetupStepRow = {
  readonly step: string;
  readonly state: string;
  readonly detail: string | null;
  readonly updated_at: Date;
};

function fixtureModule(): Module {
  return {
    ...validModule,
    identity: { ...validModule.identity, id: "fixture" },
    schema: {
      ...validModule.schema,
      migrationsTable: moduleLedgerTable("fixture"),
    },
  };
}

async function setupFixture(): Promise<SetupFixture> {
  const postgres = await startDisposablePostgres();
  const observer = new Client({ connectionString: postgres.url });

  await observer.connect();

  cleanups.push(async () => {
    await observer.end();
    await postgres.stop();
  });

  const source = {
    DATABASE_URL: postgres.url,
    PUBLIC_URL: "https://test.example.invalid",
    // The `clients` step records this address even when it skips, so client-only mode needs it
    // (R-54c); no call is made to it in the customer-mode runs.
    KEYCLOAK_URL: "https://keycloak.example.invalid",
    KEYCLOAK_REALM: "genie",
  };

  const compiledModules = [fixtureModule()];

  return {
    source,
    compiledModules,
    histories: [await history("fixture", "select 1;")],
    observer,
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
      migrationsTable: "__drizzle_migrations_fixture",
    }),
    table: moduleLedgerTable(name),
  };
}

async function configFiles(
  input: {
    readonly tenantYaml?: string;
    readonly brandingJson?: string;
  } = {}
): Promise<ConfigFiles> {
  const folder = await mkdtemp(join(tmpdir(), "genie-ops-setup-config-"));
  const tenantConfig = join(folder, "tenant.yaml");
  const brandingSeed = join(folder, "branding.seed.json");

  cleanups.push(() => rm(folder, { recursive: true, force: true }));

  await writeFile(tenantConfig, input.tenantYaml ?? validTenantYaml(), "utf8");
  await writeFile(
    brandingSeed,
    input.brandingJson ?? validBrandingSeed(),
    "utf8"
  );

  return { tenantConfig, brandingSeed };
}

function validTenantYaml(): string {
  return [
    "modules:",
    "  - fixture",
    "onboarding_mode: invite",
    "local_accounts: false",
    "first_administrators:",
    "  - admin@example.com",
    "break_glass_email: break-glass@example.com",
    "",
  ].join("\n");
}

function customerTenantYaml(): string {
  return [
    "modules:",
    "  - fixture",
    "realm: customer",
    "local_accounts: false",
    "first_administrators:",
    "  - admin@example.com",
    "break_glass_email: break-glass@example.com",
    "",
  ].join("\n");
}

function validBrandingSeed(): string {
  return `${JSON.stringify(
    {
      $schema: "../../../deploy/schemas/branding.seed.schema.json",
      company_name: "Example Group",
      product_name: "Example Ops",
      primary_color: "#1d4ed8",
      default_locale: "en",
      default_time_zone: "Europe/Berlin",
    },
    undefined,
    2
  )}\n`;
}

function outputCapture() {
  const lines: string[] = [];

  return {
    lines,
    output: (line: string) => lines.push(line),
    errorOutput: (line: string) => lines.push(line),
  };
}

function setupArgs(files: ConfigFiles): readonly string[] {
  return [
    "setup",
    "--tenant-config",
    files.tenantConfig,
    "--branding-seed",
    files.brandingSeed,
  ];
}

function setupOptions(
  fixture: SetupFixture,
  captured: ReturnType<typeof outputCapture>
) {
  return {
    source: fixture.source,
    compiledModules: fixture.compiledModules,
    histories: fixture.histories,
    ...captured,
  };
}

async function auditRows(observer: Client): Promise<AuditRow[]> {
  const result = await observer.query<AuditRow>(
    "select actor_user_id, action, metadata from audit_event order by occurred_at, id"
  );

  return result.rows;
}

describe("genie-ops setup", () => {
  it("runs migrations before seed, inserts the configured rows, and leaves a rerun unchanged", async () => {
    const fixture = await setupFixture();
    const files = await configFiles({ tenantYaml: customerTenantYaml() });
    const firstOutput = outputCapture();

    await expect(
      runGenieOps(setupArgs(files), setupOptions(fixture, firstOutput))
    ).resolves.toBe(0);

    const progress = firstOutput.lines.findIndex((line) =>
      line.includes("migration-history-done core")
    );

    expect(progress).toBeGreaterThanOrEqual(0);
    expect(
      firstOutput.lines.some((line) => line.includes("migration-pending"))
    ).toBe(true);

    await expect(
      fixture.observer.query("select step, state from setup_step order by step")
    ).resolves.toMatchObject({
      rows: [
        { step: "admin_seed", state: "done" },
        { step: "break_glass", state: "done" },
        // Client-only mode: the customer owns the realm, so these two settle as `skipped`
        // (R-54a) and the `clients` step still records the address (R-54c).
        { step: "clients", state: "skipped" },
        { step: "migrations", state: "done" },
        { step: "realm", state: "skipped" },
        { step: "roles", state: "done" },
        { step: "seed", state: "done" },
      ],
    });

    const completedSteps = await fixture.observer.query<SetupStepRow>(`
      select step, state, detail, updated_at
        from setup_step
       order by step
    `);

    expect(
      completedSteps.rows.every(
        (row) => row.state === "done" || row.state === "skipped"
      )
    ).toBe(true);

    await expect(
      fixture.observer.query<{ migrations_before_seed: boolean }>(`
        select (select updated_at from setup_step where step = 'migrations')
             < (select updated_at from setup_step where step = 'seed')
             as migrations_before_seed
      `)
    ).resolves.toMatchObject({ rows: [{ migrations_before_seed: true }] });

    await expect(
      fixture.observer.query(
        "select module_id, enabled from tenant_module order by module_id"
      )
    ).resolves.toMatchObject({
      rows: [{ module_id: "fixture", enabled: true }],
    });
    await expect(
      fixture.observer.query(
        `select onboarding_mode, local_accounts_enabled, session_idle_minutes,
                updated_by_user_id from tenant_settings`
      )
    ).resolves.toMatchObject({
      rows: [
        {
          onboarding_mode: "invite",
          local_accounts_enabled: false,
          session_idle_minutes: 15,
          updated_by_user_id: null,
        },
      ],
    });
    await expect(
      fixture.observer.query(
        `select company_name, primary_color, primary_foreground,
                updated_by_user_id from tenant_branding`
      )
    ).resolves.toMatchObject({
      rows: [
        {
          company_name: "Example Group",
          primary_color: "#1d4ed8",
          primary_foreground: "#ffffff",
          updated_by_user_id: null,
        },
      ],
    });

    const firstSettings = await fixture.observer.query(
      `update tenant_settings
          set onboarding_mode = 'jit', local_accounts_enabled = true, session_idle_minutes = 90
        returning onboarding_mode, local_accounts_enabled, session_idle_minutes`
    );

    const firstBranding = await fixture.observer.query(
      `update tenant_branding
          set company_name = 'Administrator edit'
        returning company_name, primary_color, primary_foreground`
    );

    await fixture.observer.query(
      "update tenant_module set enabled = false where module_id = 'fixture'"
    );

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));

    const secondOutput = outputCapture();

    await expect(
      runGenieOps(setupArgs(files), setupOptions(fixture, secondOutput))
    ).resolves.toBe(0);

    await expect(
      fixture.observer.query(
        `select onboarding_mode, local_accounts_enabled, session_idle_minutes
           from tenant_settings`
      )
    ).resolves.toMatchObject({ rows: firstSettings.rows });
    await expect(
      fixture.observer.query(
        "select company_name, primary_color, primary_foreground from tenant_branding"
      )
    ).resolves.toMatchObject({ rows: firstBranding.rows });
    await expect(
      fixture.observer.query(
        "select module_id, enabled from tenant_module order by module_id"
      )
    ).resolves.toMatchObject({
      rows: [{ module_id: "fixture", enabled: false }],
    });

    await expect(
      fixture.observer.query<SetupStepRow>(`
        select step, state, detail, updated_at
          from setup_step
         order by step
      `)
    ).resolves.toMatchObject({ rows: completedSteps.rows });

    const audits = await auditRows(fixture.observer);
    expect(audits).toHaveLength(2);
    expect(audits.map((row) => row.action)).toEqual(["ops:setup", "ops:setup"]);
    expect(audits.map((row) => row.metadata.outcome).toSorted()).toEqual([
      "success",
      "success",
    ]);
    expect(audits.every((row) => row.actor_user_id === null)).toBe(true);
  }, 120000);

  it("applies each tenant setting default when tenant.yaml omits it", async () => {
    const fixture = await setupFixture();

    const files = await configFiles({
      tenantYaml: [
        "modules:",
        "  - fixture",
        "realm: customer",
        "first_administrators:",
        "  - admin@example.com",
        "break_glass_email: break-glass@example.com",
        "",
      ].join("\n"),
    });

    const captured = outputCapture();

    await expect(
      runGenieOps(setupArgs(files), setupOptions(fixture, captured))
    ).resolves.toBe(0);
    await expect(
      fixture.observer.query(
        `select onboarding_mode, local_accounts_enabled, session_idle_minutes
           from tenant_settings`
      )
    ).resolves.toMatchObject({
      rows: [
        {
          onboarding_mode: "invite",
          local_accounts_enabled: false,
          session_idle_minutes: 15,
        },
      ],
    });
  }, 120000);

  it("writes realm_mode from tenant.yaml's realm, and defaults it to managed", async () => {
    const fixture = await setupFixture();

    const customer = await configFiles({ tenantYaml: customerTenantYaml() });

    await expect(
      runGenieOps(setupArgs(customer), setupOptions(fixture, outputCapture()))
    ).resolves.toBe(0);

    await expect(
      fixture.observer.query("select realm_mode from tenant_settings")
    ).resolves.toMatchObject({ rows: [{ realm_mode: "customer" }] });

    const managed = await configFiles();

    await expect(
      runGenieOps(setupArgs(managed), setupOptions(fixture, outputCapture()))
    ).resolves.not.toBe(0);

    await expect(
      fixture.observer.query("select realm_mode from tenant_settings")
    ).resolves.toMatchObject({ rows: [{ realm_mode: "customer" }] });
  }, 120000);

  it("refuses a setup run whose tenant.yaml realm differs from the recorded realm_mode", async () => {
    const fixture = await setupFixture();
    const customer = await configFiles({ tenantYaml: customerTenantYaml() });

    await expect(
      runGenieOps(setupArgs(customer), setupOptions(fixture, outputCapture()))
    ).resolves.toBe(0);

    await expect(
      fixture.observer.query("select realm_mode from tenant_settings")
    ).resolves.toMatchObject({ rows: [{ realm_mode: "customer" }] });

    const managed = await configFiles({ tenantYaml: validTenantYaml() });
    const refusedOutput = outputCapture();

    await expect(
      runGenieOps(setupArgs(managed), setupOptions(fixture, refusedOutput))
    ).resolves.not.toBe(0);

    expect(refusedOutput.lines.join("\n")).toContain("realm_mode");

    // The refusal is a reconciliation guard, not a step failure: the two steps stay skipped and
    // the recorded realm_mode is unchanged, so the mode was never changed by editing tenant.yaml.
    await expect(
      fixture.observer.query("select step, state from setup_step order by step")
    ).resolves.toMatchObject({
      rows: [
        { step: "admin_seed", state: "done" },
        { step: "break_glass", state: "done" },
        { step: "clients", state: "skipped" },
        { step: "migrations", state: "done" },
        { step: "realm", state: "skipped" },
        { step: "roles", state: "done" },
        { step: "seed", state: "done" },
      ],
    });
    await expect(
      fixture.observer.query("select realm_mode from tenant_settings")
    ).resolves.toMatchObject({ rows: [{ realm_mode: "customer" }] });
  }, 120000);

  it.each([
    ["tenant.yaml", "company_name", "tenantYaml"],
    ["branding.seed.json", "modules", "brandingJson"],
  ] as const)(
    "refuses the misplaced %s key %s and names its source file",
    async (file, key, inputKey) => {
      const fixture = await setupFixture();
      const tenantYaml = `${validTenantYaml()}company_name: Example Group\n`;

      const brandingJson = `${JSON.stringify(
        {
          $schema: "../../../deploy/schemas/branding.seed.schema.json",
          company_name: "Example Group",
          product_name: "Example Ops",
          default_locale: "en",
          default_time_zone: "Europe/Berlin",
          modules: ["fixture"],
        },
        undefined,
        2
      )}\n`;

      const files = await configFiles({
        [inputKey]: file === "tenant.yaml" ? tenantYaml : brandingJson,
      });

      const captured = outputCapture();

      await expect(
        runGenieOps(setupArgs(files), setupOptions(fixture, captured))
      ).resolves.not.toBe(0);

      expect(captured.lines.join("\n")).toContain(key);
      expect(captured.lines.join("\n")).toContain(file);

      await expect(auditRows(fixture.observer)).resolves.toMatchObject([
        {
          actor_user_id: null,
          action: "ops:setup",
          metadata: { outcome: "failure" },
        },
      ]);
    },
    120000
  );

  it("resumes after a seed transaction fails without leaving partial seed rows", async () => {
    const fixture = await setupFixture();
    const files = await configFiles({ tenantYaml: customerTenantYaml() });

    const migrationContext = createTenantContext(
      fixture.source,
      silentLogger(),
      fixture.compiledModules.map((module) => module.identity.id)
    );

    await runMigrations({
      env: migrationContext.env,
      pool: migrationContext.db.$client,
      histories: migrationPlan(fixture.histories),
      compiledModuleIds: fixture.compiledModules.map(
        (module) => module.identity.id
      ),
    });
    await migrationContext.db.$client.end();
    await fixture.observer.query(`
      create function reject_setup_seed_branding() returns trigger
      language plpgsql as $$
      begin
        raise exception 'injected seed transaction failure';
      end;
      $$;
      create trigger reject_setup_seed_branding
      before insert on tenant_branding
      for each row execute function reject_setup_seed_branding();
    `);

    const failedOutput = outputCapture();

    await expect(
      runGenieOps(setupArgs(files), setupOptions(fixture, failedOutput))
    ).resolves.not.toBe(0);

    await expect(
      fixture.observer.query(
        "select step, state, detail from setup_step order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "migrations", state: "done", detail: null },
        {
          step: "seed",
          state: "failed",
          detail: expect.stringContaining("injected seed transaction failure"),
        },
      ],
    });

    const failedDetail = await fixture.observer.query<{
      detail: string | null;
    }>("select detail from setup_step where step = 'seed'");

    expect(failedDetail.rows[0]?.detail).not.toMatch(/insert into|params:/i);

    await expect(
      fixture.observer.query("select count(*)::int as count from tenant_module")
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(
      fixture.observer.query(
        "select count(*)::int as count from tenant_settings"
      )
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(
      fixture.observer.query(
        "select count(*)::int as count from tenant_branding"
      )
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });

    await fixture.observer.query(`
      drop trigger reject_setup_seed_branding on tenant_branding;
      drop function reject_setup_seed_branding();
    `);

    const resumedOutput = outputCapture();

    await expect(
      runGenieOps(setupArgs(files), setupOptions(fixture, resumedOutput))
    ).resolves.toBe(0);
    await expect(
      fixture.observer.query("select step, state from setup_step order by step")
    ).resolves.toMatchObject({
      rows: [
        { step: "admin_seed", state: "done" },
        { step: "break_glass", state: "done" },
        { step: "clients", state: "skipped" },
        { step: "migrations", state: "done" },
        { step: "realm", state: "skipped" },
        { step: "roles", state: "done" },
        { step: "seed", state: "done" },
      ],
    });

    const audits = await auditRows(fixture.observer);
    expect(audits).toHaveLength(2);
    expect(audits.map((row) => row.metadata.outcome).toSorted()).toEqual([
      "failure",
      "success",
    ]);
    expect(audits.every((row) => row.action === "ops:setup")).toBe(true);
  }, 120000);

  it("records the migrations step failed when a module history fails after core creates setup_step", async () => {
    const fixture = await setupFixture();
    const files = await configFiles();

    const failing = await history(
      "fixture",
      "select * from missing_relation_for_failed_detail;"
    );

    const captured = outputCapture();

    await expect(
      runGenieOps(setupArgs(files), {
        ...setupOptions(fixture, captured),
        histories: [failing],
      })
    ).resolves.not.toBe(0);

    await expect(
      fixture.observer.query(
        "select step, state, detail from setup_step order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        {
          step: "migrations",
          state: "failed",
          detail: expect.stringContaining("missing_relation_for_failed_detail"),
        },
      ],
    });
  }, 120000);

  it("completes without mail variables and logs fresh-database migration progress", async () => {
    const fixture = await setupFixture();
    const files = await configFiles({ tenantYaml: customerTenantYaml() });
    const captured = outputCapture();

    expect(fixture.source).not.toHaveProperty("MAIL_PROVIDER");

    await expect(
      runGenieOps(setupArgs(files), setupOptions(fixture, captured))
    ).resolves.toBe(0);

    expect(
      captured.lines.some((line) =>
        line.includes("migration-history-start core")
      )
    ).toBe(true);
    expect(
      captured.lines.some((line) => line.includes("audit ops:setup"))
    ).toBe(false);
    await expect(auditRows(fixture.observer)).resolves.toMatchObject([
      {
        actor_user_id: null,
        action: "ops:setup",
        metadata: { outcome: "success" },
      },
    ]);
  }, 120000);

  it("writes the migration failure to command output when audit_event does not exist", async () => {
    const fixture = await setupFixture();
    const files = await configFiles();

    await fixture.observer.query(`
      create function reject_core_table_creation() returns event_trigger
      language plpgsql as $$
      begin
        raise exception 'injected migration failure before audit_event';
      end;
      $$;
      create event trigger reject_core_table_creation
      on ddl_command_start when tag in ('CREATE TABLE')
      execute function reject_core_table_creation();
    `);

    const captured = outputCapture();

    await expect(
      runGenieOps(setupArgs(files), setupOptions(fixture, captured))
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).toContain("(not recorded: 42P01)");
    expect(captured.lines.join("\n")).toContain(
      "injected migration failure before audit_event"
    );
    expect(
      captured.lines.some((line) =>
        line.includes("migration-history-start core")
      )
    ).toBe(true);
    await expect(
      fixture.observer.query(
        "select to_regclass('audit_event') is null as absent"
      )
    ).resolves.toMatchObject({ rows: [{ absent: true }] });
  }, 120000);
});
