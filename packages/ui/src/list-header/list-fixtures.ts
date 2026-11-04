import { fn } from "storybook/test";

import type { ListDefinition } from "./definitions.ts";
import type { ListState } from "./list-state.ts";

// Story fixtures of the list header: a list with figures-free filters and tabs, as Invoices.

export const customers = [
  { value: "c-1", label: "Harbor Freight" },
  { value: "c-2", label: "Northwind Traders" },
  { value: "c-3", label: "Blue Fin Foods" },
];

export const invoicesLike: ListDefinition = {
  label: "Invoices",
  noun: ["invoice", "invoices"],
  filters: [
    {
      id: "q",
      kind: "search",
      label: "Search invoices",
      placeholder: "Search number or customer",
    },
    {
      id: "customer",
      kind: "option",
      label: "Customer",
      placeholder: "All customers",
      options: customers,
      icon: "building",
    },
    {
      id: "date",
      kind: "date-range",
      label: "Invoice date",
      placeholder: "Any invoice date",
    },
  ],
  tabs: {
    param: "status",
    items: [
      { value: "all", label: "All" },
      { value: "open", label: "Open" },
      { value: "overdue", label: "Overdue", tone: "danger" },
      { value: "no-due-date", label: "No due date", tone: "warning" },
      { value: "paid", label: "Paid" },
    ],
  },
  sorts: [
    { column: "number", kind: "text" },
    { column: "total", kind: "number" },
    { column: "updated", kind: "date" },
  ],
  defaultSort: { column: "updated", direction: "desc" },
};

/** The parameters that the fixtures write, cleared before each story. */
export function resetAddress() {
  const params = new URLSearchParams(window.location.search);

  for (const name of [
    "q",
    "customer",
    "date",
    "status",
    "sort",
    "type",
    "flag",
  ])
    params.delete(name);

  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}?${params.toString()}`
  );
}

/** One address parameter, as the list wrote it. */
export const param = (name: string) =>
  new URLSearchParams(window.location.search).get(name);

/** The `state` arg of the docs table; each story renders its own live state. */
export const docsState: ListState = {
  params: {},
  tab: "all",
  sort: { column: "updated", direction: "desc" },
  set: fn(),
  clear: fn(),
};
