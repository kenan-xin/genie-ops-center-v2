import { describe, expect, it } from "vitest";

import { ANALYTICS_SURFACE_INSTRUCTIONS } from "./agent-surface.ts";
import { dashboardChange } from "./contract.ts";
import { nextViewId } from "./services/dashboards/changes.ts";

/**
 * The words of the "You can change" line for each dashboard step (R-46a). A step the schema gains
 * without a word here fails the first test, so S7-46 and S7-47 extend the line when they add one.
 */
const STEP_WORDS = {
  "add-panel": "panels",
  "change-panel": "each panel's chart type",
  "remove-panel": "panels",
  "move-panel": "their order",
  "rename": "the dashboard's name",
  "set-filters": "filters",
  "save-view": "saved views",
  "remove-view": "saved views",
  "set-default-view": "which view it opens with",
};

const savedView = (id: string) => ({
  id,
  name: id,
  filters: { dateRange: { preset: "all" as const }, fields: [] },
});

const line = ANALYTICS_SURFACE_INSTRUCTIONS.lines.find((text) =>
  text.startsWith("You can change")
);

describe("the Dashboards surface's You can change line", () => {
  it("has a word for every step kind of the schema", () => {
    expect(Object.keys(STEP_WORDS).toSorted()).toEqual(
      dashboardChange.options.map((option) => option.shape.op.value).toSorted()
    );
  });

  it("tells the id of a new view, so one change saves a view and opens the dashboard with it", () => {
    // The live model split the two steps to read the new id first (Phase 16, R1).
    const viewLine = ANALYTICS_SURFACE_INSTRUCTIONS.lines.find((text) =>
      text.startsWith("Save a view")
    );

    expect(nextViewId([])).toBe("v1");
    expect(nextViewId([savedView("v1"), savedView("v3")])).toBe("v4");
    expect(viewLine).toContain("v1 on a dashboard with no view");
    expect(viewLine).toContain(
      "set-default-view with that id in the same change"
    );
  });

  it("names each of those words", () => {
    const missing = Object.values(STEP_WORDS).filter(
      (word) => !(line ?? "").includes(word)
    );

    expect(missing).toEqual([]);
  });
});
