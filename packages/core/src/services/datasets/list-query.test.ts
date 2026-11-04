import { describe, expect, it } from "vitest";

import { type DatasetListDefinition, listQueryOf } from "./list-query.ts";

const invoices = {
  label: "Invoices",
  noun: ["invoice", "invoices"],
  filters: [
    { id: "q", kind: "search", label: "Search", placeholder: "Search" },
    {
      id: "customer",
      kind: "option",
      label: "Customer",
      placeholder: "All customers",
      field: "customerId",
    },
    {
      id: "kinds",
      kind: "multi-option",
      label: "Kind",
      placeholder: "All kinds",
      field: "kind",
    },
    {
      id: "date",
      kind: "date-range",
      label: "Invoice date",
      placeholder: "Any invoice date",
      field: "invoiceDate",
    },
  ],
  tabs: {
    param: "status",
    field: "status",
    items: [
      { value: "all", label: "All", statuses: [] },
      { value: "overdue", label: "Overdue", statuses: ["overdue"] },
    ],
  },
  sorts: [
    { column: "updated", kind: "date", field: "updatedAt" },
    { column: "total", kind: "number", field: "totalCents" },
  ],
  defaultSort: { column: "updated", direction: "desc" },
} satisfies DatasetListDefinition;

const newest = [{ column: "updatedAt", direction: "desc" }];

describe("listQueryOf", () => {
  it("maps each set filter to its dataset filter and trims the search", () => {
    expect(
      listQueryOf(invoices, {
        customer: "c-1",
        date: "2026-10-01..2026-10-31",
        q: " harbor ",
      })
    ).toEqual({
      filters: [
        { field: "customerId", op: "eq", value: "c-1" },
        { field: "invoiceDate", op: "gte", value: "2026-10-01" },
        { field: "invoiceDate", op: "lte", value: "2026-10-31" },
      ],
      tab: [],
      search: "harbor",
      orderBy: newest,
    });
    expect(listQueryOf(invoices, { kinds: "a,b" }).filters).toEqual([
      { field: "kind", op: "in", values: ["a", "b"] },
    ]);
  });

  it("keeps the tab apart and maps an allowed sort to its field", () => {
    expect(
      listQueryOf(invoices, { status: "overdue", sort: "total.asc" })
    ).toMatchObject({
      filters: [],
      tab: [{ field: "status", op: "in", values: ["overdue"] }],
      orderBy: [{ column: "totalCents", direction: "asc" }],
    });
  });

  it("reads an unknown tab as none and an unlisted sort as the default", () => {
    expect(
      listQueryOf(invoices, { status: "nope", sort: "outstanding.desc" })
    ).toMatchObject({ tab: [], orderBy: newest });
  });
});
