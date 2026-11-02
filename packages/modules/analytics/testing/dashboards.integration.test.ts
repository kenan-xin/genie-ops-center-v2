import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMPTY_DASHBOARD_CONFIG } from "../src/config.ts";
import { analyticsModule } from "../src/module.ts";
import { analyticsRouter } from "../src/router.ts";
import { changeDashboard } from "../src/services/dashboards/store.ts";
import {
  loadDashboardList,
  loadDashboardPage,
} from "../src/services/pages/loaders.ts";
import { insertDashboard } from "./factories.ts";

/**
 * The dashboard procedures against a real Postgres with the real histories applied. The module
 * is enabled, so the cases prove authorization and ownership, not the entitlement refusal. Every
 * caller is a real person whose keys come from a real role assignment.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([analyticsModule]);
  // The page loader reads the settings and the branding, which the seed step writes.
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["analytics"]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function contextOf(userId: string): ModuleRequestContext {
  return {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: [analyticsModule],
      userId,
      authenticated: true,
    }),
  };
}

function callerAs(userId: string) {
  return callProcedure(analyticsRouter, contextOf(userId));
}

describe("the analytics listDashboards procedure", () => {
  it("lists only the caller's own dashboards, the last changed first", async () => {
    const reader = ["analytics:use", "analytics:read"] as const;
    const a = await insertPersonWith(deployment.context, [...reader]);
    const b = await insertPersonWith(deployment.context, [...reader]);

    const a1 = await insertDashboard(deployment.context, {
      ownerUserId: a.userId,
      name: "A1",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });

    const a2 = await insertDashboard(deployment.context, {
      ownerUserId: a.userId,
      name: "A2",
      updatedAt: new Date("2026-10-02T00:00:00Z"),
    });

    await insertDashboard(deployment.context, {
      ownerUserId: b.userId,
      name: "B1",
      updatedAt: new Date("2026-10-03T00:00:00Z"),
    });

    expect(await callerAs(a.userId).listDashboards()).toEqual([
      {
        id: a2,
        name: "A2",
        panelCount: 0,
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: a1,
        name: "A1",
        panelCount: 0,
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  it("refuses the list to a person without analytics:read", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "analytics:use",
    ]);

    await insertDashboard(deployment.context, { ownerUserId: userId });

    await expect(callerAs(userId).listDashboards()).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

const EDITOR = ["analytics:use", "analytics:read", "analytics:write"] as const;

/** A KPI on a dataset this deployment lacks, so the chart gate refuses it now. */
const brokenKpi = {
  type: "kpi",
  title: "Missing",
  series: [
    {
      name: "Records",
      dataset: "missing.records",
      query: { aggregates: [{ fn: "count", as: "n" }] },
      value: "n",
    },
  ],
} as const;

const brokenConfig = {
  ...EMPTY_DASHBOARD_CONFIG,
  panels: [{ id: "p1", layout: { columns: 1, rows: 1 }, config: brokenKpi }],
};

const editor = async () =>
  (await insertPersonWith(deployment.context, [...EDITOR])).userId;

/** The stored row as the database holds it, to prove a refused write wrote nothing. */
async function rowOf(id: string) {
  const { rows } = await deployment.context.db.$client.query(
    "select name, config, undo, version from dashboard where id = $1",
    [id]
  );

  return rows[0];
}

async function auditOf(id: string) {
  const { rows } = await deployment.context.db.$client.query(
    "select action, actor_user_id, target_type, metadata from audit_event where target_id = $1 order by occurred_at, ctid",
    [id]
  );

  return rows;
}

/**
 * An owner's dashboard with one Undo entry and a panel `p1`, so every procedure answers the owner
 * something other than `not-found` (the panel's own refusal is `chart-invalid`).
 */
async function ownedDashboard(ownerUserId: string) {
  return insertDashboard(deployment.context, {
    ownerUserId,
    config: brokenConfig,
    undo: [{ name: "Before", config: EMPTY_DASHBOARD_CONFIG }],
  });
}

type Call = (
  caller: ReturnType<typeof callerAs>,
  id: string
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the cases read only the refusal, never the answer
) => Promise<unknown>;

const PROCEDURES: readonly (readonly [string, Call])[] = [
  ["readDashboard", (caller, id) => caller.readDashboard({ id })],
  [
    "changeDashboard",
    (caller, id) =>
      caller.changeDashboard({
        id,
        expectedVersion: 1,
        changes: [{ op: "rename", name: "Taken over" }],
      }),
  ],
  [
    "undoDashboard",
    (caller, id) => caller.undoDashboard({ id, expectedVersion: 1 }),
  ],
  ["deleteDashboard", (caller, id) => caller.deleteDashboard({ id })],
  ["panelData", (caller, id) => caller.panelData({ id, panelId: "p1" })],
  ["filterValues", (caller, id) => caller.filterValues({ id })],
];

describe("the analytics page loaders", () => {
  it("answer not-found to the dashboard page of another person's dashboard", async () => {
    const id = await ownedDashboard(await editor());

    await expect(
      loadDashboardPage(contextOf(await editor()), id)
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuse the dashboard list to a person without analytics:read", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "analytics:use",
      "analytics:write",
    ]);

    await expect(loadDashboardList(contextOf(userId))).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("answer chat none on the dashboard page to a person without core:ask:use", async () => {
    const owner = await editor();
    const id = await ownedDashboard(owner);

    expect(await loadDashboardPage(contextOf(owner), id)).toMatchObject({
      dashboard: { id },
      chat: { kind: "none" },
    });
  });
});

describe("the analytics dashboard procedures", () => {
  it.each(PROCEDURES)(
    "answer not-found to %s on another person's dashboard and leave it the same",
    async (_, call) => {
      const owner = await editor();
      const id = await ownedDashboard(owner);
      const before = await rowOf(id);

      await expect(call(callerAs(await editor()), id)).rejects.toMatchObject({
        code: "not-found",
      });
      expect(await rowOf(id)).toEqual(before);
    }
  );

  it.each([
    ["createDashboard", ["analytics:use", "analytics:read"]],
    ["changeDashboard", ["analytics:use", "analytics:read"]],
    ["undoDashboard", ["analytics:use", "analytics:read"]],
    ["deleteDashboard", ["analytics:use", "analytics:read"]],
    ["readDashboard", ["analytics:use", "analytics:write"]],
    ["panelData", ["analytics:use", "analytics:write"]],
    ["filterValues", ["analytics:use", "analytics:write"]],
  ] as const)(
    "refuse %s to a person without its key",
    async (procedure, keys) => {
      const { userId } = await insertPersonWith(deployment.context, [...keys]);
      const id = await ownedDashboard(userId);
      const caller = callerAs(userId);

      const call =
        procedure === "createDashboard"
          ? caller.createDashboard({ name: "Mine" })
          : PROCEDURES.find(([name]) => name === procedure)?.[1](caller, id);

      await expect(call).rejects.toMatchObject({ code: "forbidden" });
    }
  );

  it("refuse a change on an older version and write nothing", async () => {
    const owner = await editor();

    const id = await insertDashboard(deployment.context, {
      ownerUserId: owner,
      version: 2,
    });

    const before = await rowOf(id);

    await expect(
      callerAs(owner).changeDashboard({
        id,
        expectedVersion: 1,
        changes: [{ op: "rename", name: "Hand save" }],
      })
    ).rejects.toMatchObject({ code: "analytics:dashboard-changed" });

    expect(await rowOf(id)).toEqual(before);
  });

  // The tool path sends no expectedVersion, so only the lock-time check stops a lost update.
  it("refuse a save without expectedVersion that another save overtook at the lock", async () => {
    const owner = await editor();

    const id = await insertDashboard(deployment.context, {
      ownerUserId: owner,
    });

    // The other save holds the row lock with version 2 uncommitted, so the tool save reads
    // version 1 and then waits at its lock. The overlap is forced, never left to timing.
    const other = await deployment.context.db.$client.connect();

    try {
      await other.query("begin");
      await other.query(
        "update dashboard set name = 'Other save', version = 2 where id = $1",
        [id]
      );

      const raced = changeDashboard(contextOf(owner), {
        id,
        changes: [{ op: "rename", name: "Tool save" }],
      });

      // Commit only once the tool save waits on the row lock, so it read version 1 before.
      await expect
        .poll(async () => {
          const { rows } = await deployment.context.db.$client.query<{
            waiting: number;
          }>(
            "select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%from \"dashboard\"%for update%'"
          );

          return rows[0]?.waiting;
        })
        .toBe(1);
      await other.query("commit");

      await expect(raced).rejects.toMatchObject({
        code: "analytics:dashboard-changed",
      });
    } finally {
      // Destroy the connection, so a failure before the commit ends its transaction and lock.
      other.release(true);
    }

    // The other save stands; the tool save wrote nothing over it.
    expect(await rowOf(id)).toMatchObject({ name: "Other save", version: 2 });
  });

  it("refuse a panel on a dataset this deployment lacks and write nothing", async () => {
    const owner = await editor();

    const id = await insertDashboard(deployment.context, {
      ownerUserId: owner,
    });

    const before = await rowOf(id);

    await expect(
      callerAs(owner).changeDashboard({
        id,
        expectedVersion: 1,
        changes: [{ op: "add-panel", panel: brokenKpi }],
      })
    ).rejects.toMatchObject({
      code: "chart-invalid",
      issues: [{ path: "changes.0.panel.series.0.dataset" }],
    });

    expect(await rowOf(id)).toEqual(before);
    expect(await auditOf(id)).toEqual([]);
  });

  it("undo two renames in reverse order, then answer nothing-to-undo", async () => {
    const owner = await editor();
    const caller = callerAs(owner);
    const { id } = await caller.createDashboard({ name: "First" });

    await caller.changeDashboard({
      id,
      expectedVersion: 1,
      changes: [{ op: "rename", name: "Second" }],
    });
    await caller.changeDashboard({
      id,
      expectedVersion: 2,
      changes: [{ op: "rename", name: "Third" }],
    });

    const once = await caller.undoDashboard({ id, expectedVersion: 3 });
    const twice = await caller.undoDashboard({ id, expectedVersion: 4 });

    expect(
      [once, twice].map(({ name, version, canUndo }) => ({
        name,
        version,
        canUndo,
      }))
    ).toEqual([
      { name: "Second", version: 4, canUndo: true },
      { name: "First", version: 5, canUndo: false },
    ]);

    expect(await rowOf(id)).toMatchObject({
      name: "First",
      version: 5,
      undo: [],
    });

    await expect(
      caller.undoDashboard({ id, expectedVersion: 5 })
    ).rejects.toMatchObject({ code: "analytics:nothing-to-undo" });
  });

  it("refuse an Undo whose panel the gate refuses now and restore nothing", async () => {
    const owner = await editor();

    const id = await insertDashboard(deployment.context, {
      ownerUserId: owner,
      name: "Now",
      undo: [{ name: "Before", config: brokenConfig }],
    });

    const before = await rowOf(id);

    await expect(
      callerAs(owner).undoDashboard({ id, expectedVersion: 1 })
    ).rejects.toMatchObject({
      code: "chart-invalid",
      issues: [{ path: "panels.0.config.series.0.dataset" }],
    });

    expect(await rowOf(id)).toEqual(before);
  });

  it("save a rename of a dashboard that holds a panel the gate refuses now", async () => {
    const owner = await editor();

    const id = await insertDashboard(deployment.context, {
      ownerUserId: owner,
      config: brokenConfig,
    });

    await callerAs(owner).changeDashboard({
      id,
      expectedVersion: 1,
      changes: [{ op: "rename", name: "Renamed" }],
    });

    expect(await rowOf(id)).toMatchObject({
      name: "Renamed",
      config: brokenConfig,
      version: 2,
    });
  });

  it("undo a rename of a dashboard that holds a panel the gate refuses now", async () => {
    const owner = await editor();
    const caller = callerAs(owner);

    const id = await insertDashboard(deployment.context, {
      ownerUserId: owner,
      name: "Before rename",
      config: brokenConfig,
    });

    await caller.changeDashboard({
      id,
      expectedVersion: 1,
      changes: [{ op: "rename", name: "After rename" }],
    });

    await expect(
      caller.undoDashboard({ id, expectedVersion: 2 })
    ).resolves.toMatchObject({ name: "Before rename", version: 3 });

    expect(await rowOf(id)).toMatchObject({ config: brokenConfig });
  });

  it("write one audit row for each create, change, Undo and delete", async () => {
    const owner = await editor();
    const caller = callerAs(owner);
    const { id } = await caller.createDashboard({ name: "Audited" });

    await caller.changeDashboard({
      id,
      expectedVersion: 1,
      changes: [{ op: "rename", name: "Audited again" }],
    });
    await caller.undoDashboard({ id, expectedVersion: 2 });
    await caller.deleteDashboard({ id });

    const row = (
      action: string,
      metadata: Readonly<Record<string, number>>
    ) => ({
      action: `analytics:dashboard-${action}`,
      actor_user_id: owner,
      target_type: "analytics-dashboard",
      metadata,
    });

    expect(await auditOf(id)).toEqual([
      row("created", {}),
      row("changed", { version: 2, steps: 1 }),
      row("undone", { version: 3 }),
      row("deleted", {}),
    ]);
  });

  it.each(["create", "rename"] as const)(
    "refuse to %s a name the owner already uses in another case and with outer spaces",
    async (how) => {
      const owner = await editor();
      const caller = callerAs(owner);

      await insertDashboard(deployment.context, {
        ownerUserId: owner,
        name: "Sales Overview",
      });

      const id = await insertDashboard(deployment.context, {
        ownerUserId: owner,
        name: "Other",
      });

      await expect(
        how === "create"
          ? caller.createDashboard({ name: "  sales overview " })
          : caller.changeDashboard({
              id,
              expectedVersion: 1,
              changes: [{ op: "rename", name: "  sales overview " }],
            })
      ).rejects.toMatchObject({ code: "analytics:dashboard-name-taken" });
    }
  );
});
