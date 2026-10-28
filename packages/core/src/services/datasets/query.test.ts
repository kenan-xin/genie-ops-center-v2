import { describe, expect, it } from "vitest";

import type { DatasetDeclaration } from "../../lib/module-contract/module.ts";
import { type DatasetQuery, validateDatasetQuery } from "./query.ts";
import { type DatasetSeries, seriesIssues } from "./series.ts";

const fields: DatasetDeclaration["fields"] = {
  id: { kind: "dimension", type: "text", description: "The id." },
  label: { kind: "dimension", type: "text", description: "The label." },
  day: { kind: "dimension", type: "date", description: "The day." },
  amount: { kind: "measure", type: "money", description: "The amount." },
  quantity: { kind: "measure", type: "number", description: "The count." },
  open: { kind: "dimension", type: "boolean", description: "Open or not." },
};

const count = { fn: "count", as: "n" } as const;

type SeriesEntry = DatasetSeries & {
  readonly fields: DatasetDeclaration["fields"];
};

function paths(query: DatasetQuery): readonly string[] {
  return validateDatasetQuery(fields, query).map((issue) => issue.path);
}

function seriesPaths(series: readonly SeriesEntry[]): readonly string[] {
  return seriesIssues(series).map((issue) => issue.path);
}

describe("validateDatasetQuery", () => {
  it.each<{
    readonly name: string;
    readonly query: DatasetQuery;
    readonly path: string;
  }>([
    // (a) an unknown field
    {
      name: "unknown select field",
      query: { select: ["nope"] },
      path: "select.0",
    },
    {
      name: "unknown filter field",
      query: { select: ["id"], filters: [{ field: "nope", op: "isNull" }] },
      path: "filters.0.field",
    },
    {
      name: "unknown group field",
      query: { groupBy: [{ field: "nope" }], aggregates: [count] },
      path: "groupBy.0.field",
    },
    {
      name: "unknown aggregate field",
      query: { aggregates: [{ fn: "sum", field: "nope", as: "s" }] },
      path: "aggregates.0.field",
    },
    // (b) an ordering operator on text or boolean
    {
      name: "gt on text",
      query: {
        select: ["id"],
        filters: [{ field: "label", op: "gt", value: "a" }],
      },
      path: "filters.0.op",
    },
    {
      name: "between on boolean",
      query: {
        select: ["id"],
        filters: [{ field: "open", op: "between", from: false, to: true }],
      },
      path: "filters.0.op",
    },
    // (c) a value of the wrong type for its field
    {
      name: "a string for a number",
      query: {
        select: ["id"],
        filters: [{ field: "quantity", op: "eq", value: "5" }],
      },
      path: "filters.0.value",
    },
    {
      name: "month 13",
      query: {
        select: ["id"],
        filters: [{ field: "day", op: "gte", value: "2026-13-01" }],
      },
      path: "filters.0.value",
    },
    {
      name: "a date with a time part",
      query: {
        select: ["id"],
        filters: [{ field: "day", op: "lt", value: "2026-01-05T10:00:00Z" }],
      },
      path: "filters.0.value",
    },
    {
      name: "a number for a text id",
      query: {
        select: ["id"],
        filters: [{ field: "id", op: "in", values: ["a", 3] }],
      },
      path: "filters.0.values.1",
    },
    {
      name: "an empty in list",
      query: {
        select: ["id"],
        filters: [{ field: "id", op: "in", values: [] }],
      },
      path: "filters.0.values",
    },
    {
      name: "a decimal against a boolean",
      query: {
        select: ["id"],
        filters: [{ field: "open", op: "eq", value: 2.5 }],
      },
      path: "filters.0.value",
    },
    {
      name: "a between end of the wrong type",
      query: {
        select: ["id"],
        filters: [{ field: "quantity", op: "between", from: 1, to: "x" }],
      },
      path: "filters.0.to",
    },
    // (d) a bucket on a non-date field, ranges on a non-number field
    {
      name: "month bucket on a number",
      query: {
        groupBy: [{ field: "quantity", bucket: "month" }],
        aggregates: [count],
      },
      path: "groupBy.0.bucket",
    },
    {
      name: "ranges on a date",
      query: {
        groupBy: [{ field: "day", ranges: [{ label: "early", max: 5 }] }],
        aggregates: [count],
      },
      path: "groupBy.0.ranges",
    },
    // (e) ranges that overlap, lack a bound, invert, or share a label
    {
      name: "overlapping ranges",
      query: {
        groupBy: [
          {
            field: "quantity",
            ranges: [
              { label: "low", max: 10 },
              { label: "mid", min: 5, max: 20 },
            ],
          },
        ],
        aggregates: [count],
      },
      path: "groupBy.0.ranges.1",
    },
    {
      name: "a range without a bound",
      query: {
        groupBy: [{ field: "quantity", ranges: [{ label: "all" }] }],
        aggregates: [count],
      },
      path: "groupBy.0.ranges.0",
    },
    {
      name: "a range with min not below max",
      query: {
        groupBy: [
          { field: "quantity", ranges: [{ label: "none", min: 5, max: 5 }] },
        ],
        aggregates: [count],
      },
      path: "groupBy.0.ranges.0",
    },
    {
      name: "two ranges with one label",
      query: {
        groupBy: [
          {
            field: "quantity",
            ranges: [
              { label: "same", max: 5 },
              { label: "same", min: 5 },
            ],
          },
        ],
        aggregates: [count],
      },
      path: "groupBy.0.ranges.1",
    },
    // (f) an aggregate on a field of the wrong type, or without a field
    {
      name: "sum of text",
      query: { aggregates: [{ fn: "sum", field: "label", as: "s" }] },
      path: "aggregates.0.field",
    },
    {
      name: "avg of a date",
      query: { aggregates: [{ fn: "avg", field: "day", as: "s" }] },
      path: "aggregates.0.field",
    },
    {
      name: "min of text",
      query: { aggregates: [{ fn: "min", field: "label", as: "s" }] },
      path: "aggregates.0.field",
    },
    {
      name: "max of a boolean",
      query: { aggregates: [{ fn: "max", field: "open", as: "s" }] },
      path: "aggregates.0.field",
    },
    {
      name: "sum without a field",
      query: { aggregates: [{ fn: "sum", as: "s" }] },
      path: "aggregates.0.field",
    },
    // (g) two output columns with one name
    {
      name: "one field grouped twice",
      query: {
        groupBy: [{ field: "label" }, { field: "label" }],
        aggregates: [count],
      },
      path: "groupBy.1.field",
    },
    {
      name: "an aggregate named like a group",
      query: {
        groupBy: [{ field: "label" }],
        aggregates: [{ fn: "count", as: "label" }],
      },
      path: "aggregates.0.as",
    },
    {
      name: "one field selected twice",
      query: { select: ["id", "id"] },
      path: "select.1",
    },
    // (h) select beside aggregates, a group without an aggregate, neither
    {
      name: "select beside aggregates",
      query: { select: ["id"], aggregates: [count] },
      path: "select",
    },
    {
      name: "a group without an aggregate",
      query: { select: ["label"], groupBy: [{ field: "label" }] },
      path: "groupBy",
    },
    { name: "neither select nor aggregates", query: {}, path: "select" },
    // (i) an order by a missing column, a limit out of range
    {
      name: "order by a column the query does not answer",
      query: {
        select: ["id"],
        orderBy: [{ column: "label", direction: "asc" }],
      },
      path: "orderBy.0.column",
    },
    { name: "limit 0", query: { select: ["id"], limit: 0 }, path: "limit" },
    {
      name: "limit 1001",
      query: { select: ["id"], limit: 1001 },
      path: "limit",
    },
  ])(
    "refuses a query that does not fit the dataset, naming the part: $name",
    ({ query, path }) => {
      expect(paths(query)).toEqual([path]);
    }
  );

  it.each<{ readonly name: string; readonly query: DatasetQuery }>([
    {
      name: "a row query with every filter shape",
      query: {
        select: ["id", "label", "day", "amount"],
        filters: [
          { field: "label", op: "neq", value: "x" },
          { field: "id", op: "in", values: ["a", "b"] },
          { field: "day", op: "between", from: "2026-01-01", to: "2026-12-31" },
          { field: "quantity", op: "lte", value: 2.5 },
          { field: "open", op: "eq", value: true },
          { field: "amount", op: "isNull" },
        ],
        orderBy: [{ column: "day", direction: "desc" }],
        limit: 1000,
      },
    },
    {
      name: "a grouped query with a plain group, a bucket and ranges",
      query: {
        groupBy: [
          { field: "label" },
          { field: "day", bucket: "week" },
          {
            field: "quantity",
            ranges: [
              { label: "low", max: 2.5 },
              { label: "high", min: 2.5 },
            ],
          },
        ],
        aggregates: [
          count,
          { fn: "count", field: "amount", as: "priced" },
          { fn: "sum", field: "amount", as: "total" },
          { fn: "max", field: "day", as: "latest" },
        ],
        orderBy: [{ column: "total", direction: "desc" }],
      },
    },
  ])("accepts $name", ({ query }) => {
    expect(paths(query)).toEqual([]);
  });
});

describe("seriesIssues", () => {
  it.each<{
    readonly name: string;
    readonly series: readonly SeriesEntry[];
    readonly path: string;
  }>([
    {
      name: "series that bucket x differently",
      series: [
        {
          name: "a",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [{ field: "day", bucket: "month" }],
            aggregates: [count],
          },
        },
        {
          name: "b",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [{ field: "day", bucket: "week" }],
            aggregates: [count],
          },
        },
      ],
      path: "series.1.query.groupBy.0",
    },
    {
      name: "series whose ranges differ",
      series: [
        {
          name: "a",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [
              {
                field: "quantity",
                ranges: [
                  { label: "low", max: 10 },
                  { label: "high", min: 10 },
                ],
              },
            ],
            aggregates: [count],
          },
        },
        {
          name: "b",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [
              {
                field: "quantity",
                ranges: [
                  { label: "low", max: 5 },
                  { label: "high", min: 5 },
                ],
              },
            ],
            aggregates: [count],
          },
        },
      ],
      path: "series.1.query.groupBy.0",
    },
    {
      name: "a series with two groups",
      series: [
        {
          name: "a",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [{ field: "label" }, { field: "day" }],
            aggregates: [count],
          },
        },
      ],
      path: "series.0.query",
    },
    {
      name: "a series with two aggregates",
      series: [
        {
          name: "a",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [{ field: "day" }],
            aggregates: [count, { fn: "count", as: "m" }],
          },
        },
      ],
      path: "series.0.query",
    },
    {
      name: "a series named x",
      series: [
        {
          name: "x",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [{ field: "day", bucket: "month" }],
            aggregates: [count],
          },
        },
      ],
      path: "series.0.name",
    },
    {
      name: "two series with one name",
      series: [
        {
          name: "a",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [{ field: "day", bucket: "month" }],
            aggregates: [count],
          },
        },
        {
          name: "a",
          dataset: "placeholder.records",
          fields,
          query: {
            groupBy: [{ field: "day", bucket: "month" }],
            aggregates: [count],
          },
        },
      ],
      path: "series.1.name",
    },
  ])(
    "refuses a series query without one shared x, naming the part: $name",
    ({ series, path }) => {
      expect(seriesPaths(series)).toEqual([path]);
    }
  );
});
