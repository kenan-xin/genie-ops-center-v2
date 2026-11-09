import { describe, expect, it } from "vitest";

import type { DashboardFilters, FilterField } from "../contract.ts";
import {
  addressNames,
  fieldNamesOf,
  readFilterAddress,
  sameFilters,
  writeFilterAddress,
} from "./filter-address.ts";

/** The fields Add filter offers, as the server names them (Task 2 `filterFields`). */
const fields: readonly FilterField[] = [
  {
    field: "label",
    label: "Customer",
    kind: "multi-select",
    datasets: ["invoices.invoices"],
  },
  {
    field: "status",
    label: "Status",
    kind: "select",
    datasets: ["invoices.invoices"],
  },
  {
    field: "flag",
    label: "Flagged",
    kind: "toggle",
    datasets: ["invoices.invoices"],
  },
  { field: "note", label: "Note", kind: "select", datasets: [] },
  { field: "ref", label: "Reference", kind: "select", datasets: [] },
  { field: "extra", label: "Extra", kind: "select", datasets: [] },
];

describe("fieldNamesOf", () => {
  it("names each field of a fields parameter once, and nothing for no parameter", () => {
    expect(fieldNamesOf("label:multi-select,flag:toggle,label:select")).toEqual(
      ["label", "flag"]
    );
    expect(fieldNamesOf(undefined)).toEqual([]);
  });
});

// The address is the page's only copy of a filter change that is not saved, so a reload or a
// shared link must give back every filter the person set.
describe("the dashboard filters in the address", () => {
  it("round trips two field filters and a custom range", () => {
    const filters: DashboardFilters = {
      dateRange: { from: "2026-09-01", to: "2026-09-30" },
      fields: [
        { kind: "select", field: "status", label: "Status", value: "open" },
        {
          kind: "multi-select",
          field: "label",
          label: "Customer",
          values: ["Bravo", "Alpha"],
        },
      ],
    };

    expect(readFilterAddress(writeFilterAddress(filters), fields)).toEqual(
      filters
    );
  });

  // P15-8: a customer name can hold a comma, so each multi-select value is encoded.
  it("keeps a multi-select value that holds a comma", () => {
    const filters: DashboardFilters = {
      dateRange: { preset: "all" },
      fields: [
        {
          kind: "multi-select",
          field: "label",
          label: "Customer",
          values: ["North, East", "South"],
        },
      ],
    };

    const patch = writeFilterAddress(filters);

    expect(patch["f.label"]).toBe("North%2C%20East,South");
    expect(readFilterAddress(patch, fields)).toEqual(filters);
  });

  // P15-7: cleared to All time, the address still says the person set a range.
  it("reads a range alone as set, and no parameter as the stored filters", () => {
    expect(readFilterAddress({}, fields)).toBeNull();
    expect(readFilterAddress({ range: "all" }, fields)).toEqual({
      dateRange: { preset: "all" },
      fields: [],
    });
    expect(
      readFilterAddress({ "fields": "flag:toggle", "f.flag": "1" }, fields)
    ).toEqual({
      dateRange: { preset: "all" },
      fields: [
        { kind: "toggle", field: "flag", label: "Flagged", value: true },
      ],
    });
  });

  it("always writes the range, and the fields empty when there are none", () => {
    expect(
      writeFilterAddress({ dateRange: { preset: "all" }, fields: [] })
    ).toMatchObject({ range: "all", fields: "" });
  });

  it("names every parameter it writes for a field", () => {
    expect(
      addressNames({
        "range": "all",
        "fields": "label:multi-select,flag:toggle",
        "f.label": "Alpha",
        "f.flag": "1",
        "status": "open",
      })
    ).toEqual(["range", "fields", "f.label", "f.flag"]);
  });

  it("removes the value of a previous field that is gone", () => {
    const patch = writeFilterAddress(
      {
        dateRange: { preset: "all" },
        fields: [
          { kind: "select", field: "status", label: "Status", value: "open" },
        ],
      },
      ["label", "status"]
    );

    expect(patch["f.status"]).toBe("open");
    expect(patch["f.label"]).toBeUndefined();
    expect(Object.keys(patch)).toContain("f.label");
  });

  // Review Focus 1: a hand-edited address opens with what is valid, never with a filter the
  // server refuses.
  it("drops an unknown field, a refused kind and a missing value", () => {
    expect(
      readFilterAddress(
        {
          "range": "this-month",
          "fields":
            "unknown:select,flag:select,note:select,label:multi-select,status:select",
          "f.unknown": "x",
          "f.flag": "1",
          "f.label": "Alpha",
          "f.status": "open",
        },
        fields
      )
    ).toEqual({
      dateRange: { preset: "this-month" },
      fields: [
        {
          kind: "multi-select",
          field: "label",
          label: "Customer",
          values: ["Alpha"],
        },
        { kind: "select", field: "status", label: "Status", value: "open" },
      ],
    });
  });

  it("drops a toggle value that is not 1 or 0", () => {
    expect(
      readFilterAddress(
        { "range": "all", "fields": "flag:toggle", "f.flag": "yes" },
        fields
      )?.fields
    ).toEqual([]);
  });

  // The contract's values are 1..200 characters; an empty item or one too long is not a filter.
  it.each([
    ["an empty item", "North,,East"],
    ["only a comma", ","],
  ])("drops a multi-select value with %s", (_, value) => {
    expect(
      readFilterAddress(
        { "range": "all", "fields": "label:multi-select", "f.label": value },
        fields
      )?.fields
    ).toEqual([]);
  });

  it("drops a value over 200 characters", () => {
    expect(
      readFilterAddress(
        {
          "range": "all",
          "fields": "status:select",
          "f.status": "a".repeat(201),
        },
        fields
      )?.fields
    ).toEqual([]);
  });

  it("keeps at most four field filters", () => {
    expect(
      readFilterAddress(
        {
          "range": "all",
          "fields":
            "status:select,label:multi-select,note:select,ref:select,extra:select",
          "f.status": "open",
          "f.label": "Alpha",
          "f.note": "n",
          "f.ref": "r",
          "f.extra": "e",
        },
        fields
      )?.fields.map(({ field }) => field)
    ).toEqual(["status", "label", "note", "ref"]);
  });

  it.each([
    ["an impossible day", "2026-02-30..2026-03-01"],
    ["one end", "2026-10-01.."],
    ["a preset that does not exist", "last-week"],
    ["no day", ".."],
    ["an end before the start", "2026-10-31..2026-10-01"],
  ])("reads a range of %s as All time", (_, range) => {
    expect(readFilterAddress({ range, fields: "" }, fields)?.dateRange).toEqual(
      { preset: "all" }
    );
  });
});

// "Not saved as default" waits on this: a false difference offers a save nobody needs.
describe("sameFilters", () => {
  const status: DashboardFilters["fields"][number] = {
    kind: "select",
    field: "status",
    label: "Status",
    value: "open",
  };

  const customer: DashboardFilters["fields"][number] = {
    kind: "multi-select",
    field: "label",
    label: "Customer",
    values: ["Alpha", "Bravo"],
  };

  const base: DashboardFilters = {
    dateRange: { preset: "last-3-months" },
    fields: [status, customer],
  };

  it("ignores the order of a multi-select's values, the labels and the filter order", () => {
    expect(
      sameFilters(base, {
        dateRange: { preset: "last-3-months" },
        fields: [
          { ...customer, label: "Client", values: ["Bravo", "Alpha"] },
          status,
        ],
      })
    ).toBe(true);
  });

  it.each<[string, DashboardFilters]>([
    [
      "another preset",
      { dateRange: { preset: "this-year" }, fields: [status, customer] },
    ],
    [
      "a custom range",
      {
        dateRange: { from: "2026-09-01", to: "2026-09-30" },
        fields: [status, customer],
      },
    ],
    [
      "another value",
      {
        dateRange: base.dateRange,
        fields: [{ ...status, value: "paid" }, customer],
      },
    ],
    [
      "another kind",
      {
        dateRange: base.dateRange,
        fields: [
          {
            kind: "multi-select",
            field: "status",
            label: "Status",
            values: ["open"],
          },
          customer,
        ],
      },
    ],
    [
      "one filter more",
      {
        dateRange: base.dateRange,
        fields: [
          status,
          customer,
          { kind: "toggle", field: "flag", label: "Flagged", value: true },
        ],
      },
    ],
  ])("sees %s as a different set of filters", (_, other) => {
    expect(sameFilters(base, other)).toBe(false);
  });
});
