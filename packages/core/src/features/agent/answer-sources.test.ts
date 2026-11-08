import { describe, expect, it } from "vitest";

import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";
import type { DatasetQuery } from "../../services/datasets/query.ts";
import {
  columnLabel,
  readSentence,
  readsOf,
  refusedReads,
  rowsText,
  sourceTitles,
  type Read,
} from "./answer-sources.ts";

type Part = AgentMessage["parts"][number];

const LABELS: ChatLabels = {
  steps: {},
  datasets: {
    "example.items": "Items",
    "example.orders": "Orders",
    "example.secret": "Secret items",
  },
  fields: {
    "example.items": {
      createdOn: { label: "Created on", type: "date" },
      amountCents: {
        label: "Amount",
        type: "money",
        currencyKey: "currency",
      },
      status: { label: "Status", type: "text" },
      region: { label: "Region", type: "text" },
      quantity: { label: "Quantity", type: "number" },
      dueOn: { label: "Due date", type: "date" },
      paid: { label: "Paid", type: "boolean" },
    },
  },
};

function read(
  dataset: string,
  rows: number,
  id = dataset,
  query: DatasetQuery = {}
): Part {
  return {
    type: "tool-query-dataset",
    toolCallId: `call-${id}`,
    state: "output-available",
    input: { dataset, query },
    output: {
      dataset,
      asOf: "2026-10-27",
      columns: [],
      rows: Array.from({ length: rows }, () => ({})),
      truncated: false,
    },
  };
}

/** A read the gate marked cut, with the query's own limit or none. */
function cut(limit: number | undefined, rows: number): Part {
  return {
    type: "tool-query-dataset",
    toolCallId: `call-${limit}`,
    state: "output-available",
    input: {
      dataset: "example.items",
      query:
        limit === undefined
          ? { select: ["status"] }
          : { select: ["status"], limit },
    },
    output: {
      dataset: "example.items",
      asOf: "2026-10-27",
      columns: [],
      rows: Array.from({ length: rows }, () => ({})),
      truncated: true,
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

/** The one read of a query on `example.items`. */
function itemsRead(query: DatasetQuery, rows = 3): Read {
  const [only] = readsOf([read("example.items", rows, "q", query)]);

  if (only === undefined) throw new Error("the read did not parse");

  return only;
}

function text(query: DatasetQuery): string {
  return readSentence(itemsRead(query), LABELS)
    .map((part) => part.text)
    .join("");
}

describe("the row count of a read", () => {
  it.each([
    [1, false, "1 row"],
    [37, false, "37 rows"],
    // The gate cut the read, so the count is only a floor.
    [1000, true, "1,000+ rows"],
  ])("%i rows, cut %s, reads %s", (count, truncated, expected) => {
    expect(rowsText(count, truncated)).toBe(expected);
  });
});

describe("the sources of an answer", () => {
  it.each([
    ["no read", [listed], []],
    [
      "two reads of one dataset and one of another",
      [
        read("example.items", 2),
        read("example.items", 1, "again"),
        read("example.orders", 3),
      ],
      ["Items", "Orders"],
    ],
    ["an untitled dataset", [read("example.other", 0)], ["example.other"]],
  ])("%s", (_, parts, sources) => {
    expect(sourceTitles(parts, LABELS)).toEqual(sources);
  });

  it("counts a read cut by its own limit as whole, and one cut by the row cap as a floor", () => {
    expect(
      readsOf([cut(1, 1), cut(undefined, 1000), cut(5000, 1000)]).map(
        (entry) => entry.truncated
      )
    ).toEqual([false, true, true]);
  });

  it("counts no refused and no running read", () => {
    expect(readsOf([refused, streaming])).toEqual([]);
  });
});

describe("the sentence of a read", () => {
  it("says what a grouped sum added up, which records and how it grouped them", () => {
    const sentence = readSentence(
      itemsRead({
        filters: [
          {
            field: "createdOn",
            op: "between",
            from: "2026-05-01",
            to: "2026-10-27",
          },
        ],
        groupBy: [{ field: "createdOn", bucket: "month" }],
        aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
      }),
      LABELS
    );

    expect(sentence.map((part) => part.text).join("")).toBe(
      "Added up Amount of the items with Created on from 1 May 2026 to 27 Oct 2026, grouped by month of Created on."
    );
    expect(
      sentence.filter((part) => part.strong).map((part) => part.text)
    ).toEqual([
      "Amount",
      "Created on from 1 May 2026 to 27 Oct 2026",
      "month of Created on",
    ]);
  });

  it.each<[string, NonNullable<DatasetQuery["filters"]>, string]>([
    [
      "eq",
      [{ field: "status", op: "eq", value: "Open" }],
      "Listed the items with Status Open.",
    ],
    [
      "neq",
      [{ field: "status", op: "neq", value: "Open" }],
      "Listed the items with Status not Open.",
    ],
    [
      "in",
      [{ field: "region", op: "in", values: ["North", "South", "West"] }],
      "Listed the items with Region North, South or West.",
    ],
    [
      "gte on a date",
      [{ field: "createdOn", op: "gte", value: "2026-05-01" }],
      "Listed the items with Created on on or after 1 May 2026.",
    ],
    [
      "lt on a number",
      [{ field: "quantity", op: "lt", value: 10 }],
      "Listed the items with Quantity under 10.",
    ],
    [
      "isNull",
      [{ field: "dueOn", op: "isNull" }],
      "Listed the items with no Due date.",
    ],
    [
      "eq on a boolean",
      [{ field: "paid", op: "eq", value: true }],
      "Listed the items with Paid yes.",
    ],
    [
      "two filters",
      [
        { field: "status", op: "eq", value: "Open" },
        { field: "amountCents", op: "gt", value: 120_000 },
      ],
      "Listed the items with Status Open and Amount over 1,200.00.",
    ],
  ])("reads %s", (_, filters, expected) => {
    expect(text({ select: ["status"], filters })).toBe(expected);
  });

  it("keeps the limit of a top five", () => {
    expect(
      text({
        groupBy: [{ field: "region" }],
        aggregates: [{ fn: "count", as: "items" }],
        orderBy: [{ column: "items", direction: "desc" }],
        limit: 5,
      })
    ).toBe("Counted the items, grouped by Region, top 5 by Count.");
  });

  it("names the records once beside a count, and lists three groups with commas", () => {
    expect(
      text({
        filters: [{ field: "paid", op: "eq", value: false }],
        groupBy: [
          { field: "region" },
          { field: "status" },
          { field: "createdOn" },
        ],
        aggregates: [
          { fn: "sum", field: "amountCents", as: "total" },
          { fn: "count", as: "items" },
        ],
      })
    ).toBe(
      "Added up Amount and counted the items with Paid no, grouped by Region, Status and Created on."
    );
  });

  it("falls back to the row count when a field has no label", () => {
    expect(
      readSentence(
        itemsRead({
          select: ["status"],
          filters: [{ field: "secretField", op: "eq", value: "x" }],
        }),
        LABELS
      )
    ).toEqual([{ text: "Items: 3 rows, as of 27 Oct 2026", strong: false }]);
  });

  it("labels each column by its field or its measure", () => {
    const grouped = itemsRead({
      groupBy: [{ field: "createdOn", bucket: "month" }],
      aggregates: [
        { fn: "sum", field: "amountCents", as: "total" },
        { fn: "count", as: "items" },
      ],
    });

    expect(
      ["total", "items", "createdOn"].map((column) =>
        columnLabel(grouped, column, LABELS)
      )
    ).toEqual(["Amount", "Count", "Created on"]);
  });
});

describe("the refused reads of an answer", () => {
  it("names a refused read that no later read fixed", () => {
    expect(refusedReads([refused], LABELS)).toEqual(["Secret items"]);
  });

  it("drops a refused read that a later read of the same dataset fixed", () => {
    expect(refusedReads([refused, read("example.secret", 2)], LABELS)).toEqual(
      []
    );
  });
});
