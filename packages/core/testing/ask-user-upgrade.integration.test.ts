import { afterEach, describe, expect, it } from "vitest";

import coreJournal from "../drizzle/meta/_journal.json" with { type: "json" };
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  CORE_HISTORY,
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { markSetupDone, startDisposablePostgres } from "./index.ts";

/**
 * Core migration 0010 against a real Postgres with the real core history (Spec 2 R-33, R-33a, A7).
 * A deployment whose `roles` setup step finished before this release never runs that step again,
 * so the migration is its only path to the system role `Ask user`.
 */
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const askIndex = coreJournal.entries.findIndex(
  (entry) => entry.tag === "0010_ask_user_role"
);

/** A database migrated to just before 0010 and set up, as a deployment of the last release. */
async function setUpBeforeThisRelease() {
  expect(askIndex).toBeGreaterThan(0);

  const postgres = await startDisposablePostgres();

  const context = createTenantContext(
    { DATABASE_URL: postgres.url, PUBLIC_URL: "https://test.example.invalid" },
    silentLogger(),
    []
  );

  cleanups.push(async () => {
    await context.db.$client.end();
    await postgres.stop();
  });

  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: [
      {
        ...CORE_HISTORY,
        migrations: CORE_HISTORY.migrations.slice(0, askIndex),
      },
    ],
    compiledModuleIds: [],
  });
  await markSetupDone(context);

  const upgrade = () =>
    runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [],
    });

  return { client: context.db.$client, upgrade };
}

describe("the Ask user role on an existing deployment (R-33, R-33a)", () => {
  it("gives a deployment set up before this release the Ask user role, assigned to nobody", async () => {
    const { client, upgrade } = await setUpBeforeThisRelease();

    await client.query(`
      insert into "user" (id, name, email) values ('u1', 'Person', 'u1@example.invalid');
      insert into role (name, permissions, is_system) values
        ('Tenant administrator', array['core:roles:manage'], true),
        ('Auditor', array['core:audit:read'], true);
      insert into role_assignment (role_id, principal_type, principal_id)
        select id, 'user', 'u1' from role where name = 'Tenant administrator';
    `);

    const read = async () => ({
      roles: (
        await client.query(
          "select id, name, permissions, is_system, module_id from role where name <> 'Ask user' order by name"
        )
      ).rows,
      assignments: (
        await client.query("select * from role_assignment order by id")
      ).rows,
    });

    const before = await read();

    await upgrade();

    const ask = await client.query(
      "select id, permissions, is_system, module_id from role where name = 'Ask user'"
    );

    expect(ask.rows).toEqual([
      {
        id: expect.any(String),
        permissions: ["core:ask:use"],
        is_system: true,
        module_id: null,
      },
    ]);
    // The upgrade assigns the new role to nobody and changes no other role or grant.
    expect(await read()).toEqual(before);
  });

  it("keeps a custom role named Ask user as it is, also when the insert runs twice", async () => {
    const { client, upgrade } = await setUpBeforeThisRelease();

    const custom = await client.query<{ id: string }>(
      "insert into role (name, permissions) values ('Ask user', array['core:audit:read']) returning id"
    );

    await upgrade();

    // The migration holds one statement, so it runs again as one query.
    await client.query(
      (CORE_HISTORY.migrations[askIndex]?.sql ?? []).join("\n")
    );

    const rows = await client.query(
      "select id, permissions, is_system from role where name = 'Ask user'"
    );

    expect(rows.rows).toEqual([
      {
        id: custom.rows[0]?.id,
        permissions: ["core:audit:read"],
        is_system: false,
      },
    ]);
  });
});
