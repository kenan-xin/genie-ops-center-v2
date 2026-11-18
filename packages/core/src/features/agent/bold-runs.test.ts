import { describe, expect, it } from "vitest";

import { boldRuns } from "./bold-runs.ts";

describe("boldRuns", () => {
  it("marks the text between two pairs of asterisks as bold", () => {
    expect(
      boldRuns("Added four slides, so the deck now has **9 slides**.")
    ).toEqual([
      { text: "Added four slides, so the deck now has ", strong: false },
      { text: "9 slides", strong: true },
      { text: ".", strong: false },
    ]);
  });

  it("keeps a lone pair of asterisks as text", () => {
    expect(boldRuns("SGD **4,200.00 in all")).toEqual([
      { text: "SGD **4,200.00 in all", strong: false },
    ]);
  });
});
