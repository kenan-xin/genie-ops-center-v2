import { AppError, type PanelConfig } from "@genie/core";
import { describe, expect, it } from "vitest";

import { type UndoEntry } from "../../config.ts";
import type {
  DashboardChange,
  DashboardFilters,
  DateRangeFilter,
  SavedView,
} from "../../contract.ts";
import { applyChanges, pushUndo } from "./changes.ts";

// Only a dataset name: the module imports no other module (Global Constraints).
const chart = (type: "kpi" | "bar") => ({
  type,
  title: "Records",
  series: [{ name: "Records", dataset: "placeholder.records" }],
});

const kpi: PanelConfig = {
  type: "kpi",
  title: "Records",
  series: [
    {
      name: "Records",
      dataset: "placeholder.records",
      query: { aggregates: [{ fn: "count", as: "n" }] },
      value: "n",
    },
  ],
};

/** A saved dashboard with the given panel ids, each a 1 x 1 KPI. */
function entry(ids: readonly string[]): UndoEntry {
  return {
    name: "Overview",
    config: {
      filters: { dateRange: { preset: "all" }, fields: [] },
      views: [],
      defaultViewId: null,
      panels: ids.map((id) => ({
        id,
        layout: { columns: 1, rows: 1 },
        config: kpi,
      })),
    },
  };
}

const ids = (current: UndoEntry, changes: readonly DashboardChange[]) =>
  applyChanges(current, changes).panels.map((panel) => panel.id);

/** The entry of one panel `p1`, with `ownRange` when given. */
const withOwnRange = (ownRange: DateRangeFilter | undefined): UndoEntry => {
  const base = entry(["p1"]);
  const [first] = base.config.panels;

  return {
    ...base,
    config: {
      ...base.config,
      panels:
        first === undefined || ownRange === undefined
          ? base.config.panels
          : [{ ...first, ownRange }],
    },
  };
};

const refusalOf = (run: () => void): AppError => {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;

    throw error;
  }

  throw new Error("the change did not refuse");
};

describe("applyChanges", () => {
  it.each([
    ["kpi", { columns: 1, rows: 1 }],
    ["bar", { columns: 2, rows: 2 }],
  ] as const)(
    "adds a %s panel to an empty dashboard as p1, %o",
    (type, layout) => {
      expect(
        applyChanges(entry([]), [{ op: "add-panel", panel: chart(type) }])
          .panels
      ).toEqual([{ id: "p1", layout, config: chart(type) }]);
    }
  );

  it("gives a panel added after p1 is removed from p1, p2 the id p3", () => {
    expect(
      ids(entry(["p1", "p2"]), [
        { op: "remove-panel", panelId: "p1" },
        { op: "add-panel", panel: chart("kpi") },
      ])
    ).toEqual(["p2", "p3"]);
  });

  it("moves p1 to index 1 of p1, p2, p3", () => {
    expect(
      ids(entry(["p1", "p2", "p3"]), [
        { op: "move-panel", panelId: "p1", toIndex: 1 },
      ])
    ).toEqual(["p2", "p1", "p3"]);
  });

  it.each([
    [
      "index 3 of three panels",
      { op: "move-panel", panelId: "p1", toIndex: 3 },
      "changes.0.toIndex",
    ],
    [
      "an unknown panel id",
      { op: "remove-panel", panelId: "p9" },
      "changes.0.panelId",
    ],
  ] as const)("refuses %s", (_, change, path) => {
    expect(
      refusalOf(() => {
        applyChanges(entry(["p1", "p2", "p3"]), [change]);
      })
    ).toMatchObject({
      code: "analytics:change-invalid",
      issues: [{ path }],
    });
  });

  it("refuses a 13th panel with analytics:panel-limit", () => {
    const twelve = entry(Array.from({ length: 12 }, (_, i) => `p${i + 1}`));

    expect(
      refusalOf(() => {
        applyChanges(twelve, [{ op: "add-panel", panel: chart("kpi") }]);
      })
    ).toMatchObject({ code: "analytics:panel-limit" });
  });

  it("applies no step of a list whose second step fails", () => {
    const current = entry(["p1", "p2"]);
    const before = structuredClone(current);

    expect(
      refusalOf(() => {
        applyChanges(current, [
          { op: "rename", name: "Renamed" },
          { op: "remove-panel", panelId: "p1" },
          { op: "remove-panel", panelId: "p9" },
        ]);
      })
    ).toMatchObject({ code: "analytics:change-invalid" });
    expect(current).toEqual(before);
  });

  it.each([
    ["a preset", undefined, { preset: "this-month" }, { preset: "this-month" }],
    [
      "a custom range",
      undefined,
      { from: "2026-09-01", to: "2026-09-30" },
      { from: "2026-09-01", to: "2026-09-30" },
    ],
    // Starts from a set range, so a `??` that ignores `null` shows.
    ["null", { preset: "this-year" }, null, undefined],
  ] as const)(
    "sets a panel's own range to %s",
    (_, current, ownRange, stored) => {
      const [panel] = applyChanges(withOwnRange(current), [
        { op: "change-panel", panelId: "p1", ownRange },
      ]).panels;

      expect(panel?.ownRange).toEqual(stored);
    }
  );

  it("keeps the own range through a layout change", () => {
    const [panel] = applyChanges(withOwnRange({ preset: "this-year" }), [
      { op: "change-panel", panelId: "p1", layout: { columns: 2, rows: 1 } },
    ]).panels;

    expect(panel).toMatchObject({
      layout: { columns: 2, rows: 1 },
      ownRange: { preset: "this-year" },
    });
  });
});

const ALL: DashboardFilters = { dateRange: { preset: "all" }, fields: [] };

const YEAR: DashboardFilters = {
  dateRange: { preset: "this-year" },
  fields: [{ kind: "toggle", field: "overdue", label: "Overdue", value: true }],
};

const view = (id: string, name = `View ${id}`): SavedView => ({
  id,
  name,
  filters: ALL,
});

/** A dashboard of no panels with the given views and default. */
const withViews = (
  views: readonly SavedView[],
  defaultViewId: string | null = null
): UndoEntry => ({
  name: "Overview",
  config: { filters: ALL, panels: [], views, defaultViewId },
});

const viewsOf = (count: number) =>
  Array.from({ length: count }, (_, i) => view(`v${i + 1}`));

describe("applyChanges on views", () => {
  it("gives a view added after v1 and v3 the id v4", () => {
    const { views } = applyChanges(withViews([view("v1"), view("v3")]), [
      { op: "save-view", name: "Overdue", filters: YEAR },
    ]);

    expect(views).toEqual([
      view("v1"),
      view("v3"),
      { id: "v4", name: "Overdue", filters: YEAR },
    ]);
  });

  it("updates a view by id in its place, with the new name and filters", () => {
    const { views } = applyChanges(withViews([view("v1"), view("v2")]), [
      { op: "save-view", id: "v1", name: "Overdue", filters: YEAR },
    ]);

    expect(views).toEqual([
      { id: "v1", name: "Overdue", filters: YEAR },
      view("v2"),
    ]);
  });

  it("clears the default when the default view is removed", () => {
    const applied = applyChanges(withViews([view("v1"), view("v2")], "v2"), [
      { op: "remove-view", id: "v2" },
    ]);

    expect(applied.views).toEqual([view("v1")]);
    expect(applied.defaultViewId).toBeNull();
  });

  it("keeps the default when another view is removed", () => {
    expect(
      applyChanges(withViews([view("v1"), view("v2")], "v2"), [
        { op: "remove-view", id: "v1" },
      ]).defaultViewId
    ).toBe("v2");
  });

  it("sets and clears the default view", () => {
    const current = withViews([view("v1")]);

    expect(
      applyChanges(current, [{ op: "set-default-view", id: "v1" }])
        .defaultViewId
    ).toBe("v1");
    expect(
      applyChanges(withViews([view("v1")], "v1"), [
        { op: "set-default-view", id: null },
      ]).defaultViewId
    ).toBeNull();
  });

  it.each([
    ["save-view", { op: "save-view", id: "v9", name: "Other", filters: ALL }],
    ["remove-view", { op: "remove-view", id: "v9" }],
    ["set-default-view", { op: "set-default-view", id: "v9" }],
  ] as const)("refuses %s of an unknown id at its step", (_, change) => {
    expect(
      refusalOf(() => {
        applyChanges(withViews([view("v1")]), [
          { op: "rename", name: "Renamed" },
          change,
        ]);
      })
    ).toMatchObject({
      code: "analytics:change-invalid",
      issues: [
        { path: "changes.1.id", message: "No view v9 on this dashboard." },
      ],
    });
  });

  it("saves a 20th view and refuses a 21st with analytics:view-limit", () => {
    const save: DashboardChange = {
      op: "save-view",
      name: "One more",
      filters: ALL,
    };

    expect(applyChanges(withViews(viewsOf(19)), [save]).views).toHaveLength(20);
    expect(
      refusalOf(() => {
        applyChanges(withViews(viewsOf(20)), [save]);
      })
    ).toMatchObject({ code: "analytics:view-limit" });
  });

  it("refuses a view named as another one, ignoring case and outer spaces", () => {
    expect(
      refusalOf(() => {
        applyChanges(withViews([view("v1", "Overdue"), view("v2")]), [
          { op: "save-view", id: "v2", name: " overdue ", filters: ALL },
        ]);
      })
    ).toMatchObject({
      code: "analytics:change-invalid",
      issues: [{ path: "changes.0.name" }],
    });
  });

  it("saves an update that keeps the view's own name in another case", () => {
    expect(
      applyChanges(withViews([view("v1", "Overdue")]), [
        { op: "save-view", id: "v1", name: "OVERDUE", filters: YEAR },
      ]).views
    ).toEqual([{ id: "v1", name: "OVERDUE", filters: YEAR }]);
  });
});

describe("pushUndo", () => {
  it("keeps the newest 20 entries and drops the oldest", () => {
    const stack = Array.from({ length: 20 }, (_, i) => ({
      ...entry([]),
      name: `Save ${20 - i}`,
    }));

    const pushed = pushUndo(stack, { ...entry([]), name: "Save 21" });

    expect(pushed.map((saved) => saved.name)).toEqual(
      Array.from({ length: 20 }, (_, i) => `Save ${21 - i}`)
    );
  });
});
