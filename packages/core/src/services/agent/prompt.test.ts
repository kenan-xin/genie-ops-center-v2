import { describe, expect, it } from "vitest";

import { agentInstructions } from "./prompt.ts";

describe("agentInstructions", () => {
  it("puts module lines after core's rules and before the blank line that opens the answer catalog", () => {
    const lines = agentInstructions({
      reportingDate: "2026-10-27",
      moduleLines: ["Rule A.", "Rule B."],
    }).split("\n");

    const blank = lines.indexOf("");

    expect(lines.slice(blank - 3, blank + 1)).toEqual([
      "You have no tool that changes data. Never say that you created, changed or linked a record.",
      "Rule A.",
      "Rule B.",
      "",
    ]);
  });
});
