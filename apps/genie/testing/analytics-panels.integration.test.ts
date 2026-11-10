import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
} from "@genie/core";
import {
  assignRole,
  enableModules,
  insertPersonWith,
  insertRole,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "@genie/core/testing";
import { analyticsModule, analyticsRouter } from "@genie/module-analytics";
import type { DashboardFilters } from "@genie/module-analytics/contract";
import { insertDashboard } from "@genie/module-analytics/testing";
import { invoicesModule } from "@genie/module-invoices";
import { placeholderModule } from "@genie/module-placeholder";
import {
  AGENT_RECORDS,
  insertAgentRecords,
} from "@genie/module-placeholder/testing";
import type { ChartData } from "@genie/ui";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Dashboard panels on real data (Spec 7 R-15, R-49): the dashboard filters reach each panel's
 * query through core's chart gate, a change runs the gate, and the field filter offers the values
 * of the panel datasets. The analytics module imports no other module, so these cases live in the
 * app, on the placeholder's three agent records (120000, 80000 and 50000 cents) and the invoices
 * datasets with no rows (a second dataset, and one with a boolean field).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const MODULES = [analyticsModule, placeholderModule, invoicesModule];

let owner: ModuleRequestContext;

beforeAll(async () => {
  deployment = await startDisposableDeployment(MODULES);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache holds this date (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra"],
    chat: "openai/gpt-6.1-terra",
    document: null,
    reportingDate: "2026-10-27",
  });
  await enableModules(deployment.context, [
    "analytics",
    "placeholder",
    "invoices",
  ]);
  registerModuleRuntime(deployment.context, MODULES);
  await insertAgentRecords(deployment.context);

  const { userId } = await insertPersonWith(deployment.context, [
    "analytics:read",
    "analytics:write",
    "analytics:use",
    "placeholder:read",
    "placeholder:use",
    "invoices:read",
  ]);

  owner = contextOf(userId);
}, 120000);

function contextOf(userId: string): ModuleRequestContext {
  return {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };
}

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const caller = () => callProcedure(analyticsRouter, owner);

const KPI = {
  type: "kpi",
  title: "Amount",
  series: [
    {
      name: "Amount",
      dataset: "placeholder.records",
      query: { aggregates: [{ fn: "sum", field: "amountCents", as: "total" }] },
      value: "total",
    },
  ],
} as const;

const NO_FILTERS: DashboardFilters = {
  dateRange: { preset: "all" },
  fields: [],
};

/** The owner's dashboard of one KPI panel `p1` under the given filters, written with no gate. */
async function kpiDashboard(
  filters: DashboardFilters,
  ownerUserId = owner.caller.userId
): Promise<string> {
  return insertDashboard(deployment.context, {
    ownerUserId,
    config: {
      filters,
      panels: [{ id: "p1", layout: { columns: 1, rows: 1 }, config: KPI }],
      views: [],
      defaultViewId: null,
    },
  });
}

/** A count KPI on an invoices dataset, which has no `label` field. */
const countOf = (dataset: string) =>
  ({
    type: "kpi",
    title: "Rows",
    series: [
      {
        name: "Rows",
        dataset,
        query: { aggregates: [{ fn: "count", as: "n" }] },
        value: "n",
      },
    ],
  }) as const;

const LAYOUT = { columns: 1, rows: 1 } as const;

/** The owner's dashboard of `p1` on the placeholder records and `p2` on an invoices dataset. */
async function twoDatasetDashboard(dataset: string): Promise<string> {
  return insertDashboard(deployment.context, {
    ownerUserId: owner.caller.userId,
    config: {
      filters: NO_FILTERS,
      panels: [
        { id: "p1", layout: LAYOUT, config: KPI },
        { id: "p2", layout: LAYOUT, config: countOf(dataset) },
      ],
      views: [],
      defaultViewId: null,
    },
  });
}

// SAFETY: the contract answers `z.unknown()`, and the procedure answers the gate's ChartData.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- `panelData`'s answer, typed unknown by its contract
const chartOf = (answer: unknown) => answer as ChartData;

const labelFilter = (values: readonly string[]) => ({
  kind: "multi-select" as const,
  field: "label",
  label: "Label",
  values: [...values],
});

const storedOf = async (id: string) =>
  (
    await deployment.context.db.$client.query(
      "select config, version from dashboard where id = $1",
      [id]
    )
  ).rows[0];

const fieldFilter = (field: string, value: string | null) =>
  ({
    kind: "select",
    field,
    label: "Customer",
    value,
  }) as const;

describe("the analytics panels on real data", () => {
  it.each([
    ["no filter", 250000, NO_FILTERS],
    [
      "the range 2026-02-01 to 2026-03-31",
      130000,
      { dateRange: { from: "2026-02-01", to: "2026-03-31" }, fields: [] },
    ],
    [
      "the field filter label = Bravo",
      80000,
      {
        dateRange: { preset: "all" },
        fields: [fieldFilter("label", "Bravo")],
      },
    ],
    [
      "a field filter on customerName, which the dataset lacks",
      250000,
      {
        dateRange: { preset: "all" },
        fields: [fieldFilter("customerName", "Acme")],
      },
    ],
    [
      "the range this-month",
      null,
      { dateRange: { preset: "this-month" }, fields: [] },
    ],
  ] as const satisfies readonly (readonly [
    string,
    number | null,
    DashboardFilters,
  ])[])("draw the KPI under %s as %s cents", async (_, cents, filters) => {
    const id = await kpiDashboard(filters);

    // SAFETY: the contract answers `z.unknown()`, and the procedure answers the gate's ChartData.
    const data = (await caller().panelData({ id, panelId: "p1" })) as ChartData;

    expect(data.rows[0]?.Amount ?? null).toBe(cents);
  });

  it("refuse a change to a line chart over the text field label and save nothing", async () => {
    const id = await kpiDashboard(NO_FILTERS);

    const read = () =>
      deployment.context.db.$client.query(
        "select config, undo, version from dashboard where id = $1",
        [id]
      );

    const before = (await read()).rows;

    await expect(
      caller().changeDashboard({
        id,
        expectedVersion: 1,
        changes: [
          {
            op: "change-panel",
            panelId: "p1",
            panel: {
              type: "line",
              title: "By label",
              series: [
                {
                  name: "Amount",
                  dataset: "placeholder.records",
                  x: "label",
                  y: "total",
                  query: {
                    groupBy: [{ field: "label" }],
                    aggregates: [
                      { fn: "sum", field: "amountCents", as: "total" },
                    ],
                  },
                },
              ],
            },
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "chart-invalid",
      issues: [
        {
          path: "changes.0.panel.series.0.x",
          message:
            "A line chart needs an ordered x-axis. Group x by a date, a number or ranges.",
        },
      ],
    });
    expect((await read()).rows).toEqual(before);
  });

  it.each([
    ["label", ["Alpha", "Bravo", "Charlie"]],
    ["customerName", []],
  ] as const)(
    "offer the field filter on %s the values %o",
    async (field, values) => {
      const id = await kpiDashboard({
        dateRange: { preset: "all" },
        fields: [fieldFilter(field, null)],
      });

      expect(await caller().filterValues({ id, field })).toEqual(values);
    }
  );

  it("narrows every panel whose dataset has the field with transient filters, and leaves the others", async () => {
    const id = await twoDatasetDashboard("invoices.customers");
    const before = await storedOf(id);
    const unfiltered = chartOf(await caller().panelData({ id, panelId: "p2" }));

    const filters: DashboardFilters = {
      dateRange: { preset: "all" },
      fields: [labelFilter(["Alpha", "Charlie"])],
    };

    const [narrowed, other] = await Promise.all(
      ["p1", "p2"].map(async (panelId) =>
        chartOf(await caller().panelData({ id, panelId, filters }))
      )
    );

    expect(narrowed?.rows[0]?.Amount).toBe(170000);
    expect(other?.rows).toEqual(unfiltered.rows);
    expect(await storedOf(id)).toEqual(before);
  });

  it("keeps a transient filter inside the caller's scopes", async () => {
    // placeholder:read on Alpha only; the analytics keys through a second, unscoped role.
    const { userId } = await insertPersonWith(
      deployment.context,
      ["placeholder:read"],
      { type: "placeholder-record", id: AGENT_RECORDS[0].id }
    );

    const roleId = await insertRole(deployment.context, {
      permissions: ["analytics:use", "analytics:read"],
    });

    await assignRole(deployment.context, {
      roleId,
      principal: { type: "user", id: userId },
    });

    const id = await kpiDashboard(NO_FILTERS, userId);
    const scoped = callProcedure(analyticsRouter, contextOf(userId));

    const amountUnder = async (values: readonly string[]) =>
      chartOf(
        await scoped.panelData({
          id,
          panelId: "p1",
          filters: {
            dateRange: { preset: "all" },
            fields: [labelFilter(values)],
          },
        })
      ).rows[0]?.Amount ?? null;

    expect(await amountUnder(["Bravo"])).toBeNull();
    expect(await amountUnder(["Alpha", "Bravo"])).toBe(120000);
    expect(
      await scoped.filterValues({
        id,
        field: "label",
        filters: {
          dateRange: { preset: "all" },
          fields: [labelFilter(["Bravo"])],
        },
      })
    ).toEqual(["Alpha"]);
  });

  it("refuses a toggle on a text field", async () => {
    const id = await kpiDashboard(NO_FILTERS);

    const filters: DashboardFilters = {
      dateRange: { preset: "all" },
      fields: [{ kind: "toggle", field: "label", label: "Label", value: true }],
    };

    const refusal = {
      code: "analytics:change-invalid",
      issues: [
        {
          path: "filters.fields.0.field",
          message: "No data you can read has the field label for this filter.",
        },
      ],
    };

    await expect(
      caller().panelData({ id, panelId: "p1", filters })
    ).rejects.toMatchObject(refusal);
    await expect(
      caller().filterValues({ id, field: "label", filters })
    ).rejects.toMatchObject(refusal);
    // A stored filter that fits no dataset would filter nothing and show no notice (P15-5).
    await expect(
      caller().changeDashboard({
        id,
        expectedVersion: 1,
        changes: [{ op: "set-filters", filters }],
      })
    ).rejects.toMatchObject(refusal);
    // A saved view passes the same check, so picking it never filters nothing (P15-19).
    await expect(
      caller().changeDashboard({
        id,
        expectedVersion: 1,
        changes: [{ op: "save-view", name: "Flagged", filters }],
      })
    ).rejects.toMatchObject(refusal);
    expect(await caller().readDashboard({ id })).toMatchObject({
      version: 1,
      filters: NO_FILTERS,
      views: [],
    });
  });

  it("uses a panel's own range for its figure and its comparison", async () => {
    // The dashboard range this-month holds no record; the panel's own range holds Bravo and
    // Charlie, and the 59 days before it (2025-12-04 to 2026-01-31) hold Alpha.
    const id = await insertDashboard(deployment.context, {
      ownerUserId: owner.caller.userId,
      config: {
        filters: { dateRange: { preset: "this-month" }, fields: [] },
        views: [],
        defaultViewId: null,
        panels: [
          {
            id: "p1",
            layout: LAYOUT,
            config: KPI,
            ownRange: { from: "2026-02-01", to: "2026-03-31" },
          },
        ],
      },
    });

    const data = chartOf(await caller().panelData({ id, panelId: "p1" }));

    expect(data.rows[0]?.Amount).toBe(130000);
    expect(data.change).toEqual({
      previous: 120000,
      label: "the 59 days before",
    });
  });

  it("answers the filter fields of the panel datasets", async () => {
    const id = await twoDatasetDashboard("invoices.allocations");
    const { filterFields } = await caller().readDashboard({ id });

    expect(filterFields).toEqual(
      expect.arrayContaining([
        {
          field: "label",
          label: "label",
          kind: "multi-select",
          datasets: ["placeholder.records"],
        },
        {
          field: "automatic",
          label: "Linked automatically",
          kind: "toggle",
          datasets: ["invoices.allocations"],
        },
      ])
    );
    expect(filterFields.map(({ field }) => field)).not.toContain("amountCents");
  });

  it("narrows a field's options by the other filters but not by its own", async () => {
    const id = await kpiDashboard(NO_FILTERS);

    expect(
      await caller().filterValues({
        id,
        field: "label",
        filters: {
          dateRange: { from: "2026-02-01", to: "2026-03-31" },
          fields: [
            labelFilter(["Bravo"]),
            {
              kind: "select",
              field: "id",
              label: "Id",
              value: AGENT_RECORDS[2].id,
            },
          ],
        },
      })
    ).toEqual(["Charlie"]);
  });
});
