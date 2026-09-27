import {
  createTenantContext,
  principalFor,
  seedRoles,
  setModuleEnabled,
  TENANT_ADMINISTRATOR_ROLE,
  type ModuleRequestContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placeholderModule } from "../src/module.ts";
import { placeholderRouter } from "../src/router.ts";
import { insertPlaceholderRecord } from "./factories.ts";

/**
 * The read path against a real Postgres, with the real histories applied. No part of the
 * database is mocked (R-38).
 *
 * This file needs a container runtime. Bead `genie-ops-center-v2-2tc` holds the gap on this
 * host: it is not written to pass without one, and it must never be skipped to go green.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);

  // The read procedure's `createModuleTRPC` gate refuses a disabled module before `can()`, so
  // the deployment starts disabled and the setup enables it: the read cases below prove the
  // authorization path, not the entitlement refusal.
  await enableModules(deployment.context, ["placeholder"]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

/** One request for a real person, read through the real loader. */
function contextFor(userId: string) {
  return {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: [placeholderModule],
      userId,
    }),
  } satisfies ModuleRequestContext;
}

/** A person holding `placeholder:read` through a real role assignment. */
async function reader(): Promise<string> {
  const { userId } = await insertPersonWith(deployment.context, [
    "placeholder:read",
  ]);

  return userId;
}

describe("the placeholder read procedure against a real database", () => {
  it("answers the rows this deployment holds", async () => {
    const row = await insertPlaceholderRecord(deployment.context, {
      label: "A read row",
    });

    const caller = placeholderRouter.createCaller(contextFor(await reader()));

    const rows = await caller.read();

    expect(rows.map((entry) => entry.id)).toContain(row.id);
    expect(rows.map((entry) => entry.label)).toContain("A read row");
  });

  it("refuses a caller without the key, and reads nothing", async () => {
    // A real person holding another key of this module, which does not open the read.
    const { userId } = await insertPersonWith(deployment.context, [
      "placeholder:use",
    ]);

    const caller = placeholderRouter.createCaller(contextFor(userId));

    await expect(caller.read()).rejects.toThrow("FORBIDDEN");
  });

  it("refuses the read with module-disabled when the placeholder entitlement is off", async () => {
    const tenant = createTenantContext(
      {
        DATABASE_URL: deployment.context.env.databaseUrl,
        PUBLIC_URL: deployment.context.env.publicUrl,
      },
      { error: () => {}, info: () => {} },
      ["placeholder"]
    );

    try {
      await tenant.db.$client.query(
        "insert into tenant_module (module_id, enabled) values ('placeholder', false) on conflict (module_id) do update set enabled = false"
      );

      const caller = placeholderRouter.createCaller({
        tenant,
        caller: principalFor({
          tenant,
          modules: [placeholderModule],
          userId: await reader(),
        }),
      } satisfies ModuleRequestContext);

      await expect(caller.read()).rejects.toMatchObject({
        cause: { code: "module-disabled" },
      });
    } finally {
      await tenant.db.$client.end();
      // Later cases read through the router, so the entitlement is switched back on.
      await enableModules(deployment.context, ["placeholder"]);
    }
  });

  it("refuses an anonymous caller", async () => {
    const caller = placeholderRouter.createCaller({
      tenant: deployment.context,
      caller: principalFor({
        tenant: deployment.context,
        modules: [placeholderModule],
        userId: undefined,
      }),
    });

    await expect(caller.read()).rejects.toThrow("FORBIDDEN");
  });

  it("appends placeholder:admin to Tenant administrator on enable and removes it on disable", async () => {
    await seedRoles(deployment.context, [placeholderModule]);

    const administrator = async () =>
      (
        await deployment.context.db.$client.query<{ permissions: string[] }>(
          "select permissions from role where name = $1",
          [TENANT_ADMINISTRATOR_ROLE]
        )
      ).rows[0]?.permissions;

    expect(await administrator()).toContain("placeholder:admin");

    await setModuleEnabled(
      deployment.context,
      [placeholderModule],
      "placeholder",
      false
    );

    expect(await administrator()).not.toContain("placeholder:admin");

    await setModuleEnabled(
      deployment.context,
      [placeholderModule],
      "placeholder",
      true
    );

    expect(await administrator()).toContain("placeholder:admin");
    expect(await administrator()).not.toContain("placeholder:use");
  });

  it("keeps core's ledger and the module's ledger apart", async () => {
    // Drizzle writes a ledger into its own `drizzle` schema, so the name is not searched for
    // on the default path. The catalogue is asked instead, which is why the schema is read
    // rather than assumed.
    const ledgers = await deployment.context.db.$client.query<{
      tablename: string;
    }>(
      `select tablename from pg_tables
       where tablename in ('__drizzle_migrations', '__drizzle_migrations_placeholder')
       order by tablename`
    );

    expect(ledgers.rows.map((row) => row.tablename)).toEqual([
      "__drizzle_migrations",
      "__drizzle_migrations_placeholder",
    ]);
  });

  it("recorded the module's one migration in the module's ledger", async () => {
    const applied = await deployment.context.db.$client.query<{
      count: number;
    }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations_placeholder"
    );

    expect(applied.rows[0]?.count).toBe(2);
  });
});
