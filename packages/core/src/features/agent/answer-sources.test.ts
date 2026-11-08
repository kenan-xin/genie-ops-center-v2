import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../../services/agent/index.ts";
import { methodLines, rowsText, sourceTitles } from "./answer-sources.ts";

type Part = AgentMessage["parts"][number];

const LABELS = {
  steps: {},
  datasets: { "example.items": "Items", "example.orders": "Orders" },
};

function read(dataset: string, rows: number, id = dataset): Part {
  return {
    type: "tool-query-dataset",
    toolCallId: `call-${id}`,
    state: "output-available",
    input: { dataset, query: {} },
    output: {
      dataset,
      asOf: "2026-10-27",
      columns: [],
      rows: Array.from({ length: rows }, () => ({})),
      truncated: false,
    },
  };
}

const refused: Part = {
  type: "tool-query-dataset",
  toolCallId: "call-refused",
  state: "output-error",
  input: { dataset: "example.secret", query: {} },
  errorText: "You may not do that.",
};

const streaming: Part = {
  type: "tool-query-dataset",
  toolCallId: "call-streaming",
  state: "input-available",
  input: { dataset: "example.pending", query: {} },
};

const listed: Part = {
  type: "tool-list-datasets",
  toolCallId: "call-list",
  state: "output-available",
  input: {},
  output: { datasets: [] },
};

describe("the row count of a read", () => {
  it.each([
    [1, false, "1 row"],
    [37, false, "37 rows"],
    // The gate cut the read, so the count is only a floor.
    [1000, true, "1,000+ rows"],
  ])("%i rows, cut %s, reads %s", (count, truncated, text) => {
    expect(rowsText(count, truncated)).toBe(text);
  });
});

describe("the sources and the method of an answer", () => {
  it.each([
    ["no read", [listed], [], []],
    [
      "two reads of one dataset and one of another",
      [
        read("example.items", 2),
        read("example.items", 1, "again"),
        read("example.orders", 3),
      ],
      ["Items", "Orders"],
      [
        "Items: 2 rows, as of 27 Oct 2026",
        "Items: 1 row, as of 27 Oct 2026",
        "Orders: 3 rows, as of 27 Oct 2026",
      ],
    ],
    [
      "an untitled dataset",
      [read("example.other", 0)],
      ["example.other"],
      ["example.other: 0 rows, as of 27 Oct 2026"],
    ],
    ["a refused and a running read", [refused, streaming], [], []],
  ])("%s", (_, parts, sources, method) => {
    expect(sourceTitles(parts, LABELS)).toEqual(sources);
    expect(methodLines(parts, LABELS)).toEqual(method);
  });
});
