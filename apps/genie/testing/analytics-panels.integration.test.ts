import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "@genie/core/testing";
import { analyticsModule, analyticsRouter } from "@genie/module-analytics";
import type { DashboardFilters } from "@genie/module-analytics/contract";
import { insertDashboard } from "@genie/module-analytics/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { insertAgentRecords } from "@genie/module-placeholder/testing";
import type { ChartData } from "@genie/ui";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Dashboard panels on real data (Spec 7 R-15, R-49): the dashboard filters reach each panel's
 * query through core's chart gate, a change runs the gate, and the field filter offers the values
 * of the panel datasets. The analytics module imports no other module, so these cases live in the
 * app, on the placeholder's three agent records (120000, 80000 and 50000 cents).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const MODULES = [analyticsModule, placeholderModule];

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
  await enableModules(deployment.context, ["analytics", "placeholder"]);
  registerModuleRuntime(deployment.context, MODULES);
  await insertAgentRecords(deployment.context);

  const { userId } = await insertPersonWith(deployment.context, [
    "analytics:read",
    "analytics:write",
    "analytics:use",
    "placeholder:read",
    "placeholder:use",
  ]);

  owner = {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: MODULES,
      userId,
      authenticated: true,
    }),
  };
}, 120000);

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
async function kpiDashboard(filters: DashboardFilters): Promise<string> {
  return insertDashboard(deployment.context, {
    ownerUserId: owner.caller.userId,
    config: {
      filters,
      panels: [{ id: "p1", layout: { columns: 1, rows: 1 }, config: KPI }],
    },
  });
}

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

      expect(await caller().filterValues({ id })).toEqual(values);
    }
  );
});
