import { describe, expect, it } from "vitest";

import { ANALYTICS_SURFACE_INSTRUCTIONS } from "./agent-surface.ts";
import { dashboardChange } from "./contract.ts";

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
};

const line = ANALYTICS_SURFACE_INSTRUCTIONS.lines.find((text) =>
  text.startsWith("You can change")
);

describe("the Dashboards surface's You can change line", () => {
  it("has a word for every step kind of the schema", () => {
    expect(Object.keys(STEP_WORDS).toSorted()).toEqual(
      dashboardChange.options.map((option) => option.shape.op.value).toSorted()
    );
  });

  it("names each of those words", () => {
    const missing = Object.values(STEP_WORDS).filter(
      (word) => !(line ?? "").includes(word)
    );

    expect(missing).toEqual([]);
  });
});
