import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import type { AuditMetadataValue } from "../src/services/audit/index.ts";
import { seedRoles } from "../src/services/authorization/index.ts";
import { ModuleManagementError } from "../src/services/module-management/index.ts";
import {
  listModules,
  setModuleCategory,
  switchModule,
} from "../src/services/modules/index.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import {
  assignRole,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The Modules page service of Spec 3 (R-82 to R-91a) against a real Postgres: the page and the
 * command line share one procedure, the page writes its own `core:` audit row in the procedure's
 * transaction, and the list reads the compiled modules, never `tenant_module` alone.
 */
function fixtureCopy(id: string, overrides: Partial<Module> = {}): Module {
  return {
    ...validModule,
    identity: { ...validModule.identity, id, displayName: `Module ${id}` },
    schema: { ...validModule.schema, migrationsTable: moduleLedgerTable(id) },
    ...overrides,
  };
}

const fixtureModule: Module = validModule;

/** Compiled, its stored config fails its schema, so an enable refuses. */
const requiredConfig = fixtureCopy("required-config", {
  configuration: {
    schema: z.object({ endpoint: z.string().url() }),
    section: { id: "required-config", title: "Required configuration" },
    fields: { endpoint: { id: "endpoint", title: "Endpoint URL" } },
  },
});

/** Compiled, but declares only an admin entry, so it has no place in a category. */
const headless = fixtureCopy("headless", {
  navigation: {
    pinned: [],
    entries: validModule.navigation.entries.filter(
      (entry) => entry.surface === "admin"
    ),
  },
});

const compiled = [requiredConfig, fixtureModule, headless];

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let actorUserId: string;

async function query<Row extends QueryResultRow = Record<string, string>>(
  text: string,
  values: unknown[] = []
) {
  return (await deployment.context.db.$client.query<Row>(text, values)).rows;
}

async function clock(): Promise<Date> {
  const [row] = await query<{ now: Date }>("select clock_timestamp() as now");

  if (row === undefined) throw new Error("the clock read returned no row");

  return row.now;
}

beforeAll(async () => {
  deployment = await startDisposableDeployment(compiled);

  // Registration belongs to the seed step; the excluded row is a module this image no longer carries.
  await query(
    "insert into tenant_module (module_id, enabled) select unnest($1::text[]), false",
    [["required-config", "fixture", "headless", "excluded"]]
  );

  await seedRoles(deployment.context, compiled);
  actorUserId = await insertUser(deployment.context, { name: "Admin" });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

let since: Date;

beforeEach(async () => {
  await query("update tenant_module set enabled = false, category_id = null");
  await query(
    "update role set permissions = array_remove(permissions, 'fixture:admin') where name = 'Tenant administrator'"
  );
  // audit_event is append-only, so each case reads only the rows written after it started.
  since = await clock();
});

type AuditRow = {
  readonly actor_user_id: string | null;
  readonly action: string;
  readonly target_type: string | null;
  readonly target_id: string | null;
  readonly summary: string;
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
};

async function auditRows(): Promise<AuditRow[]> {
  return query<AuditRow>(
    `select actor_user_id, action, target_type, target_id, summary, metadata
       from audit_event where occurred_at >= $1 order by occurred_at, id`,
    [since]
  );
}

async function enabledAndAdminKey(id: string) {
  const [module] = await query<{ enabled: boolean }>(
    "select enabled from tenant_module where module_id = $1",
    [id]
  );

  const [admin] = await query<{ held: boolean }>(
    "select $1 = any(permissions) as held from role where name = 'Tenant administrator'",
    [`${id}:admin`]
  );

  return { enabled: module?.enabled, adminKey: admin?.held };
}

function runCommand(argv: readonly string[]) {
  const lines: string[] = [];

  return runGenieOps(argv, {
    source: {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    compiledModules: compiled,
    histories: [],
    output: (line) => lines.push(line),
    errorOutput: (line) => lines.push(line),
  });
}

function placeFixture(categoryId: string | null) {
  return setModuleCategory(deployment.context, compiled, {
    actorUserId,
    moduleId: "fixture",
    categoryId,
  });
}

describe("the modules page service against a real database", () => {
  it("the page and the command line write the same tenant_module row", async () => {
    await expect(
      switchModule(deployment.context, compiled, {
        actorUserId,
        moduleId: "fixture",
        enabled: true,
      })
    ).resolves.toEqual({ changed: true });
    const fromPage = await enabledAndAdminKey("fixture");

    await query("update tenant_module set enabled = false");
    await query(
      "update role set permissions = array_remove(permissions, 'fixture:admin') where name = 'Tenant administrator'"
    );

    await expect(runCommand(["module", "enable", "fixture"])).resolves.toBe(0);
    const fromCommand = await enabledAndAdminKey("fixture");

    expect(fromPage).toEqual({ enabled: true, adminKey: true });
    expect(fromCommand).toEqual(fromPage);
  });

  it("a page switch writes one core row and no ops row; a command run writes one ops row and no core row", async () => {
    await switchModule(deployment.context, compiled, {
      actorUserId,
      moduleId: "fixture",
      enabled: true,
    });

    expect(await auditRows()).toEqual([
      {
        actor_user_id: actorUserId,
        action: "core:module_enabled",
        target_type: "module",
        target_id: "fixture",
        summary: "Switched on Fixture",
        metadata: {},
      },
    ]);

    since = await clock();

    await expect(runCommand(["module", "disable", "fixture"])).resolves.toBe(0);

    expect((await auditRows()).map((row) => row.action)).toEqual([
      "ops:module-disable",
    ]);
  });

  it("a repeated switch writes no audit row", async () => {
    const input = { actorUserId, moduleId: "fixture", enabled: false };

    await expect(
      switchModule(deployment.context, compiled, { ...input, enabled: true })
    ).resolves.toEqual({ changed: true });
    await expect(
      switchModule(deployment.context, compiled, { ...input, enabled: true })
    ).resolves.toEqual({ changed: false });
    await expect(
      switchModule(deployment.context, compiled, input)
    ).resolves.toEqual({ changed: true });
    await expect(
      switchModule(deployment.context, compiled, input)
    ).resolves.toEqual({ changed: false });

    expect((await auditRows()).map((row) => [row.action, row.summary])).toEqual(
      [
        ["core:module_enabled", "Switched on Fixture"],
        ["core:module_disabled", "Switched off Fixture"],
      ]
    );
  });

  it("an enable with an invalid stored config refuses with issues, leaves the row off, writes no audit row", async () => {
    await expect(
      switchModule(deployment.context, compiled, {
        actorUserId,
        moduleId: "required-config",
        enabled: true,
      })
    ).rejects.toMatchObject({
      name: ModuleManagementError.name,
      code: "module-config-invalid",
      issues: [expect.objectContaining({ path: "endpoint" })],
    });
    expect(await enabledAndAdminKey("required-config")).toMatchObject({
      enabled: false,
    });
    expect(await auditRows()).toEqual([]);
  });

  it("listModules lists compiled modules in image order, maps a dangling category id to null, lists holders of <id>:use and keeps holders of a disabled module", async () => {
    const [category] = await query(
      "insert into category (name, position) values ('Finance', 0) returning id"
    );

    const financeId = String(category?.id);

    await query(
      "update tenant_module set category_id = $1, enabled = true where module_id = 'fixture'",
      [financeId]
    );
    // R-91: a row whose category is gone. The foreign key normally nulls it, so it is bypassed here.
    await query(
      "set session_replication_role = replica; update tenant_module set category_id = gen_random_uuid() where module_id = 'headless'; set session_replication_role = origin"
    );

    const [userId, groupId, breakGlassId, useRole, readRole] =
      await Promise.all([
        insertUser(deployment.context, { name: "Ada" }),
        insertGroup(deployment.context, [], { name: "Analysts" }),
        insertUser(deployment.context, {
          name: "Break glass",
          isBreakGlass: true,
        }),
        insertRole(deployment.context, {
          name: "Config users",
          permissions: ["required-config:use", "fixture:read"],
        }),
        insertRole(deployment.context, {
          name: "Config readers",
          permissions: ["required-config:read"],
        }),
      ]);

    await Promise.all([
      assignRole(deployment.context, {
        roleId: useRole,
        principal: { type: "user", id: userId },
      }),
      assignRole(deployment.context, {
        roleId: useRole,
        principal: { type: "group", id: groupId },
      }),
      assignRole(deployment.context, {
        roleId: useRole,
        principal: { type: "user", id: breakGlassId },
      }),
      assignRole(deployment.context, {
        roleId: readRole,
        principal: { type: "user", id: userId },
      }),
    ]);

    const rows = await listModules(deployment.context, compiled);

    expect(
      rows.map(({ id, displayName, enabled, categoryId, placeable }) => ({
        id,
        displayName,
        enabled,
        categoryId,
        placeable,
      }))
    ).toEqual([
      {
        id: "required-config",
        displayName: "Module required-config",
        enabled: false,
        categoryId: null,
        placeable: true,
      },
      {
        id: "fixture",
        displayName: "Fixture",
        enabled: true,
        categoryId: financeId,
        placeable: true,
      },
      {
        id: "headless",
        displayName: "Module headless",
        enabled: false,
        categoryId: null,
        placeable: false,
      },
    ]);
    expect(rows[0]?.holders).toEqual([
      {
        principalType: "group",
        principalId: groupId,
        label: "Analysts",
        roleName: "Config users",
      },
      {
        principalType: "user",
        principalId: userId,
        label: "Ada",
        roleName: "Config users",
      },
    ]);
    expect(rows[1]?.holders).toEqual([]);
  });

  it("setModuleCategory refuses a module with no workspace entry and an unknown category, places a disabled module, writes one core:module_category_set row", async () => {
    const [category] = await query(
      "insert into category (name, position) values ('Operations', 1) returning id"
    );

    const categoryId = String(category?.id);

    const place = (moduleId: string, target: string | null) =>
      setModuleCategory(deployment.context, compiled, {
        actorUserId,
        moduleId,
        categoryId: target,
      });

    await expect(place("excluded", categoryId)).rejects.toMatchObject({
      code: "module-not-compiled",
    });
    await expect(place("headless", categoryId)).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(
      place("required-config", "00000000-0000-4000-8000-000000000000")
    ).rejects.toMatchObject({ code: "not-found" });
    expect(await auditRows()).toEqual([]);

    await expect(place("required-config", categoryId)).resolves.toEqual({
      changed: true,
    });

    const row = async () =>
      (
        await query(
          "select enabled, category_id from tenant_module where module_id = 'required-config'"
        )
      )[0];

    expect(await row()).toEqual({ enabled: false, category_id: categoryId });

    await expect(place("required-config", null)).resolves.toEqual({
      changed: true,
    });
    expect(await row()).toEqual({ enabled: false, category_id: null });

    const entry = {
      actor_user_id: actorUserId,
      action: "core:module_category_set",
      target_type: "module",
      target_id: "required-config",
    };

    expect(await auditRows()).toEqual([
      {
        ...entry,
        summary: "Placed Module required-config in Operations",
        metadata: { categoryId, previousCategoryId: null },
      },
      {
        ...entry,
        summary: "Removed Module required-config from its category",
        metadata: { categoryId: null, previousCategoryId: categoryId },
      },
    ]);
  });

  it("a repeated placement changes nothing and writes no audit row", async () => {
    const [category] = await query(
      "insert into category (name, position) values ('Repeat', 2) returning id"
    );

    const categoryId = String(category?.id);

    // The row starts under no category, so null again is not a change either.
    await expect(placeFixture(null)).resolves.toEqual({ changed: false });
    await expect(placeFixture(categoryId)).resolves.toEqual({ changed: true });
    await expect(placeFixture(categoryId)).resolves.toEqual({ changed: false });

    expect((await auditRows()).map((row) => row.action)).toEqual([
      "core:module_category_set",
    ]);
  });
});
