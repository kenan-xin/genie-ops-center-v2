import {
  callProcedure,
  principalFor,
  registerModuleRuntime,
  seedRoles,
} from "@genie/core";
import {
  DemoSeedRefused,
  enableModules,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { analyticsModule, analyticsRouter } from "@genie/module-analytics";
import { invoicesModule } from "@genie/module-invoices";
import { readDemoCsv } from "@genie/module-invoices/testing";
import type { ChartData } from "@genie/ui";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedDemo } from "./seed-demo.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The seed command writes only the owner's six kinds (role assignments, the reporting date, the
 * evaluated model connection, the history PDFs through FileStorage, the demo pack history, the
 * Receivables overview starter dashboard when analytics is listed), writes nothing on a second run, and
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

const MODULES = [invoicesModule, analyticsModule];

describe("the demo seed command", () => {
  let deployment: Deployment;
  let demoId: string;
  const run = (dryRun: boolean, moduleIds = ["invoices", "analytics"]) =>
    seedDemo({
      databaseUrl: deployment.context.env.databaseUrl,
      // The address as an operator might type it; people are found by the lower-case address.
      email: "Demo@Example.invalid",
      moduleIds,
      dryRun,
    });

  beforeAll(async () => {
    deployment = await start(MODULES);
    await enableModules(deployment.context, ["invoices", "analytics"]);
    await seedRoles(deployment.context, MODULES);
    demoId = await insertUser(deployment.context, {
      email: DEMO_EMAIL,
      name: "Demo account",
    });
    // A model an administrator allowed before the seed, which the seed keeps.
    await deployment.context.db.$client.query(
      "update tenant_settings set allowed_models = '{deepseek/deepseek-v4.1-flash-1017}'"
    );
  }, 240000);

  // The three cases run in order on one deployment: a dry run, the first run, then the second.
  it("answers the six numbered lines on a fresh deployment in a dry run and writes nothing", async () => {
    const before = await tableCounts(deployment);
    const settingsBefore = await settings(deployment);

    const lines = await run(true);

    expect(lines.slice(1)).toEqual([
      `Demo account: user ${demoId}`,
      "Modules: invoices, analytics",
      "1. Role assignments for the demo account: 6 to write, 0 already present (Analytics editor, Analytics user, Analytics viewer, Finance, Invoices and Payments user, Viewer)",
      "2. Reporting date: blank -> 2026-10-27",
      "3. Model connection: chat blank -> anthropic/claude-opus-5.5, document blank -> openai/gpt-6.1-terra, 2 allowed models to add",
      "4. History PDFs through FileStorage: 66 to write, 0 already present (file, file_blob and document rows), 66 readings to store",
      "5. Demo pack history: 36 invoices and 30 payments to write, 0 and 0 already present (customer, invoice, payment, allocation, allocation_event and audit_event rows)",
      "6. Receivables overview starter dashboard: 1 to write, 0 already present (dashboard row)",
      "Dry run: nothing written.",
    ]);
    expect(changes(before, await tableCounts(deployment))).toEqual({});
    expect(await settings(deployment)).toEqual(settingsBefore);
  });

  it("plans no starter dashboard in a dry run without analytics", async () => {
    const lines = await run(true, ["invoices"]);

    expect(lines.slice(2, -1)).toEqual([
      "Modules: invoices",
      "1. Role assignments for the demo account: 3 to write, 0 already present (Finance, Invoices and Payments user, Viewer)",
      "2. Reporting date: blank -> 2026-10-27",
      "3. Model connection: chat blank -> anthropic/claude-opus-5.5, document blank -> openai/gpt-6.1-terra, 2 allowed models to add",
      "4. History PDFs through FileStorage: 66 to write, 0 already present (file, file_blob and document rows), 66 readings to store",
      "5. Demo pack history: 36 invoices and 30 payments to write, 0 and 0 already present (customer, invoice, payment, allocation, allocation_event and audit_event rows)",
    ]);
  });

  it("writes only the owner's list on the first run and grants the demo person tenant-wide", async () => {
    const before = await tableCounts(deployment);
    const client = deployment.context.db.$client;

    const lines = await run(false);

    expect(lines[0]).toMatch(/^Demo seed for [^@/]+:\d+\/[^/]+$/);
    expect(lines.join("\n")).not.toContain(DEMO_EMAIL);
    expect(lines.at(-1)).toBe("Written.");

    const { rows: audit } = await client.query<{
      count: number;
      only_invoice_actions: boolean;
    }>(
      `select count(*)::int as count,
              bool_and(action like 'invoices:%') as only_invoice_actions
       from audit_event where actor_user_id = $1`,
      [demoId]
    );
    // 6 customers, 36 invoices, 30 payments and 30 payment links, one module audit row each.
    expect(audit[0]).toEqual({ count: 102, only_invoice_actions: true });
    expect(changes(before, await tableCounts(deployment))).toEqual({
      "public.dashboard": 1,
      "public.role_assignment": 6,
      "public.file": 66,
      "public.file_blob": 66,
      "public.document": 66,
      "public.customer": 6,
      "public.invoice": 36,
      "public.payment": 30,
      "public.allocation": 30,
      "public.allocation_event": 30,
      // One `extracted` row per field of each history reading, and one per payment's numbers.
      "public.field_origin": 494,
      // The module writes the history rows as the demo account; the starter row has no actor.
      "public.audit_event": 103,
    });

    const { rows: starter } = await client.query(
      `select d.owner_user_id, d.name, d.version, a.action, a.actor_user_id
       from dashboard d join audit_event a on a.target_id = d.id::text`
    );
    expect(starter).toEqual([
      {
        owner_user_id: demoId,
        name: "Receivables overview",
        version: 1,
        action: "analytics:dashboard-created",
        actor_user_id: null,
      },
    ]);

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
      "select reporting_date::text, allowed_models, chat_model, document_model from tenant_settings"
    );
    expect(date).toEqual([
      {
        reporting_date: "2026-10-27",
        allowed_models: [
          "deepseek/deepseek-v4.1-flash-1017",
          "anthropic/claude-opus-5.5",
          "openai/gpt-6.1-terra",
        ],
        chat_model: "anthropic/claude-opus-5.5",
        document_model: "openai/gpt-6.1-terra",
      },
    ]);

    // History reads as the pack's past: each link event at noon, Singapore time, of its payment date.
    const { rows: events } = await client.query<{ off: number; late: number }>(
      `select count(*) filter (where e.occurred_at is distinct from
                (p.payment_date + time '12:00') at time zone 'Asia/Singapore')::int as off,
              count(*) filter (where e.occurred_at >= timestamptz '2026-10-28 00:00+08')::int as late
       from allocation_event e join payment p on p.id = e.payment_id`
    );
    expect(events).toEqual([{ off: 0, late: 0 }]);
  }, 180000);

  it("changes no row and no setting on a second run", async () => {
    const before = await tableCounts(deployment);
    const settingsBefore = await settings(deployment);

    const lines = await run(false);

    expect(lines.slice(3)).toEqual([
      "1. Role assignments for the demo account: 0 to write, 6 already present (Analytics editor, Analytics user, Analytics viewer, Finance, Invoices and Payments user, Viewer)",
      "2. Reporting date: 2026-10-27, already set",
      "3. Model connection: chat anthropic/claude-opus-5.5 and document openai/gpt-6.1-terra, already set",
      "4. History PDFs through FileStorage: 0 to write, 66 already present (file, file_blob and document rows), 0 readings to store",
      "5. Demo pack history: 0 invoices and 0 payments to write, 36 and 30 already present (customer, invoice, payment, allocation, allocation_event and audit_event rows)",
      "6. Receivables overview starter dashboard: 0 to write, 1 already present (dashboard row)",
      "Already seeded: nothing to write.",
    ]);
    expect(changes(before, await tableCounts(deployment))).toEqual({});
    expect(await settings(deployment)).toEqual(settingsBefore);
  });

  it("draws every starter panel through the chart gate as the demo account, also for one customer", async () => {
    registerModuleRuntime(deployment.context, MODULES);
    const caller = callProcedure(analyticsRouter, {
      tenant: deployment.context,
      caller: principalFor({
        tenant: deployment.context,
        modules: MODULES,
        userId: demoId,
        authenticated: true,
      }),
    });
    const { rows } = await deployment.context.db.$client.query<{
      id: string;
    }>("select id from dashboard where owner_user_id = $1", [demoId]);
    expect(rows).toHaveLength(1);
    const id = rows[0]?.id ?? "";
    // SAFETY: the contract answers `z.unknown()`, and the procedure answers the gate's ChartData.
    const panel = async (panelId: string) =>
      ((await caller.panelData({ id, panelId })) as ChartData).rows;
    const kpis = async () =>
      Object.fromEntries(
        await Promise.all(
          [
            ["p1", "Invoiced sales"],
            ["p2", "Collections"],
            ["p3", "Outstanding"],
            ["p4", "Overdue"],
          ].map(async ([panelId = "", name = ""]) => [
            name,
            (await panel(panelId))[0]?.[name] ?? null,
          ])
        )
      );

    // R-36 measures on the demo pack history at 2026-10-27, in cents.
    expect(await kpis()).toEqual({
      "Invoiced sales": 23640000,
      "Collections": 19520000,
      "Outstanding": 4120000,
      "Overdue": 2735000,
    });
    expect(
      (await panel("p5")).map((row) => ({
        month: String(row["x"]).slice(0, 7),
        invoiced: row["Invoiced sales"] ?? null,
        collected: row["Collections"] ?? null,
      }))
    ).toEqual(
      readDemoCsv("04_Demo_Guide/expected_monthly_totals.csv").map((row) => ({
        month: row["month"],
        invoiced: Number(row["invoiced_sales"]) * 100,
        collected: Number(row["payments_collected"]) * 100,
      }))
    );
    const ageing = await panel("p6");
    expect(
      ageing.reduce((sum, row) => sum + Number(row["Overdue"] ?? 0), 0)
    ).toBe(2735000);

    await caller.changeDashboard({
      id,
      expectedVersion: 1,
      changes: [
        {
          op: "set-filters",
          filters: {
            dateRange: { preset: "all" },
            field: {
              field: "customerName",
              label: "Customer",
              value: "ABC Trading",
            },
          },
        },
      ],
    });

    expect(await kpis()).toMatchObject({
      Outstanding: 650000,
      Overdue: 650000,
    });
  });

  it("keeps the time of history written after the seed when a later run writes again", async () => {
    const client = deployment.context.db.$client;
    const later = "2026-10-30 01:00:00+00";
    await client.query(
      "update allocation_event set occurred_at = $1 where id = (select min(id::text)::uuid from allocation_event)",
      [later]
    );
    // A missing grant makes the run write again, with all history already present.
    await client.query(
      "delete from role_assignment where principal_id = $1 and role_id = (select min(role_id::text)::uuid from role_assignment where principal_id = $1)",
      [demoId]
    );

    expect((await run(false)).at(-1)).toBe("Written.");

    const { rows: kept } = await client.query<{ count: number }>(
      "select count(*)::int as count from allocation_event where occurred_at = $1",
      [later]
    );
    expect(kept).toEqual([{ count: 1 }]);
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
