import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { navigationTree } from "../src/lib/entitlement/tree.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import {
  principalFor,
  seedRoles,
} from "../src/services/authorization/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { setModuleEnabled } from "../src/services/module-management/index.ts";
import {
  enableModules,
  insertPersonWith,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The navigation tree of Spec 3 AC-4 (R-28 to R-30, R-91) against a real Postgres: real category
 * rows, a real module placement and real role assignments, read through a fresh tenant context so
 * no cache carries a row from one case into the next.
 */
const fixtureModule: Module = {
  ...validModule,
  navigation: {
    ...validModule.navigation,
    entries: validModule.navigation.entries.map((entry) =>
      entry.id === "fixture-home"
        ? Object.assign({}, entry, { landing: true })
        : entry
    ),
  },
};

const modules = [fixtureModule];

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment(modules);
  await enableModules(deployment.context, ["fixture"]);
  await seedRoles(deployment.context, modules);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

/** The tree a fresh context on the same database builds for one person, with cold caches. */
async function treeFor(userId: string) {
  const tenant = createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    silentLogger(),
    ["fixture"]
  );

  try {
    return await navigationTree({
      tenant,
      modules,
      caller: principalFor({
        tenant,
        modules,
        userId,
        authenticated: true,
      }),
    });
  } finally {
    await tenant.db.$client.end();
  }
}

async function query(text: string, values: unknown[] = []) {
  return (await deployment.context.db.$client.query(text, values)).rows;
}

/** Inserts one category and places the fixture module in it, returning the category id. */
async function placeInCategory(name: string): Promise<string> {
  const [row] = await query(
    "insert into category (name, position) values ($1, 1) returning id",
    [name]
  );

  const id = String(row?.id);

  await query(
    "update tenant_module set category_id = $1 where module_id = 'fixture'",
    [id]
  );

  return id;
}

const labels = (entries: readonly { readonly label: string }[]) =>
  entries.map((entry) => entry.label);

describe("the navigation tree against a real database", () => {
  it("a holder of the use key lands on the landing route and sees its entries move under the module's category", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
    ]);

    const before = await treeFor(userId);

    expect(labels(before.workspace)).toEqual(["Fixture", "Archive"]);
    expect(before.categories).toEqual([]);
    expect(before.landing).toBe("/fixture");

    const financeId = await placeInCategory("Finance");
    const after = await treeFor(userId);

    expect(
      after.categories.map((group) => ({
        id: group.id,
        name: group.name,
        labels: labels(group.entries),
      }))
    ).toEqual([
      { id: financeId, name: "Finance", labels: ["Archive", "Fixture"] },
    ]);
    expect(after.workspace).toEqual([]);
    expect(after.landing).toBe("/fixture");
  });

  it("a person without the use key sees no workspace entry and no landing route, and an auditor sees only the audit log", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "core:audit:read",
    ]);

    const tree = await treeFor(userId);

    expect(tree.workspace).toEqual([]);
    expect(tree.categories).toEqual([]);
    expect(tree.landing).toBeUndefined();
    expect(
      tree.admin.map((group) => ({
        id: group.id,
        ids: group.entries.map((entry) => entry.id),
      }))
    ).toEqual([{ id: "tenant", ids: ["core-audit"] }]);
  });

  it("a disabled landing module leaves the tree and the landing route", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
    ]);

    await setModuleEnabled(deployment.context, modules, "fixture", false);

    try {
      const tree = await treeFor(userId);

      expect(tree.workspace).toEqual([]);
      expect(tree.categories).toEqual([]);
      expect(tree.landing).toBeUndefined();
    } finally {
      await setModuleEnabled(deployment.context, modules, "fixture", true);
    }
  });

  it("deleting the category returns the module's entries to the workspace block", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
    ]);

    const id = await placeInCategory("Operations");

    expect((await treeFor(userId)).workspace).toEqual([]);

    await query("delete from category where id = $1", [id]);

    const tree = await treeFor(userId);

    expect(labels(tree.workspace)).toEqual(["Fixture", "Archive"]);
    expect(tree.categories).toEqual([]);
    expect(tree.landing).toBe("/fixture");
  });
});
