import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyPassword } from "better-auth/crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { meetsPasswordRule } from "../src/lib/password/index.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  type MigrationHistory,
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const BREAK_GLASS_EMAIL = "break-glass@example.invalid";

const FIRST_ADMINISTRATOR = "first.admin@example.invalid";

const SECOND_ADMINISTRATOR = "second.admin@example.invalid";

type SetupFixture = {
  readonly source: { DATABASE_URL: string; PUBLIC_URL: string };
  readonly compiledModules: readonly Module[];
  readonly histories: readonly MigrationHistory[];
  readonly observer: Client;
};

type ConfigFiles = {
  readonly tenantConfig: string;
  readonly brandingSeed: string;
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

/** A second compiled module the setup may find registered disabled (R-27, R-55). */
function disabledModule(): Module {
  return {
    ...validModule,
    identity: {
      ...validModule.identity,
      id: "disabled-fixture",
      displayName: "Disabled fixture",
    },
    schema: {
      ...validModule.schema,
      migrationsTable: moduleLedgerTable("disabled-fixture"),
    },
    permissions: [
      { key: "disabled-fixture:use", label: "Use the disabled fixture" },
      {
        key: "disabled-fixture:admin",
        label: "Administer the disabled fixture",
      },
    ],
    defaultRoles: [
      {
        name: "Disabled fixture user",
        permissions: ["disabled-fixture:use"],
      },
    ],
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

  return {
    source: {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    },
    compiledModules: [fixtureModule()],
    histories: [await history("fixture", "select 1;")],
    observer,
  };
}

async function history(
  name: string,
  statement: string
): Promise<MigrationHistory> {
  const folder = await mkdtemp(join(tmpdir(), `genie-ops-identity-${name}-`));

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

function validTenantYaml(): string {
  return [
    "modules:",
    "  - fixture",
    "realm: customer",
    "onboarding_mode: invite",
    "local_accounts: false",
    "first_administrators:",
    `  - First.Admin@Example.Invalid`,
    `  - ${SECOND_ADMINISTRATOR}`,
    `break_glass_email: Break-Glass@Example.Invalid`,
    "",
  ].join("\n");
}

function validBrandingSeed(): string {
  return `${JSON.stringify(
    {
      $schema: "../../../deploy/schemas/branding.seed.schema.json",
      company_name: "Example Group",
      product_name: "Example Ops",
      default_locale: "en",
      default_time_zone: "Europe/Berlin",
    },
    undefined,
    2
  )}\n`;
}

async function configFiles(): Promise<ConfigFiles> {
  const folder = await mkdtemp(join(tmpdir(), "genie-ops-identity-config-"));
  const tenantConfig = join(folder, "tenant.yaml");
  const brandingSeed = join(folder, "branding.seed.json");

  cleanups.push(() => rm(folder, { recursive: true, force: true }));

  await writeFile(tenantConfig, validTenantYaml(), "utf8");
  await writeFile(brandingSeed, validBrandingSeed(), "utf8");

  return { tenantConfig, brandingSeed };
}

function outputCapture() {
  const output: string[] = [];
  const errorOutput: string[] = [];

  return {
    output: (line: string) => output.push(line),
    errorOutput: (line: string) => errorOutput.push(line),
    outputLines: output,
    errorLines: errorOutput,
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

/**
 * Runs the real migrator first, so a test can put a `tenant_module` row in place before setup's
 * `seed` step (which only inserts what is missing). It is the R-27 case: a module registered
 * disabled before the `roles` step runs.
 */
async function migrateFirst(fixture: SetupFixture): Promise<void> {
  const context = createTenantContext(
    fixture.source,
    silentLogger(),
    fixture.compiledModules.map((module) => module.identity.id)
  );

  try {
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan(fixture.histories),
      compiledModuleIds: fixture.compiledModules.map(
        (module) => module.identity.id
      ),
    });
  } finally {
    await context.db.$client.end();
  }
}

/** The one password the `break_glass` step printed, read from its JSON command line. */
function printedPassword(lines: readonly string[]): string {
  const line = lines.find((entry) => entry.includes("break_glass step:"));

  if (line === undefined) {
    throw new Error("the run printed no break_glass step line");
  }

  // SAFETY: the command sink is a pino json line, whose message is a string.
  const parsed = JSON.parse(line) as { readonly msg?: string };
  const match = /password: (\S+)$/.exec(parsed.msg ?? "");

  if (match?.[1] === undefined) {
    throw new Error("the break_glass line carried no password");
  }

  return match[1];
}

function passwordOccurrences(
  lines: readonly string[],
  password: string
): number {
  return lines.filter((line) => line.includes(password)).length;
}

async function setup(
  fixture: SetupFixture,
  captured: ReturnType<typeof outputCapture>,
  compiledModules: readonly Module[] = fixture.compiledModules
): Promise<number> {
  const files = await configFiles();

  return runGenieOps(setupArgs(files), {
    source: fixture.source,
    compiledModules,
    histories: fixture.histories,
    output: captured.output,
    errorOutput: captured.errorOutput,
  });
}

describe("the roles setup step (R-55, R-33)", () => {
  it("seeds the two system roles, Genie Administrators and each module's default roles", async () => {
    const fixture = await setupFixture();
    const disabled = disabledModule();

    await migrateFirst(fixture);
    await fixture.observer.query(
      "insert into tenant_module (module_id, enabled) values ('disabled-fixture', false)"
    );

    const captured = outputCapture();

    await expect(
      setup(fixture, captured, [fixtureModule(), disabled])
    ).resolves.toBe(0);

    const roles = await fixture.observer.query<{
      name: string;
      permissions: string[];
      is_system: boolean;
      module_id: string | null;
    }>(
      "select name, permissions, is_system, module_id from role order by name"
    );

    const byName = new Map(roles.rows.map((row) => [row.name, row]));

    expect([...byName.keys()]).toEqual([
      "Auditor",
      "Disabled fixture user",
      "Fixture user",
      "Tenant administrator",
    ]);

    expect(byName.get("Auditor")).toMatchObject({
      permissions: ["core:audit:read"],
      is_system: true,
      module_id: null,
    });

    const administrator = byName.get("Tenant administrator");

    expect(administrator?.is_system).toBe(true);
    expect(administrator?.permissions).toEqual(
      expect.arrayContaining([
        "core:people:manage",
        "core:groups:manage",
        "core:roles:manage",
        "core:branding:manage",
        "core:settings:manage",
        "core:audit:read",
        // The enabled module's admin key is appended (R-31).
        "fixture:admin",
      ])
    );
    // A disabled module gets its definition only, with no admin-key append (R-55).
    expect(administrator?.permissions).not.toContain("disabled-fixture:admin");

    expect(byName.get("Fixture user")).toMatchObject({
      permissions: ["fixture:use"],
      is_system: true,
      module_id: "fixture",
    });

    expect(byName.get("Disabled fixture user")).toMatchObject({
      permissions: ["disabled-fixture:use"],
      is_system: true,
      module_id: "disabled-fixture",
    });

    const assignments = await fixture.observer.query<{
      group_name: string;
      group_source: string;
      role_name: string;
      principal_type: string;
      scope_type: string | null;
      scope_id: string | null;
    }>(`
      select g.name as group_name, g.source as group_source, r.name as role_name,
             ra.principal_type, ra.scope_type, ra.scope_id
        from "group" g
        join role_assignment ra
          on ra.principal_type = 'group' and ra.principal_id = g.id::text
        join role r on r.id = ra.role_id
       where g.source = 'local'
    `);

    expect(assignments.rows).toEqual([
      {
        group_name: "Genie Administrators",
        group_source: "local",
        role_name: "Tenant administrator",
        principal_type: "group",
        scope_type: null,
        scope_id: null,
      },
    ]);
  }, 120000);
});

describe("the admin_seed setup step (R-56)", () => {
  it("pre-adds each initial administrator as a pending, invited local member without sending email", async () => {
    const fixture = await setupFixture();
    const captured = outputCapture();

    await expect(setup(fixture, captured)).resolves.toBe(0);

    const people = await fixture.observer.query<{
      email: string;
      status: string;
      onboarding: string;
    }>(
      `select email, status, onboarding from "user"
        where email in ('${FIRST_ADMINISTRATOR}', '${SECOND_ADMINISTRATOR}')
        order by email`
    );

    expect(people.rows).toEqual([
      {
        email: FIRST_ADMINISTRATOR,
        status: "pending",
        onboarding: "invited",
      },
      {
        email: SECOND_ADMINISTRATOR,
        status: "pending",
        onboarding: "invited",
      },
    ]);

    const memberships = await fixture.observer.query<{ count: number }>(`
      select count(*)::int as count
        from group_member gm
        join "group" g on g.id = gm.group_id
        join "user" u on u.id = gm.user_id
       where g.name = 'Genie Administrators'
         and g.source = 'local'
         and gm.source = 'local'
         and u.email in ('${FIRST_ADMINISTRATOR}', '${SECOND_ADMINISTRATOR}')
    `);

    expect(memberships.rows[0]?.count).toBe(2);

    // No mailer is configured; the step still succeeds because it sends nothing.
    const invitations = await fixture.observer.query<{ count: number }>(
      "select count(*)::int as count from audit_event where action = 'core:invitation_sent'"
    );

    expect(invitations.rows[0]?.count).toBe(0);
  }, 120000);
});

describe("the break_glass setup step (R-57, R-64)", () => {
  it("creates the account and its credential, and prints a rule-compliant password once", async () => {
    const fixture = await setupFixture();
    const captured = outputCapture();

    await expect(setup(fixture, captured)).resolves.toBe(0);

    const [person] = (
      await fixture.observer.query<{
        is_break_glass: boolean;
        must_change_password: boolean;
        status: string;
      }>(
        `select is_break_glass, must_change_password, status from "user" where email = '${BREAK_GLASS_EMAIL}'`
      )
    ).rows;

    expect(person).toEqual({
      is_break_glass: true,
      must_change_password: true,
      status: "active",
    });

    const [credential] = (
      await fixture.observer.query<{ provider_id: string; password: string }>(
        `select a.provider_id, a.password
           from account a
           join "user" u on u.id = a.user_id
          where u.email = '${BREAK_GLASS_EMAIL}'`
      )
    ).rows;

    expect(credential?.provider_id).toBe("credential");
    expect(credential?.password).toBeTruthy();

    const password = printedPassword(captured.outputLines);

    expect(meetsPasswordRule(password, BREAK_GLASS_EMAIL)).toBe(true);
    // The printed password is exactly the one stored hashed (D2-5).
    expect(
      await verifyPassword({
        hash: credential?.password ?? "",
        password,
      })
    ).toBe(true);

    // Printed once, on the command output, and nowhere else.
    expect(passwordOccurrences(captured.outputLines, password)).toBe(1);
    expect(passwordOccurrences(captured.errorLines, password)).toBe(0);

    const details = await fixture.observer.query<{ detail: string | null }>(
      "select detail from setup_step where detail is not null"
    );

    expect(details.rows).toEqual([]);

    const audits = await fixture.observer.query<{ metadata: string }>(
      "select metadata::text as metadata from audit_event"
    );

    expect(audits.rows.some((row) => row.metadata.includes(password))).toBe(
      false
    );
  }, 120000);

  it("refuses to flag a person who already has an identity-provider account (R-62)", async () => {
    const fixture = await setupFixture();

    await migrateFirst(fixture);

    await fixture.observer.query(`
      insert into "user" (id, name, email, email_verified, status)
      values ('existing-person', 'Existing', '${BREAK_GLASS_EMAIL}', true, 'active');
      insert into account (id, account_id, provider_id, user_id)
      values ('existing-keycloak', 'existing-person', 'keycloak', 'existing-person');
    `);

    const captured = outputCapture();

    await expect(setup(fixture, captured)).resolves.not.toBe(0);

    expect(captured.errorLines.join("\n")).toContain("refuses to mark");

    const [row] = (
      await fixture.observer.query<{ is_break_glass: boolean }>(
        `select is_break_glass from "user" where email = '${BREAK_GLASS_EMAIL}'`
      )
    ).rows;

    expect(row?.is_break_glass).toBe(false);

    const [credential] = (
      await fixture.observer.query<{ count: number }>(
        `select count(*)::int as count
           from account a join "user" u on u.id = a.user_id
          where u.email = '${BREAK_GLASS_EMAIL}' and a.provider_id = 'credential'`
      )
    ).rows;

    expect(credential?.count).toBe(0);

    const [step] = (
      await fixture.observer.query<{ state: string; detail: string | null }>(
        "select state, detail from setup_step where step = 'break_glass'"
      )
    ).rows;

    expect(step?.state).toBe("failed");
    expect(step?.detail).toContain("refuses to mark");
  }, 120000);

  it("is idempotent on a rerun and never reprints the password", async () => {
    const fixture = await setupFixture();
    const first = outputCapture();
    const second = outputCapture();

    await expect(setup(fixture, first)).resolves.toBe(0);
    await expect(setup(fixture, second)).resolves.toBe(0);

    const counts = await fixture.observer.query<{
      roles: number;
      groups: number;
      assignments: number;
      people: number;
      memberships: number;
      accounts: number;
    }>(`
      select
        (select count(*)::int from role) as roles,
        (select count(*)::int from "group" where source = 'local') as groups,
        (select count(*)::int from role_assignment) as assignments,
        (select count(*)::int from "user") as people,
        (select count(*)::int from group_member where source = 'local') as memberships,
        (select count(*)::int from account where provider_id = 'credential') as accounts
    `);

    // Fixture user + Tenant administrator + Auditor, one local group, one group assignment, two
    // administrators, the break-glass person, two memberships and one break-glass credential.
    expect(counts.rows[0]).toEqual({
      roles: 3,
      groups: 1,
      assignments: 1,
      people: 3,
      memberships: 2,
      accounts: 1,
    });

    // The second run skipped every done step, so it printed no password again.
    const password = printedPassword(first.outputLines);

    expect(passwordOccurrences(second.outputLines, password)).toBe(0);
  }, 120000);

  it("resumes after an induced failure without recording the password", async () => {
    const fixture = await setupFixture();

    await migrateFirst(fixture);

    await fixture.observer.query(`
      create function reject_break_glass_credential() returns trigger
      language plpgsql as $$
      begin
        raise exception 'injected break-glass credential failure';
      end;
      $$;
      create trigger reject_break_glass_credential
      before insert on account
      for each row execute function reject_break_glass_credential();
    `);

    const failed = outputCapture();

    await expect(setup(fixture, failed)).resolves.not.toBe(0);

    const [step] = (
      await fixture.observer.query<{ state: string; detail: string | null }>(
        "select state, detail from setup_step where step = 'break_glass'"
      )
    ).rows;

    expect(step?.state).toBe("failed");
    expect(step?.detail).toContain("injected break-glass credential failure");

    // The generated password was never committed or printed, so it reaches no sink.
    expect(failed.outputLines.some((line) => line.includes("password: "))).toBe(
      false
    );
    expect(
      failed.outputLines.some((line) => line.includes("break_glass step:"))
    ).toBe(false);
    expect(step?.detail).not.toContain("password:");

    const [people] = (
      await fixture.observer.query<{ count: number }>(
        `select count(*)::int as count from "user" where email = '${BREAK_GLASS_EMAIL}'`
      )
    ).rows;

    expect(people?.count).toBe(0);

    await fixture.observer.query(`
      drop trigger reject_break_glass_credential on account;
      drop function reject_break_glass_credential();
    `);

    const resumed = outputCapture();

    await expect(setup(fixture, resumed)).resolves.toBe(0);

    const [done] = (
      await fixture.observer.query<{ state: string }>(
        "select state from setup_step where step = 'break_glass'"
      )
    ).rows;

    expect(done?.state).toBe("done");

    const password = printedPassword(resumed.outputLines);

    expect(passwordOccurrences(resumed.outputLines, password)).toBe(1);
    expect(
      (
        await fixture.observer.query<{ count: number }>(
          `select count(*)::int as count from account a join "user" u on u.id = a.user_id where u.email = '${BREAK_GLASS_EMAIL}'`
        )
      ).rows[0]?.count
    ).toBe(1);
  }, 120000);
});
