import { AppError, type PanelConfig } from "@genie/core";
import { describe, expect, it } from "vitest";

import { type UndoEntry } from "../../config.ts";
import type { DashboardChange } from "../../contract.ts";
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
      filters: { dateRange: { preset: "all" }, field: null },
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
