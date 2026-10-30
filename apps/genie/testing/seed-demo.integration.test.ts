import { seedRoles } from "@genie/core";
import {
  DemoSeedRefused,
  enableModules,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { invoicesModule } from "@genie/module-invoices";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedDemo } from "./seed-demo.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The seed command writes only the owner's four kinds (role assignments, the reporting date, the
 * history PDFs through FileStorage, the demo pack history), writes nothing on a second run, and
 * refuses a database that is not ready before it writes anything. It reads tables directly,
 * because the owner's write list names tables.
 */
type Deployment = Awaited<ReturnType<typeof startDisposableDeployment>>;

const DEMO_EMAIL = "demo@example.invalid";

const stops: (() => Promise<void>)[] = [];

afterAll(async () => {
  for (const stop of stops) {
    // oxlint-disable-next-line no-await-in-loop -- each container stops in turn.
    await stop().catch(() => undefined);
  }
});

async function start(
  modules: Parameters<typeof startDisposableDeployment>[0]
): Promise<Deployment> {
  const deployment = await startDisposableDeployment(modules);
  stops.push(deployment.stop);
  await markSetupDone(deployment.context);

  return deployment;
}

/** The row count of every base table in `public`, `drizzle` and `pgboss` (when present). */
async function tableCounts(
  deployment: Deployment
): Promise<Record<string, number>> {
  const client = deployment.context.db.$client;
  const { rows: tables } = await client.query<{ name: string }>(
    `select format('%I.%I', table_schema, table_name) as name from information_schema.tables
     where table_type = 'BASE TABLE' and table_schema in ('public', 'drizzle', 'pgboss')
     order by 1`
  );
  const counts: Record<string, number> = {};

  for (const { name } of tables) {
    // oxlint-disable-next-line no-await-in-loop -- one count per table on the one pool.
    const { rows } = await client.query<{ count: number }>(
      `select count(*)::int as count from ${name}`
    );
    counts[name] = rows[0]?.count ?? 0;
  }

  return counts;
}

/** The settings row as text, so that a change to any column shows. */
async function settings(deployment: Deployment): Promise<string> {
  const { rows } = await deployment.context.db.$client.query(
    "select * from tenant_settings"
  );

  return JSON.stringify(rows);
}

function changes(
  before: Record<string, number>,
  after: Record<string, number>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(after)
      .map(([table, count]): [string, number] => [
        table,
        count - (before[table] ?? 0),
      ])
      .filter(([, delta]) => delta !== 0)
  );
}

describe("the demo seed command", () => {
  let deployment: Deployment;
  let demoId: string;
  const run = (dryRun: boolean) =>
    seedDemo({
      databaseUrl: deployment.context.env.databaseUrl,
      // The address as an operator might type it; people are found by the lower-case address.
      email: "Demo@Example.invalid",
      moduleIds: ["invoices"],
      dryRun,
    });

  beforeAll(async () => {
    deployment = await start([invoicesModule]);
    await enableModules(deployment.context, ["invoices"]);
    await seedRoles(deployment.context, [invoicesModule]);
    demoId = await insertUser(deployment.context, {
      email: DEMO_EMAIL,
      name: "Demo account",
    });
  }, 240000);

  // The three cases run in order on one deployment: a dry run, the first run, then the second.
  it("answers the four numbered lines on a fresh deployment in a dry run and writes nothing", async () => {
    const before = await tableCounts(deployment);
    const settingsBefore = await settings(deployment);

    const lines = await run(true);

    expect(lines.slice(1)).toEqual([
      `Demo account: user ${demoId}`,
      "Modules: invoices",
      "1. Role assignments for the demo account: 3 to write, 0 already present (Finance, Invoices and Payments user, Viewer)",
      "2. Reporting date: blank -> 2026-10-27",
      "3. History PDFs through FileStorage: 66 to write, 0 already present (file, file_blob and document rows)",
      "4. Demo pack history: 36 invoices and 30 payments to write, 0 and 0 already present (customer, invoice, payment, allocation, allocation_event and audit_event rows)",
      "Dry run: nothing written.",
    ]);
    expect(changes(before, await tableCounts(deployment))).toEqual({});
    expect(await settings(deployment)).toEqual(settingsBefore);
  });

  it("writes only the owner's list on the first run and grants the demo person tenant-wide", async () => {
    const before = await tableCounts(deployment);
    const client = deployment.context.db.$client;

    const lines = await run(false);

    expect(lines[0]).toMatch(/^Demo seed for [^@/]+:\d+\/[^/]+$/);
    expect(lines.join("\n")).not.toContain(DEMO_EMAIL);
    expect(lines.at(-1)).toBe("Written.");

    const { rows: audit } = await client.query<{ count: number }>(
      "select count(*)::int as count from audit_event where actor_user_id = $1",
      [demoId]
    );
    expect(audit[0]?.count).toBeGreaterThan(0);
    expect(changes(before, await tableCounts(deployment))).toEqual({
      "public.role_assignment": 3,
      "public.file": 66,
      "public.file_blob": 66,
      "public.document": 66,
      "public.customer": 6,
      "public.invoice": 36,
      "public.payment": 30,
      "public.allocation": 30,
      "public.allocation_event": 30,
      // Every new audit row names the demo account; the module writes them, not the seed.
      "public.audit_event": audit[0]?.count,
    });

    const { rows: grants } = await client.query(
      `select r.name, a.principal_type, a.principal_id, a.scope_type, a.scope_id
       from role_assignment a join role r on r.id = a.role_id
       where r.module_id = 'invoices' order by r.name`
    );
    expect(grants).toEqual(
      ["Finance", "Invoices and Payments user", "Viewer"].map((name) => ({
        name,
        principal_type: "user",
        principal_id: demoId,
        scope_type: null,
        scope_id: null,
      }))
    );

    const { rows: date } = await client.query<{ reporting_date: string }>(
      "select reporting_date::text from tenant_settings"
    );
    expect(date).toEqual([{ reporting_date: "2026-10-27" }]);
  }, 180000);

  it("changes no row and no setting on a second run", async () => {
    const before = await tableCounts(deployment);
    const settingsBefore = await settings(deployment);

    const lines = await run(false);

    expect(lines.slice(3)).toEqual([
      "1. Role assignments for the demo account: 0 to write, 3 already present (Finance, Invoices and Payments user, Viewer)",
      "2. Reporting date: 2026-10-27, already set",
      "3. History PDFs through FileStorage: 0 to write, 66 already present (file, file_blob and document rows)",
      "4. Demo pack history: 0 invoices and 0 payments to write, 36 and 30 already present (customer, invoice, payment, allocation, allocation_event and audit_event rows)",
      "Already seeded: nothing to write.",
    ]);
    expect(changes(before, await tableCounts(deployment))).toEqual({});
    expect(await settings(deployment)).toEqual(settingsBefore);
  });
});

describe("the demo seed command on a database that is not ready", () => {
  let ready: Deployment;
  let bare: Deployment;

  beforeAll(async () => {
    ready = await start([invoicesModule]);
    await insertUser(ready.context, { email: DEMO_EMAIL });
    bare = await start([]);
    await insertUser(bare.context, { email: DEMO_EMAIL });
  }, 240000);

  const cases = [
    {
      name: "the module switched off",
      deployment: () => ready,
      enabled: false,
      roles: true,
      email: DEMO_EMAIL,
      refusal:
        "Invoices and Payments is switched off on this deployment. An administrator switches it on in Admin > Modules, then you run the seed again.",
    },
    {
      name: "no person with the address",
      deployment: () => ready,
      enabled: true,
      roles: true,
      email: "nobody@example.invalid",
      refusal:
        "no person has the address in DEMO_ACCOUNT_EMAIL. The demo account signs in once, then you run the seed again.",
    },
    {
      name: "no role of the module",
      deployment: () => ready,
      enabled: true,
      roles: false,
      email: DEMO_EMAIL,
      refusal:
        "the invoices module has no roles on this deployment. Switching the module on in Admin > Modules creates them.",
    },
    {
      name: "no module tables",
      deployment: () => bare,
      enabled: true,
      roles: false,
      email: DEMO_EMAIL,
      refusal:
        "the invoices tables do not exist on this database. Start the app on it once, so that it applies the module migrations, then run the seed again.",
    },
  ];

  it.each(cases)(
    "refuses $name and writes nothing",
    async ({ deployment, enabled, roles, email, refusal }) => {
      const target = deployment();
      const client = target.context.db.$client;
      await client.query(
        "insert into tenant_module (module_id, enabled) values ('invoices', $1) on conflict (module_id) do update set enabled = $1",
        [enabled]
      );
      if (target === ready) {
        await client.query("delete from role where module_id = 'invoices'");
        if (roles) await seedRoles(target.context, [invoicesModule]);
      }
      const before = await tableCounts(target);
      const settingsBefore = await settings(target);

      const answer = seedDemo({
        databaseUrl: target.context.env.databaseUrl,
        email,
        moduleIds: ["invoices"],
        dryRun: false,
      });

      await expect(answer).rejects.toThrow(DemoSeedRefused);
      await expect(answer).rejects.toThrow(refusal);
      expect(changes(before, await tableCounts(target))).toEqual({});
      expect(await settings(target)).toEqual(settingsBefore);
    }
  );
});
