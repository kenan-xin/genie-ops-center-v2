import {
  PERMISSION_TRANSFORMATION_ACTION,
  can,
  migrationPlan,
  moduleHistory,
  principalFor,
  runMigrations,
  seedRoles,
} from "@genie/core";
import {
  assignRole,
  enableModules,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * An existing deployment of the older release, whose Invoices roles were seeded as Finance and
 * Viewer, upgrades to this release (R-33c, Spec 7 R-39, czjw.100).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const roles: Record<string, string> = {};

const people: Record<string, string> = {};

const t = () => deployment.context;

async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await t().db.$client.query(text, values);

  // SAFETY: each caller names the columns its own statement selects as `T`.
  return result.rows as T[];
}

const assignments = () =>
  query(
    "select id, role_id, principal_type, principal_id, scope_type, scope_id from role_assignment order by id"
  );

const request = (userId: string) =>
  principalFor({
    tenant: t(),
    modules: [invoicesModule],
    userId,
    authenticated: true,
  });

beforeAll(async () => {
  // The older release: the same module with no transformation, so the start renames nothing.
  deployment = await startDisposableDeployment([
    { ...invoicesModule, permissionTransformations: [] },
  ]);
  await enableModules(t(), ["invoices"]);

  const old = { moduleId: "invoices", isSystem: true } as const;

  roles.user = await insertRole(t(), {
    ...old,
    name: "Invoices and Payments user",
    permissions: ["invoices:use"],
  });
  roles.finance = await insertRole(t(), {
    ...old,
    name: "Finance",
    permissions: ["invoices:use", "invoices:read", "invoices:write"],
  });
  roles.viewer = await insertRole(t(), {
    ...old,
    name: "Viewer",
    permissions: ["invoices:use", "invoices:read"],
  });

  people.finance = await insertUser(t());
  people.member = await insertUser(t());
  await assignRole(t(), {
    roleId: roles.finance,
    principal: { type: "user", id: people.finance },
  });
  await assignRole(t(), {
    roleId: roles.viewer,
    principal: { type: "group", id: await insertGroup(t(), [people.member]) },
  });
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

describe("invoices roles on an existing deployment", () => {
  it("renames Finance and Viewer, keeping their ids, assignments and access", async () => {
    const before = await assignments();

    await runMigrations({
      env: t().env,
      pool: t().db.$client,
      histories: migrationPlan([moduleHistory(invoicesModule)]),
      compiledModuleIds: ["invoices"],
    });
    await seedRoles(t(), [invoicesModule]);

    expect(
      await query(
        "select id::text, name from role where module_id = 'invoices' order by name"
      )
    ).toEqual([
      { id: roles.finance, name: "Invoices and Payments editor" },
      { id: roles.user, name: "Invoices and Payments user" },
      { id: roles.viewer, name: "Invoices and Payments viewer" },
    ]);
    expect(await assignments()).toEqual(before);
    expect(await can(request(people.finance ?? ""), "invoices:write")).toBe(
      true
    );
    expect(await can(request(people.member ?? ""), "invoices:read")).toBe(true);
    expect(
      await query(
        "select target_id from audit_event where action = $1 and metadata->>'history' = 'invoices' order by target_id",
        [PERMISSION_TRANSFORMATION_ACTION]
      )
    ).toEqual([{ target_id: "Finance" }, { target_id: "Viewer" }]);
  });
});
