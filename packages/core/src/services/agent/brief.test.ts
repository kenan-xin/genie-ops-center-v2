import { describe, expect, it } from "vitest";

import type { PanelConfig } from "../charts/panel-config.ts";
import { type Brief, briefProblems, briefSchema, briefText } from "./brief.ts";

const FULL_BRIEF: Brief = {
  surface: "placeholder",
  title: "October placeholder review",
  goal: "A short review of the October placeholder records for the board",
  facts: [
    {
      text: "3 records in October",
      dataset: "placeholder.records",
      asOf: "2026-10-27",
    },
    {
      text: "The largest record is 120.00 SGD",
      dataset: "placeholder.records",
      asOf: "2026-10-27",
    },
  ],
  datasets: ["placeholder.records"],
  period: "October 2026",
  artifacts: [1],
  notPassed: ["The chart colors the person asked about"],
};

const config: PanelConfig = {
  type: "table",
  title: "October records",
  series: [
    {
      name: "Records",
      dataset: "placeholder.records",
      query: { select: ["label"] },
    },
  ],
};

function refusedPaths(input: Brief): string[] {
  const parsed = briefSchema(["placeholder"]).safeParse(input);

  return parsed.success
    ? []
    : parsed.error.issues.map(({ path }) => path.join("."));
}

describe("briefSchema", () => {
  it("parses a full brief and refuses a surface, a title or artifacts past their bounds", () => {
    expect(briefSchema(["placeholder"]).parse(FULL_BRIEF)).toEqual(FULL_BRIEF);
    expect(refusedPaths({ ...FULL_BRIEF, surface: "slides" })).toEqual([
      "surface",
    ]);
    expect(refusedPaths({ ...FULL_BRIEF, title: "x".repeat(81) })).toEqual([
      "title",
    ]);
    expect(
      refusedPaths({ ...FULL_BRIEF, artifacts: [1, 2, 3, 4, 5, 6] })
    ).toEqual(["artifacts"]);
  });
});

describe("briefProblems", () => {
  const known = {
    datasets: new Set(["placeholder.records"]),
    artifacts: new Set([1]),
  };

  it("names each unknown dataset and each artifact the chat lacks, by path", () => {
    const [first, second] = FULL_BRIEF.facts;

    expect(
      briefProblems(
        {
          ...FULL_BRIEF,
          facts: [first!, { ...second!, dataset: "nope.items" }],
          datasets: ["nope.items"],
          artifacts: [3],
        },
        known
      )
    ).toEqual([
      {
        path: "facts.1.dataset",
        message: "No dataset has this name. Call list-datasets for the names.",
      },
      {
        path: "datasets.0",
        message: "No dataset has this name. Call list-datasets for the names.",
      },
      { path: "artifacts.0", message: "This chat has no artifact 3." },
    ]);
    expect(briefProblems(FULL_BRIEF, known)).toEqual([]);
  });
});

describe("briefText", () => {
  it("holds each fact with its dataset and date, each chart config and what Ask left out", () => {
    const text = briefText(FULL_BRIEF, [{ title: "October records", config }]);

    const lines = text.split("\n");

    expect(lines).toContain(
      "Goal: A short review of the October placeholder records for the board"
    );
    expect(lines).toContain("Period: October 2026");
    expect(lines).toContain(
      "- 3 records in October (placeholder.records, as of 2026-10-27)"
    );
    expect(lines).toContain(`- October records: ${JSON.stringify(config)}`);
    expect(lines).toContain("- The chart colors the person asked about");
    expect(lines).toContain("- The rest of the Ask chat");
    expect(lines.at(-1)).toBe(
      "Read every figure again with query-dataset before you use it."
    );

    const { period: _period, ...noPeriod } = FULL_BRIEF;

    expect(briefText(noPeriod, [])).not.toContain("Period:");
  });
});
