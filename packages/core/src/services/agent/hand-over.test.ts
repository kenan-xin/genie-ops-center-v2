import { describe, expect, it } from "vitest";

import { handOverDescription } from "./hand-over.ts";

describe("the hand-over description", () => {
  // A live brief added record drill-downs that the person never asked for, so the run built six
  // panels for three (Phase 16j).
  it("keeps the brief's goal to what the person asked for", () => {
    const target = { id: "analytics", surface: { name: "Dashboards agent" } };

    expect(handOverDescription([target])).toContain(
      "the goal with only what the person asked for"
    );
  });
});
