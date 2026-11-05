import { describe, expect, it } from "vitest";

import type { DatasetListDefinition } from "../../services/datasets/list-query.ts";
import { listAgentPage } from "./page-context.ts";

const CUSTOMER = "5f0c2d4e-8a1b-4c3d-9e7f-0a0a0a0a0001";

// Shaped like the Invoices list definition.
const DEFINITION: DatasetListDefinition = {
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
      id: "date",
      kind: "date-range",
      label: "Date",
      placeholder: "Any date",
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
    { column: "updatedAt", kind: "date", field: "updatedAt" },
    { column: "dueDate", kind: "date", field: "dueDate" },
  ],
  defaultSort: { column: "updatedAt", direction: "desc" },
};

const DATASET = "invoices.invoices";

describe("listAgentPage", () => {
  it("names the tab, the dataset filters with the tab last, and the sort of the list", () => {
    expect(
      listAgentPage({
        definition: DEFINITION,
        dataset: DATASET,
        params: {
          status: "overdue",
          customer: CUSTOMER,
          date: "2026-01-01..2026-03-31",
          sort: "dueDate.asc",
        },
      })
    ).toEqual({
      context: {
        page: "Invoices",
        list: {
          dataset: DATASET,
          tab: "overdue",
          filters: [
            { field: "customerId", op: "eq", value: CUSTOMER },
            { field: "invoiceDate", op: "gte", value: "2026-01-01" },
            { field: "invoiceDate", op: "lte", value: "2026-03-31" },
            { field: "status", op: "in", values: ["overdue"] },
          ],
          orderBy: [{ column: "dueDate", direction: "asc" }],
        },
      },
      about: "Invoices, Overdue",
    });

    expect(
      listAgentPage({ definition: DEFINITION, dataset: DATASET, params: {} })
    ).toEqual({
      context: {
        page: "Invoices",
        list: {
          dataset: DATASET,
          tab: "all",
          orderBy: [{ column: "updatedAt", direction: "desc" }],
        },
      },
      about: "Invoices",
    });
  });

  it("sends only the tab and the search of a list that is no dataset", () => {
    expect(
      listAgentPage({
        definition: DEFINITION,
        params: { status: "overdue", q: "harbor", customer: CUSTOMER },
      }).context
    ).toEqual({
      page: "Invoices",
      list: { tab: "overdue", search: "harbor" },
    });
  });

  it("leaves out a part that does not fit, so the message still goes", () => {
    expect(
      listAgentPage({
        definition: DEFINITION,
        dataset: DATASET,
        params: { status: "overdue", q: "h".repeat(201) },
      }).context
    ).toEqual({
      page: "Invoices",
      list: {
        dataset: DATASET,
        tab: "overdue",
        filters: [{ field: "status", op: "in", values: ["overdue"] }],
        orderBy: [{ column: "updatedAt", direction: "desc" }],
      },
    });

    expect(
      listAgentPage({
        definition: DEFINITION,
        dataset: DATASET,
        params: { customer: "Harbor Foods" },
      }).context
    ).toEqual({ page: "Invoices" });
  });
});
