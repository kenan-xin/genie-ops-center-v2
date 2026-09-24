import { userInfo } from "node:os";

import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { CORE_HISTORY, runMigrations } from "../src/services/migrator/index.ts";
import { ModuleManagementError } from "../src/services/module-management/index.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const PRIOR_ENABLED_AT = new Date("2025-01-02T03:04:05.000Z");

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

type Fixture = {
  readonly source: { DATABASE_URL: string; PUBLIC_URL: string };
  readonly compiledModules: readonly Module[];
  readonly context: TenantContext;
  readonly observer: Client;
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

type ModuleRow = {
  readonly module_id: string;
  readonly enabled: boolean;
  readonly enabled_at: Date | null;
  readonly config: {
    readonly title?: string;
    readonly endpoint?: string;
    readonly label?: string;
  };
};

type RetirementRow = {
  readonly retired_at: Date;
  readonly deletion_hold: boolean;
};

const requiredConfigurationModule: Module = {
  ...validModule,
  identity: {
    ...validModule.identity,
    id: "required-config",
    displayName: "Required configuration fixture",
  },
  schema: {
    ...validModule.schema,
    migrationsTable: moduleLedgerTable("required-config"),
  },
  configuration: {
    schema: z.object({ endpoint: z.string().url() }),
    section: { id: "required-config", title: "Required configuration" },
    fields: { endpoint: { id: "endpoint", title: "Endpoint URL" } },
  },
};

const compiledPlaceholderModule: Module = {
  ...validModule,
  identity: { ...validModule.identity, id: "placeholder" },
  schema: {
    ...validModule.schema,
    migrationsTable: moduleLedgerTable("placeholder"),
  },
};

async function createFixture(
  compiledModules: readonly Module[] = [validModule]
): Promise<Fixture> {
  const postgres = await startDisposablePostgres();

  const source = {
    DATABASE_URL: postgres.url,
    PUBLIC_URL: "https://test.example.invalid",
  };

  const moduleIds = compiledModules.map((module) => module.identity.id);
  const context = createTenantContext(source, silentLogger(), moduleIds);
  const observer = new Client({ connectionString: postgres.url });

  await observer.connect();

  cleanups.push(async () => {
    await context.db.$client.end();
    await observer.end();
    await postgres.stop();
  });

  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: [CORE_HISTORY],
    compiledModuleIds: moduleIds,
  });

  return { source, compiledModules, context, observer };
}

async function seedModule(
  observer: Client,
  moduleId: string,
  config: ModuleRow["config"] = {}
): Promise<void> {
  await observer.query(
    "insert into tenant_module (module_id, enabled, config) values ($1, false, $2)",
    [moduleId, config]
  );
}

function runnerOptions(
  fixture: Fixture,
  captured: ReturnType<typeof outputCapture>
) {
  const options = {
    source: fixture.source,
    histories: [],
    ...captured,
  };

  return {
    ...options,
    compiledModules: fixture.compiledModules,
  };
}

function outputCapture() {
  const lines: string[] = [];

  return {
    lines,
    output: (line: string) => lines.push(line),
    errorOutput: (line: string) => lines.push(line),
  };
}

async function auditRows(observer: Client): Promise<AuditRow[]> {
  const result = await observer.query<AuditRow>(
    "select actor_user_id, action, metadata from audit_event order by occurred_at, id"
  );

  return result.rows;
}

async function moduleRow(
  observer: Client,
  moduleId: string
): Promise<ModuleRow> {
  const result = await observer.query<ModuleRow>(
    "select module_id, enabled, enabled_at, config from tenant_module where module_id = $1",
    [moduleId]
  );

  const row = result.rows[0];

  if (row === undefined)
    throw new Error(`Missing tenant_module row for ${moduleId}`);

  return row;
}

function expectAudit(
  row: AuditRow | undefined,
  action: string,
  args: readonly string[],
  outcome: "success" | "failure"
): void {
  expect(row).toMatchObject({
    actor_user_id: null,
    action,
    metadata: {
      osUser: expect.any(String),
      args,
      outcome,
    },
  });
  expect(Object.keys(row?.metadata ?? {}).toSorted()).toEqual([
    "args",
    "osUser",
    "outcome",
  ]);
  expect(row?.metadata.osUser.length).toBeGreaterThan(0);
  expect(row?.metadata.osUser).toBe(userInfo().username);
}

describe("genie-ops module lifecycle", () => {
  it("module enable writes one success audit row and enables a no-required-config module only after explicit enable", async () => {
    const fixture = await createFixture([validModule]);
    await seedModule(fixture.observer, "fixture");
    const before = await moduleRow(fixture.observer, "fixture");

    expect(before.enabled).toBe(false);

    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "enable", "fixture"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).toBe(0);
    expect(captured.lines.join("\n")).not.toContain("failure");
    await expect(moduleRow(fixture.observer, "fixture")).resolves.toMatchObject(
      {
        module_id: "fixture",
        enabled: true,
        enabled_at: expect.any(Date),
      }
    );

    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-enable", ["fixture"], "success");
  }, 120000);

  it("module disable writes one success audit row and disables the module", async () => {
    const fixture = await createFixture([validModule]);
    await seedModule(fixture.observer, "fixture", {
      title: "Kept configuration",
    });
    await fixture.observer.query(
      "update tenant_module set enabled = true, enabled_at = now() where module_id = $1",
      ["fixture"]
    );
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "disable", "fixture"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).toBe(0);
    await expect(moduleRow(fixture.observer, "fixture")).resolves.toMatchObject(
      {
        module_id: "fixture",
        enabled: false,
        config: { title: "Kept configuration" },
      }
    );

    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-disable", ["fixture"], "success");
  }, 120000);

  it("module disable refuses a missing registration with one failure audit row and inserts nothing", async () => {
    const fixture = await createFixture([compiledPlaceholderModule]);
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "disable", "placeholder"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toContain("module-not-registered");
    await expect(
      fixture.observer.query(
        "select count(*)::int as count from tenant_module where module_id = $1",
        ["placeholder"]
      )
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-disable", ["placeholder"], "failure");
  }, 120000);

  it("module enable refuses a missing registration with one failure audit row and inserts nothing", async () => {
    const fixture = await createFixture([compiledPlaceholderModule]);
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "enable", "placeholder"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toContain("module-not-registered");
    await expect(
      fixture.observer.query(
        "select count(*)::int as count from tenant_module where module_id = $1",
        ["placeholder"]
      )
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-enable", ["placeholder"], "failure");
  }, 120000);

  it("setModuleEnabled refuses to enable an unregistered module without inserting a row", async () => {
    const fixture = await createFixture([compiledPlaceholderModule]);

    const { setModuleEnabled } =
      await import("../src/services/module-management/index.ts");

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "placeholder",
        true
      )
    ).rejects.toMatchObject({ code: "module-not-registered" });
    await expect(
      fixture.observer.query(
        "select count(*)::int as count from tenant_module where module_id = $1",
        ["placeholder"]
      )
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  }, 120000);

  it("setModuleEnabled refuses to disable an unregistered module without inserting a row", async () => {
    const fixture = await createFixture([compiledPlaceholderModule]);

    const { setModuleEnabled } =
      await import("../src/services/module-management/index.ts");

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "placeholder",
        false
      )
    ).rejects.toMatchObject({ code: "module-not-registered" });
    await expect(
      fixture.observer.query(
        "select count(*)::int as count from tenant_module where module_id = $1",
        ["placeholder"]
      )
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  }, 120000);

  it("setModuleEnabled reports transitions and preserves enabled_at on repeated enable and disable", async () => {
    const fixture = await createFixture([validModule]);
    await fixture.observer.query(
      "insert into tenant_module (module_id, enabled, enabled_at) values ($1, true, $2)",
      ["fixture", PRIOR_ENABLED_AT]
    );

    const { setModuleEnabled } =
      await import("../src/services/module-management/index.ts");

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        true
      )
    ).resolves.toEqual({ changed: false });
    await expect(moduleRow(fixture.observer, "fixture")).resolves.toMatchObject(
      {
        enabled: true,
        enabled_at: PRIOR_ENABLED_AT,
      }
    );

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        false
      )
    ).resolves.toEqual({ changed: true });
    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        false
      )
    ).resolves.toEqual({ changed: false });

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        true
      )
    ).resolves.toEqual({ changed: true });
    await expect(moduleRow(fixture.observer, "fixture")).resolves.toMatchObject(
      {
        enabled: true,
        enabled_at: expect.any(Date),
      }
    );
    expect(
      (await moduleRow(fixture.observer, "fixture")).enabled_at?.getTime()
    ).toBeGreaterThan(PRIOR_ENABLED_AT.getTime());
  }, 120000);

  it("module disable prints the cause, exits nonzero, and writes one failure audit row", async () => {
    const fixture = await createFixture([validModule]);
    await fixture.observer.query("drop table tenant_module");
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "disable", "fixture"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toMatch(/tenant_module|relation/i);
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-disable", ["fixture"], "failure");
  }, 120000);

  it("module disable skips required-configuration validation", async () => {
    const fixture = await createFixture([requiredConfigurationModule]);
    await seedModule(fixture.observer, "required-config");
    await fixture.observer.query(
      "update tenant_module set enabled = true, enabled_at = now() where module_id = $1",
      ["required-config"]
    );
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "disable", "required-config"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).toBe(0);
    await expect(
      moduleRow(fixture.observer, "required-config")
    ).resolves.toMatchObject({
      enabled: false,
      config: {},
    });
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-disable", ["required-config"], "success");
  }, 120000);

  it("module enable refuses a module that is not compiled in with one failure audit row", async () => {
    const fixture = await createFixture([]);
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "enable", "not-in-image"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toContain("not-in-image");
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-enable", ["not-in-image"], "failure");
    await expect(
      fixture.observer.query("select count(*)::int as count from tenant_module")
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  }, 120000);

  it("module enable refuses missing required configuration without changing the disabled row", async () => {
    const fixture = await createFixture([requiredConfigurationModule]);
    await seedModule(fixture.observer, "required-config");
    await fixture.observer.query(
      "update tenant_module set enabled_at = $2 where module_id = $1",
      ["required-config", PRIOR_ENABLED_AT]
    );

    const priorEnabledAt = (
      await moduleRow(fixture.observer, "required-config")
    ).enabled_at;

    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "enable", "required-config"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toContain("endpoint");
    await expect(
      moduleRow(fixture.observer, "required-config")
    ).resolves.toMatchObject({
      enabled: false,
      enabled_at: priorEnabledAt,
      config: {},
    });
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-enable", ["required-config"], "failure");
  }, 120000);

  it("module enable refuses invalid required configuration with actionable issues and without changing the disabled row", async () => {
    const fixture = await createFixture([requiredConfigurationModule]);
    await seedModule(fixture.observer, "required-config", {
      endpoint: "not a URL",
    });
    await fixture.observer.query(
      "update tenant_module set enabled_at = $2 where module_id = $1",
      ["required-config", PRIOR_ENABLED_AT]
    );

    const priorEnabledAt = (
      await moduleRow(fixture.observer, "required-config")
    ).enabled_at;

    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "enable", "required-config"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toContain("endpoint");
    await expect(
      moduleRow(fixture.observer, "required-config")
    ).resolves.toMatchObject({
      enabled: false,
      enabled_at: priorEnabledAt,
      config: { endpoint: "not a URL" },
    });
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-enable", ["required-config"], "failure");
  }, 120000);

  it("module enable activates a module with valid required configuration", async () => {
    const fixture = await createFixture([requiredConfigurationModule]);
    await seedModule(fixture.observer, "required-config", {
      endpoint: "https://service.example.invalid/api",
    });
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "enable", "required-config"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).toBe(0);
    await expect(
      moduleRow(fixture.observer, "required-config")
    ).resolves.toMatchObject({
      enabled: true,
      enabled_at: expect.any(Date),
      config: { endpoint: "https://service.example.invalid/api" },
    });
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-enable", ["required-config"], "success");
  }, 120000);

  it("setModuleEnabled writes the same tenant_module row as the module enable command", async () => {
    const fixture = await createFixture([validModule]);
    await seedModule(fixture.observer, "fixture", {
      title: "Shared procedure",
    });

    const { setModuleEnabled } =
      await import("../src/services/module-management/index.ts");

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        true
      )
    ).resolves.toEqual({ changed: true });
    const procedureRow = await moduleRow(fixture.observer, "fixture");

    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["module", "enable", "fixture"],
      runnerOptions(fixture, captured)
    );

    const commandRow = await moduleRow(fixture.observer, "fixture");

    expect(exitCode).toBe(0);
    expect(commandRow).toMatchObject({
      module_id: procedureRow.module_id,
      enabled: procedureRow.enabled,
      enabled_at: procedureRow.enabled_at,
      config: procedureRow.config,
    });
    expect(procedureRow.enabled).toBe(true);
    expect(commandRow.enabled_at).not.toBeNull();
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:module-enable", ["fixture"], "success");
  }, 120000);

  it("setModuleEnabled reports changes and preserves enabled_at on repeated enable and disable", async () => {
    const fixture = await createFixture([validModule]);
    await fixture.observer.query(
      "insert into tenant_module (module_id, enabled, enabled_at) values ($1, true, $2)",
      ["fixture", PRIOR_ENABLED_AT]
    );

    const { setModuleEnabled } =
      await import("../src/services/module-management/index.ts");

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        true
      )
    ).resolves.toEqual({ changed: false });
    await expect(moduleRow(fixture.observer, "fixture")).resolves.toMatchObject(
      {
        enabled: true,
        enabled_at: PRIOR_ENABLED_AT,
      }
    );

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        false
      )
    ).resolves.toEqual({ changed: true });
    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        false
      )
    ).resolves.toEqual({ changed: false });
    await expect(moduleRow(fixture.observer, "fixture")).resolves.toMatchObject(
      {
        enabled: false,
        enabled_at: PRIOR_ENABLED_AT,
      }
    );

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "fixture",
        true
      )
    ).resolves.toEqual({ changed: true });
    const reenabled = await moduleRow(fixture.observer, "fixture");
    expect(reenabled.enabled).toBe(true);
    expect(reenabled.enabled_at).toBeInstanceOf(Date);
    expect(reenabled.enabled_at?.getTime()).toBeGreaterThan(
      PRIOR_ENABLED_AT.getTime()
    );
  }, 120000);

  it("the core procedure reports stable errors and actionable issues for rejected enables", async () => {
    const fixture = await createFixture([requiredConfigurationModule]);
    await seedModule(fixture.observer, "required-config");
    await fixture.observer.query(
      "update tenant_module set enabled_at = $2 where module_id = $1",
      ["required-config", PRIOR_ENABLED_AT]
    );

    const priorEnabledAt = (
      await moduleRow(fixture.observer, "required-config")
    ).enabled_at;

    const { setModuleEnabled } =
      await import("../src/services/module-management/index.ts");

    await expect(
      setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "missing-module",
        true
      )
    ).rejects.toMatchObject({ code: "module-not-compiled" });

    let validationError: ModuleManagementError | undefined;

    try {
      await setModuleEnabled(
        fixture.context,
        fixture.compiledModules,
        "required-config",
        true
      );
    } catch (caught) {
      if (caught instanceof ModuleManagementError) validationError = caught;
    }

    expect(validationError).toBeInstanceOf(ModuleManagementError);
    expect(validationError?.code).toBe("module-config-invalid");
    const issues = validationError?.issues ?? [];
    expect(issues.length).toBeGreaterThan(0);

    for (const issue of issues) {
      expect(issue).toMatchObject({
        path: expect.any(String),
        message: expect.any(String),
      });
    }

    expect(issues).toContainEqual(
      expect.objectContaining({
        path: "endpoint",
        message: expect.any(String),
      })
    );

    await expect(
      moduleRow(fixture.observer, "required-config")
    ).resolves.toMatchObject({
      enabled: false,
      enabled_at: priorEnabledAt,
    });
  }, 120000);
});

describe("genie-ops retire", () => {
  it("writes one retirement row and leaves tenant data in place", async () => {
    const fixture = await createFixture([]);
    await seedModule(fixture.observer, "retained-module", {
      label: "Retained",
    });
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["retire"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).toBe(0);

    const retirement = await fixture.observer.query<RetirementRow>(
      "select retired_at, deletion_hold from retirement"
    );

    expect(retirement.rows).toHaveLength(1);
    expect(retirement.rows[0]?.retired_at).toBeInstanceOf(Date);
    expect(retirement.rows[0]?.deletion_hold).toBe(false);
    await expect(
      moduleRow(fixture.observer, "retained-module")
    ).resolves.toMatchObject({
      enabled: false,
      config: { label: "Retained" },
    });

    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:retire", [], "success");
  }, 120000);

  it("retire twice keeps the original retired_at value", async () => {
    const fixture = await createFixture([]);
    const firstOutput = outputCapture();

    expect(
      await runGenieOps(["retire"], runnerOptions(fixture, firstOutput))
    ).toBe(0);

    const first = await fixture.observer.query<RetirementRow>(
      "select retired_at, deletion_hold from retirement"
    );

    const firstRetiredAt = first.rows[0]?.retired_at;
    expect(firstRetiredAt).toBeInstanceOf(Date);

    const secondOutput = outputCapture();
    expect(
      await runGenieOps(["retire"], runnerOptions(fixture, secondOutput))
    ).toBe(0);

    const second = await fixture.observer.query<RetirementRow>(
      "select retired_at, deletion_hold from retirement"
    );

    expect(second.rows).toHaveLength(1);
    expect(second.rows[0]?.retired_at).toEqual(firstRetiredAt);
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.metadata.outcome)).toEqual([
      "success",
      "success",
    ]);
  }, 120000);

  it("retire prints the cause, exits nonzero, and writes one failure audit row", async () => {
    const fixture = await createFixture([]);
    await fixture.observer.query("drop table retirement");
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["retire"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toMatch(/retirement|relation/i);
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:retire", [], "failure");
  }, 120000);

  it("--confirm without a retirement row refuses with a clear cause", async () => {
    const fixture = await createFixture([]);
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["retire", "--confirm"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toMatch(/no retirement row/i);
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:retire", ["--confirm"], "failure");
  }, 120000);

  it("--confirm refuses before 90 days with a failure audit row and cause", async () => {
    const fixture = await createFixture([]);
    await fixture.observer.query(
      "insert into retirement (retired_at) values ($1)",
      [new Date(Date.now() - NINETY_DAYS_MS + 1000)]
    );
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["retire", "--confirm"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toMatch(/90|days/i);
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:retire", ["--confirm"], "failure");
  }, 120000);

  it("--confirm refuses while deletion_hold is set with a failure audit row and cause", async () => {
    const fixture = await createFixture([]);
    await fixture.observer.query(
      "insert into retirement (retired_at, deletion_hold) values ($1, true)",
      [new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)]
    );
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["retire", "--confirm"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).not.toBe(0);
    expect(captured.lines.join("\n")).toMatch(/hold/i);
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:retire", ["--confirm"], "failure");
  }, 120000);

  it("--confirm passes the age and hold checks after 90 days", async () => {
    const fixture = await createFixture([]);
    await fixture.observer.query(
      "insert into retirement (retired_at) values ($1)",
      [new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)]
    );
    await seedModule(fixture.observer, "retained-module", {
      label: "Retained",
    });
    const captured = outputCapture();

    const exitCode = await runGenieOps(
      ["retire", "--confirm"],
      runnerOptions(fixture, captured)
    );

    expect(exitCode).toBe(0);
    await expect(
      fixture.observer.query(
        "select module_id, enabled, config from tenant_module where module_id = $1",
        ["retained-module"]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          module_id: "retained-module",
          enabled: false,
          config: { label: "Retained" },
        },
      ],
    });

    const retirement = await fixture.observer.query<RetirementRow>(
      "select retired_at, deletion_hold from retirement"
    );

    expect(retirement.rows).toHaveLength(1);
    expect(retirement.rows[0]?.retired_at).toBeInstanceOf(Date);
    expect(retirement.rows[0]?.deletion_hold).toBe(false);
    await expect(
      moduleRow(fixture.observer, "retained-module")
    ).resolves.toMatchObject({
      enabled: false,
      config: { label: "Retained" },
    });
    const rows = await auditRows(fixture.observer);
    expect(rows).toHaveLength(1);
    expectAudit(rows[0], "ops:retire", ["--confirm"], "success");
    expect(captured.lines.join("\n")).toMatch(/checks passed/i);
    expect(captured.lines.join("\n")).toMatch(
      /deletion.*Section 5|Section 5.*deletion/i
    );
  }, 120000);
});
