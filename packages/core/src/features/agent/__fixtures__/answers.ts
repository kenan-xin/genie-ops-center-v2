import type { ChartData } from "@genie/ui/chart";

import type { AgentMessage } from "../../../services/agent/index.ts";
import type { PanelConfig } from "../../../services/charts/panel-config.ts";

/**
 * The answers of the message-part stories (Spec 7 R-45). A chart in an answer holds only its
 * panel config; the numbers live in the gate's answer below, so a story proves that the figure on
 * screen came from the gate and not from the text the model wrote.
 */

export const KPI_CONFIG = {
  type: "kpi",
  title: "Items",
  series: [
    {
      name: "Items",
      dataset: "example.items",
      query: { aggregates: [{ fn: "count", as: "items" }] },
      value: "items",
    },
  ],
} as const satisfies PanelConfig;

export const MISSING_CONFIG = {
  type: "kpi",
  title: "Missing",
  series: [
    {
      name: "Items",
      dataset: "example.missing",
      query: { aggregates: [{ fn: "count", as: "items" }] },
      value: "items",
    },
  ],
} as const satisfies PanelConfig;

export const TABLE_CONFIG = {
  type: "table",
  title: "Records",
  series: [
    {
      name: "Records",
      dataset: "example.items",
      query: { select: ["name"] },
    },
  ],
} as const satisfies PanelConfig;

export const KPI_DATA: ChartData = {
  kind: "kpi",
  title: "Items",
  columns: [{ key: "Items", label: "Items", type: "number" }],
  rows: [{ Items: 42 }],
  datasets: ["example.items"],
  readAt: "2026-10-30T06:05:00Z",
  truncated: false,
};

export const TABLE_DATA: ChartData = {
  kind: "table",
  title: "Records",
  columns: [{ key: "name", label: "Name", type: "text" }],
  rows: [{ name: "Alpha" }, { name: "Beta" }],
  datasets: ["example.items"],
  readAt: "2026-10-30T06:05:00Z",
  truncated: false,
};

/** A finished answer with a paragraph and a KPI chart. Its text holds no "42". */
export const CHART_ANSWER = [
  "root = Answer([heading, intro, figures])",
  'heading = Heading("Example totals", 2)',
  'intro = Paragraph("Figures from the example items dataset.")',
  'figures = Chart({type: "kpi", title: "Items", series: [{name: "Items", dataset: "example.items", query: {aggregates: [{fn: "count", as: "items"}]}, value: "items"}]})',
].join("\n");

/** A finished answer whose schema-valid config points at a dataset the viewer cannot read. */
export const REFUSED_ANSWER = [
  "root = Answer([intro, figures])",
  'intro = Paragraph("The missing dataset is not readable by this viewer.")',
  'figures = Chart({type: "kpi", title: "Missing", series: [{name: "Items", dataset: "example.missing", query: {aggregates: [{fn: "count", as: "items"}]}, value: "items"}]})',
].join("\n");

/** A finished answer that is plain prose, not OpenUI Lang. */
export const PROSE_ANSWER = "There are 42 example records in this dataset.";

/** An answer still streaming: a complete chart call and a half-written last statement. */
export const STREAMING_ANSWER = [
  "root = Answer([heading, figures])",
  'heading = Heading("Example totals", 2)',
  'figures = Chart({type: "kpi", title: "Items", series: [{name: "Items", dataset: "example.items", query: {aggregates: [{fn: "count", as: "items"}]}, value: "items"}]})',
  "summary = Para",
].join("\n");

/** A finished answer whose Chart call carries an unknown key beside the panel config. */
export const BROKEN_ANSWER = [
  "root = Answer([intro, figures])",
  'intro = Paragraph("Totals come from the example items dataset.")',
  'figures = Chart({type: "kpi", title: "Items", series: [{name: "Items", dataset: "example.items", query: {aggregates: [{fn: "count", as: "items"}]}, value: "items"}], colour: "red"})',
].join("\n");

/** A finished answer with headings, a list, a table and a chart (Task 10 asserts on it). */
export const RICH_ANSWER = [
  "root = Answer([heading, intro, steps, table, figures])",
  'heading = Heading("Example overview", 2)',
  'intro = Paragraph("A short summary of the example records.")',
  'steps = List(["Read the dataset", "Check the scope", "Draw the figure"])',
  'table = Chart({type: "table", title: "Records", series: [{name: "Records", dataset: "example.items", query: {select: ["name"]}}]})',
  'figures = Chart({type: "kpi", title: "Items", series: [{name: "Items", dataset: "example.items", query: {aggregates: [{fn: "count", as: "items"}]}, value: "items"}]})',
].join("\n");

/** The tool calls of an answer: the three core tools and one module tool, and a refused call. */
export const TOOL_PARTS: AgentMessage["parts"] = [
  {
    type: "tool-list-datasets",
    toolCallId: "call-read",
    state: "output-available",
    input: {},
    output: { datasets: [] },
  },
  {
    type: "tool-query-dataset",
    toolCallId: "call-query",
    state: "output-available",
    input: { dataset: "example.items", query: {} },
    output: { rows: [] },
  },
  {
    type: "tool-open-record",
    toolCallId: "call-open",
    state: "output-available",
    input: { dataset: "example.items", recordKey: "a" },
    output: { label: "Alpha", path: "/records/a" },
  },
  {
    type: "tool-fixture-count-records",
    toolCallId: "call-count",
    state: "output-available",
    input: {},
    output: { count: 3 },
  },
  {
    type: "tool-query-dataset",
    toolCallId: "call-refused",
    state: "output-error",
    input: { dataset: "example.missing", query: {} },
    errorText: "You may not do that.",
  },
] as const;
