import type { DatasetListDefinition } from "@genie/core";

import type {
  INVOICE_LIST_SORTS,
  INVOICE_LIST_TABS,
  PAYMENT_LIST_SORTS,
  PAYMENT_LIST_TABS,
} from "../contract.ts";

type Tabs = NonNullable<DatasetListDefinition["tabs"]>;

/** A definition whose tabs and sorts the procedure's enums name, so the address and the procedure agree. */
type ListOf<Tab extends string, Column extends string> = Omit<
  DatasetListDefinition,
  "tabs" | "sorts"
> & {
  readonly tabs: Omit<Tabs, "items"> & {
    readonly items: readonly (Tabs["items"][number] & {
      readonly value: Tab;
    })[];
  };
  readonly sorts: readonly (DatasetListDefinition["sorts"][number] & {
    readonly column: Column;
  })[];
};

/*
 * The three lists as list header configurations (LH5, LH14, LH16): plain data with type imports
 * only, so the page in the browser and the loader on the server read the same object. The
 * customer options are filled by the page.
 */

export const invoiceListDefinition = {
  label: "Invoices",
  noun: ["invoice", "invoices"],
  filters: [
    {
      id: "q",
      kind: "search",
      label: "Search",
      placeholder: "Search invoice or customer",
    },
    {
      id: "customer",
      kind: "option",
      label: "Customer",
      placeholder: "All customers",
      icon: "building",
      field: "customerId",
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
      { value: "open", label: "Open", statuses: ["open"] },
      {
        value: "overdue",
        label: "Overdue",
        tone: "danger",
        statuses: ["overdue"],
      },
      { value: "paid", label: "Paid", statuses: ["paid"] },
      {
        value: "no-due-date",
        label: "No due date",
        tone: "warning",
        statuses: ["no-due-date"],
      },
    ],
  },
  sorts: [
    { column: "invoice", kind: "text", field: "invoiceNumber" },
    { column: "customer", kind: "text", field: "customerName" },
    { column: "invoiceDate", kind: "date", field: "invoiceDate" },
    { column: "dueDate", kind: "date", field: "dueDate" },
    { column: "total", kind: "number", field: "totalCents" },
    { column: "updated", kind: "date", field: "updatedAt" },
  ],
  defaultSort: { column: "updated", direction: "desc" },
} as const satisfies ListOf<
  (typeof INVOICE_LIST_TABS)[number],
  (typeof INVOICE_LIST_SORTS)[number]
>;

export const paymentListDefinition = {
  label: "Payments",
  noun: ["payment", "payments"],
  filters: [
    {
      id: "q",
      kind: "search",
      label: "Search",
      placeholder: "Search reference or customer",
    },
    {
      id: "customer",
      kind: "option",
      label: "Customer",
      placeholder: "All customers",
      icon: "building",
      field: "customerId",
    },
    {
      id: "date",
      kind: "date-range",
      label: "Payment date",
      placeholder: "Any payment date",
      field: "paymentDate",
    },
  ],
  tabs: {
    param: "status",
    field: "status",
    items: [
      { value: "all", label: "All", statuses: [] },
      { value: "linked", label: "Linked", statuses: ["allocated"] },
      {
        value: "not-linked",
        label: "Not linked",
        tone: "warning",
        statuses: ["part-allocated", "unallocated"],
      },
    ],
  },
  sorts: [
    { column: "customer", kind: "text", field: "customerName" },
    { column: "paymentDate", kind: "date", field: "paymentDate" },
    { column: "method", kind: "text", field: "method" },
    { column: "amount", kind: "number", field: "amountCents" },
    { column: "updated", kind: "date", field: "updatedAt" },
  ],
  defaultSort: { column: "updated", direction: "desc" },
} as const satisfies ListOf<
  (typeof PAYMENT_LIST_TABS)[number],
  (typeof PAYMENT_LIST_SORTS)[number]
>;

/**
 * The Documents inbox. It is no dataset, because a dataset shows in `list-datasets`, so its fields
 * name the loader's own columns and the loader maps them (LH15, LH24).
 */
export const documentListDefinition = {
  label: "Documents",
  noun: ["document", "documents"],
  filters: [
    {
      id: "q",
      kind: "search",
      label: "Search",
      placeholder: "Search file, customer or number",
    },
    {
      id: "type",
      kind: "option",
      label: "Document type",
      placeholder: "All types",
      icon: "file",
    },
    {
      id: "uploaded",
      kind: "date-range",
      label: "Upload date",
      placeholder: "Any upload date",
    },
  ],
  tabs: {
    param: "status",
    field: "status",
    items: [
      {
        value: "needs-you",
        label: "Needs you",
        tone: "warning",
        statuses: [
          "needs-input",
          "confirm-split",
          "no-match",
          "possible-duplicate",
          "could-not-read",
        ],
      },
      { value: "reading", label: "Reading", statuses: ["reading"] },
      {
        value: "done",
        label: "Done",
        statuses: [
          "linked-automatically",
          "saved",
          "kept-as-reference",
          "duplicate",
        ],
      },
      { value: "all", label: "All", statuses: [] },
    ],
  },
  sorts: [
    { column: "uploaded", kind: "date", field: "createdAt" },
    { column: "updated", kind: "date", field: "updatedAt" },
  ],
  defaultSort: { column: "updated", direction: "desc" },
} as const satisfies DatasetListDefinition;
