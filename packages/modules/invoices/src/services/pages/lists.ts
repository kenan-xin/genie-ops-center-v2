import {
  type DatasetCursor,
  type DatasetFilter,
  type ModuleRequestContext,
  queryDataset,
} from "@genie/core";
import { z } from "zod";

import type {
  InvoiceListFilters,
  InvoiceListPageView,
  InvoiceListRow,
  InvoiceListSummary,
  InvoiceListView,
  ListCustomer,
  PaymentListFilters,
  PaymentListPageView,
  PaymentListRow,
  PaymentListView,
} from "../../presentation/views.ts";
import { invoiceStatusOf, paymentStatusOf } from "./status.ts";

/** The fields a list row reads from one `invoices.invoices` row, as the dataset answers them. */
export const listRow = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  customerName: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  currency: z.string(),
  totalCents: z.number().int(),
  outstandingCents: z.number().int(),
  overdue: z.boolean(),
  daysOverdue: z.number().int().nullable(),
});

export const LIST_ROW_FIELDS = Object.keys(listRow.shape);

/** One list row, its two overdue fields read into its status. */
export function invoiceListRowOf(row: z.infer<typeof listRow>): InvoiceListRow {
  const { overdue: _overdue, daysOverdue: _days, ...value } = row;

  return { ...value, status: invoiceStatusOf(row) };
}

/** Each status chip as dataset filters, the same four states `invoiceStatusOf` names. */
const STATUS_FILTERS: Readonly<
  Record<NonNullable<InvoiceListFilters["status"]>, readonly DatasetFilter[]>
> = {
  "paid": [{ field: "outstandingCents", op: "lte", value: 0 }],
  "overdue": [{ field: "overdue", op: "eq", value: true }],
  // A due date source other than unspecified always carries a date (`invoice_due_date_check`).
  "open": [
    { field: "outstandingCents", op: "gt", value: 0 },
    { field: "overdue", op: "eq", value: false },
    { field: "dueDateSource", op: "neq", value: "unspecified" },
  ],
  "no-due-date": [
    { field: "outstandingCents", op: "gt", value: 0 },
    { field: "dueDate", op: "isNull" },
  ],
};

/** The customer and the date range of a list's filters, on the dataset's date field. */
function customerAndDatesOf(
  filters: Pick<InvoiceListFilters, "customerId" | "from" | "to">,
  dateField: string
): DatasetFilter[] {
  return [
    ...(filters.customerId === undefined
      ? []
      : [
          { field: "customerId", op: "eq", value: filters.customerId } as const,
        ]),
    ...(filters.from === undefined
      ? []
      : [{ field: dateField, op: "gte", value: filters.from } as const]),
    ...(filters.to === undefined
      ? []
      : [{ field: dateField, op: "lte", value: filters.to } as const]),
  ];
}

function invoiceFiltersOf(filters: InvoiceListFilters): DatasetFilter[] {
  return [
    ...(filters.status === undefined ? [] : STATUS_FILTERS[filters.status]),
    ...customerAndDatesOf(filters, "invoiceDate"),
  ];
}

const summaryRow = z.object({
  currency: z.string(),
  overdue: z.boolean(),
  outstanding: z.number().int(),
  invoices: z.number().int(),
});

/** Outstanding, and overdue money and count, per currency over every row the filters keep. */
async function invoiceSummary(
  ctx: ModuleRequestContext,
  filters: readonly DatasetFilter[],
  search: string | undefined
): Promise<InvoiceListSummary[]> {
  const result = await queryDataset(ctx, {
    dataset: "invoices.invoices",
    search,
    query: {
      filters,
      groupBy: [{ field: "currency" }, { field: "overdue" }],
      aggregates: [
        { fn: "sum", field: "outstandingCents", as: "outstanding" },
        { fn: "count", as: "invoices" },
      ],
    },
  });

  const byCurrency = new Map<string, InvoiceListSummary>();

  for (const row of result.rows.map((entry) => summaryRow.parse(entry))) {
    const total = byCurrency.get(row.currency) ?? {
      currency: row.currency,
      outstandingCents: 0,
      overdueCents: 0,
      overdueCount: 0,
    };

    byCurrency.set(row.currency, {
      ...total,
      outstandingCents: total.outstandingCents + row.outstanding,
      overdueCents: total.overdueCents + (row.overdue ? row.outstanding : 0),
      overdueCount: total.overdueCount + (row.overdue ? row.invoices : 0),
    });
  }

  return [...byCurrency.values()].toSorted((left, right) =>
    left.currency.localeCompare(right.currency)
  );
}

/**
 * The Invoices list as of the reporting date: one `queryDataset` read under `invoices:read`, so a
 * scoped person sees only the customers they may read (DEC-39, R-9, R-36). A page holds at most
 * 1,000 rows; `after` reads the page after a cut one (czjw.28). The filters run in the dataset
 * query, so they hold across pages, and the summary covers every row they keep (design review 1.4).
 */
export async function loadInvoiceList(
  ctx: ModuleRequestContext,
  after: DatasetCursor | null = null,
  filters: InvoiceListFilters = {}
): Promise<InvoiceListView> {
  const conditions = invoiceFiltersOf(filters);

  const [result, summary] = await Promise.all([
    queryDataset(ctx, {
      dataset: "invoices.invoices",
      after: after ?? undefined,
      search: filters.search,
      query: {
        select: LIST_ROW_FIELDS,
        filters: conditions,
        orderBy: [
          { column: "invoiceDate", direction: "desc" },
          { column: "invoiceNumber", direction: "desc" },
        ],
      },
    }),
    invoiceSummary(ctx, conditions, filters.search),
  ]);

  return {
    asOf: result.asOf,
    rows: result.rows.map((row) => invoiceListRowOf(listRow.parse(row))),
    truncated: result.truncated,
    next: result.next ?? null,
    summary,
  };
}

const listCustomer = z.object({ id: z.string(), name: z.string() });

/**
 * The customers of a list's picker, under the person's read scope. shortcut: the picker offers the
 * first 1,000 customers by name; a deployment with more needs a searched picker.
 */
async function loadListCustomers(
  ctx: ModuleRequestContext
): Promise<ListCustomer[]> {
  const customers = await queryDataset(ctx, {
    dataset: "invoices.customers",
    query: {
      select: ["id", "name"],
      orderBy: [{ column: "name", direction: "asc" }],
    },
  });

  return customers.rows.map((row) => listCustomer.parse(row));
}

/** The Invoices page: its unfiltered first page and the customers of its picker. */
export async function loadInvoiceListPage(
  ctx: ModuleRequestContext
): Promise<InvoiceListPageView> {
  const [list, customers] = await Promise.all([
    loadInvoiceList(ctx),
    loadListCustomers(ctx),
  ]);

  return { ...list, customers };
}

/** The fields a list row reads from one `invoices.payments` row, as the dataset answers them. */
export const paymentRow = z.object({
  id: z.string(),
  reference: z.string().nullable(),
  customerName: z.string(),
  paymentDate: z.string(),
  method: z.string().nullable(),
  currency: z.string(),
  amountCents: z.number().int(),
  unallocatedCents: z.number().int(),
});

export const PAYMENT_ROW_FIELDS = Object.keys(paymentRow.shape);

/** Each link chip as a dataset filter: Linked is Allocated, Not linked is Part allocated or Unallocated. */
const LINK_FILTERS: Readonly<
  Record<NonNullable<PaymentListFilters["link"]>, DatasetFilter>
> = {
  "linked": { field: "unallocatedCents", op: "lte", value: 0 },
  "not-linked": { field: "unallocatedCents", op: "gt", value: 0 },
};

/** One payment list row, its unallocated money read into its status. */
export function paymentListRowOf(
  row: z.infer<typeof paymentRow>
): PaymentListRow {
  return { ...row, status: paymentStatusOf(row) };
}

/**
 * The Payments list as of the reporting date: one `queryDataset` read under `invoices:read`, so a
 * scoped person sees only the payments they may read (DEC-39, R-9). A page holds at most 1,000
 * rows; `after` reads the page after a cut one (czjw.28). The filters run in the dataset query, so
 * they hold across pages (design review 1.4).
 */
export async function loadPaymentList(
  ctx: ModuleRequestContext,
  after: DatasetCursor | null = null,
  filters: PaymentListFilters = {}
): Promise<PaymentListView> {
  const result = await queryDataset(ctx, {
    dataset: "invoices.payments",
    after: after ?? undefined,
    search: filters.search,
    query: {
      select: PAYMENT_ROW_FIELDS,
      filters: [
        ...(filters.link === undefined ? [] : [LINK_FILTERS[filters.link]]),
        ...customerAndDatesOf(filters, "paymentDate"),
      ],
      orderBy: [
        { column: "paymentDate", direction: "desc" },
        { column: "reference", direction: "desc" },
      ],
    },
  });

  return {
    asOf: result.asOf,
    rows: result.rows.map((row) => paymentListRowOf(paymentRow.parse(row))),
    truncated: result.truncated,
    next: result.next ?? null,
  };
}

/** The Payments page: its unfiltered first page and the customers of its picker. */
export async function loadPaymentListPage(
  ctx: ModuleRequestContext
): Promise<PaymentListPageView> {
  const [list, customers] = await Promise.all([
    loadPaymentList(ctx),
    loadListCustomers(ctx),
  ]);

  return { ...list, customers };
}
