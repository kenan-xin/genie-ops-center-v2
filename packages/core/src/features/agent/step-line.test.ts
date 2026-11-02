import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../../services/agent/index.ts";
import { TOOL_PARTS } from "./__fixtures__/answers.ts";
import { stepLine } from "./step-line.ts";

type Part = AgentMessage["parts"][number];

const LABELS = {
  steps: { "fixture-count-records": "Counted the records" },
  datasets: { "example.items": "Items" },
};

const [listed, queried, opened, counted, refused] = TOOL_PARTS;

const streamingQuery: Part = {
  type: "tool-query-dataset",
  toolCallId: "call-streaming",
  state: "input-streaming",
  input: undefined,
};

const untitledQuery: Part = {
  type: "tool-query-dataset",
  toolCallId: "call-untitled",
  state: "output-available",
  input: { dataset: "example.other", query: {} },
  output: { rows: [] },
};

const unlabelled: Part = {
  type: "tool-analytics-change-dashboard",
  toolCallId: "call-change",
  state: "output-available",
  input: {},
  output: {},
};

describe("stepLine", () => {
  it.each([
    ["the dataset list", listed, { text: "Looked up the data" }],
    ["a titled dataset", queried, { text: "Read", object: "Items" }],
    [
      "an untitled dataset",
      untitledQuery,
      { text: "Read", object: "example.other" },
    ],
    ["a query whose input streams", streamingQuery, { text: "Read the data" }],
    ["a record", opened, { text: "Opened a record" }],
    ["a module tool with a step", counted, { text: "Counted the records" }],
    ["a module tool without a step", unlabelled, { text: "Used a tool" }],
    [
      "a refused call",
      refused,
      { text: "Read", object: "example.missing", refused: true },
    ],
  ])("names %s in words, never by the tool name", (_, part, line) => {
    if (part === undefined) throw new Error("The fixture lost a tool part.");

    expect(stepLine(part, LABELS)).toEqual(line);
  });
});
