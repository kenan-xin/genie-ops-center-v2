import {
  type DatasetCursor,
  type DatasetFilter,
  type DatasetListDefinition,
  listQueryOf,
  type ListQuery,
  type ModuleRequestContext,
  queryDataset,
} from "@genie/core";
import type { ListParams } from "@genie/ui";
import { z } from "zod";

import {
  INVOICE_LIST_STATUSES,
  type InvoiceListParams,
  PAYMENT_STATUSES,
  type PaymentListParams,
} from "../../contract.ts";
import {
  invoiceListDefinition,
  paymentListDefinition,
} from "../../presentation/list-definitions.ts";
import type {
  InvoiceListPageView,
  InvoiceListRow,
  InvoiceListSummary,
  InvoiceListView,
  ListCustomer,
  PaymentListPageView,
  PaymentListRow,
  PaymentListSummary,
  PaymentListView,
} from "../../presentation/views.ts";

/** The rows of one list page (LH6). Every other dataset read keeps the 1,000-row cap. */
export const LIST_PAGE_SIZE = 50;

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
  daysOverdue: z.number().int().nullable(),
  status: z.enum(INVOICE_LIST_STATUSES),
  updatedAt: z.string(),
});

export const LIST_ROW_FIELDS = Object.keys(listRow.shape);

/** One list row, its status text and days overdue read into the badge's status (LH16). */
export function invoiceListRowOf(row: z.infer<typeof listRow>): InvoiceListRow {
  const { daysOverdue, status, ...value } = row;

  if (status !== "overdue") return { ...value, status: { kind: status } };

  // The dataset answers days overdue exactly when its status is overdue.
  if (daysOverdue === null)
    throw new Error(`Invoice ${row.id} is overdue with no days.`);

  return { ...value, status: { kind: "overdue", daysOverdue } };
}

/** The parameters a procedure parsed, without the ones it left out. */
function paramsOf(
  params: Readonly<Record<string, string | undefined>>
): ListParams {
  return Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value]]
    )
  );
}

/** Whether a row of this status is in the active tab: every status without a tab filter. */
function inTab(list: ListQuery, status: string): boolean {
  return list.tab.every(
    (filter) => filter.op === "in" && filter.values.includes(status)
  );
}

/** The rows of each tab, from the groups of every status under the other filters (LH17). */
export function countsOf(
  definition: DatasetListDefinition,
  groups: readonly { readonly status: string; readonly rows: number }[]
): Record<string, number> {
  return Object.fromEntries(
    (definition.tabs?.items ?? []).map((item) => {
      const statuses: readonly string[] = item.statuses;

      return [
        item.value,
        groups
          .filter(
            (group) => statuses.length === 0 || statuses.includes(group.status)
          )
          .reduce((sum, group) => sum + group.rows, 0),
      ];
    })
  );
}

const byCurrency = <Entry extends { readonly currency: string }>(
  entries: Iterable<Entry>
) =>
  [...entries].toSorted((left, right) =>
    left.currency.localeCompare(right.currency)
  );

const invoiceGroup = z.object({
  currency: z.string(),
  status: z.enum(INVOICE_LIST_STATUSES),
  outstanding: z.number().int(),
  invoiced: z.number().int(),
  rows: z.number().int(),
});

/** Per currency and status, under every filter but the tab: one read for the counts and the figures. */
async function invoiceGroups(
  ctx: ModuleRequestContext,
  filters: readonly DatasetFilter[],
  search: string | undefined
) {
  const result = await queryDataset(ctx, {
    dataset: "invoices.invoices",
    search,
    query: {
      filters,
      groupBy: [{ field: "currency" }, { field: "status" }],
      aggregates: [
        { fn: "sum", field: "outstandingCents", as: "outstanding" },
        { fn: "sum", field: "totalCents", as: "invoiced" },
        { fn: "count", as: "rows" },
      ],
    },
  });

  return result.rows.map((entry) => invoiceGroup.parse(entry));
}

/** The figures of each currency over the groups of the active tab (LH17). */
function invoiceSummaryOf(
  groups: readonly z.infer<typeof invoiceGroup>[]
): InvoiceListSummary[] {
  const totals = new Map<string, InvoiceListSummary>();

  for (const group of groups) {
    const total = totals.get(group.currency) ?? {
      currency: group.currency,
      outstandingCents: 0,
      overdueCents: 0,
      overdueCount: 0,
      invoicedCents: 0,
      count: 0,
      unpaidCount: 0,
      paidCount: 0,
    };

    const overdue = group.status === "overdue";
    const paid = group.status === "paid";

    totals.set(group.currency, {
      ...total,
      outstandingCents: total.outstandingCents + group.outstanding,
      overdueCents: total.overdueCents + (overdue ? group.outstanding : 0),
      overdueCount: total.overdueCount + (overdue ? group.rows : 0),
      invoicedCents: total.invoicedCents + group.invoiced,
      count: total.count + group.rows,
      unpaidCount: total.unpaidCount + (paid ? 0 : group.rows),
      paidCount: total.paidCount + (paid ? group.rows : 0),
    });
  }

  return byCurrency(totals.values());
}

/**
 * The Invoices list as of the reporting date: `queryDataset` reads under `invoices:read`, so a
 * scoped person sees only the customers they may read (DEC-39, R-9, R-36). A page holds 50 rows,
 * sorted in the database on an allowed column and then the row key, and `after` reads the next one
 * (czjw.28, czjw.71). Page one also answers the tab counts and the figures (LH16, LH17).
 */
export async function loadInvoiceList(
  ctx: ModuleRequestContext,
  after: DatasetCursor | null = null,
  params: InvoiceListParams = {}
): Promise<InvoiceListView> {
  const list = listQueryOf(invoiceListDefinition, paramsOf(params));
  const first = after === null;

  const [result, groups] = await Promise.all([
    queryDataset(ctx, {
      dataset: "invoices.invoices",
      after: after ?? undefined,
      search: list.search,
      query: {
        select: LIST_ROW_FIELDS,
        filters: [...list.filters, ...list.tab],
        orderBy: list.orderBy,
        limit: LIST_PAGE_SIZE,
      },
    }),
    first ? invoiceGroups(ctx, list.filters, list.search) : null,
  ]);

  return {
    asOf: result.asOf,
    rows: result.rows.map((row) => invoiceListRowOf(listRow.parse(row))),
    truncated: result.truncated,
    next: result.next ?? null,
    counts: groups === null ? null : countsOf(invoiceListDefinition, groups),
    summary:
      groups === null
        ? null
        : invoiceSummaryOf(groups.filter(({ status }) => inTab(list, status))),
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

/** The Invoices page: its first page with no filter, the customers of its picker, and the zone. */
export async function loadInvoiceListPage(
  ctx: ModuleRequestContext
): Promise<InvoiceListPageView> {
  const [list, customers, branding] = await Promise.all([
    loadInvoiceList(ctx),
    loadListCustomers(ctx),
    ctx.tenant.branding.get(),
  ]);

  return { ...list, customers, timeZone: branding.defaultTimeZone };
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
  status: z.enum(PAYMENT_STATUSES),
  updatedAt: z.string(),
});

export const PAYMENT_ROW_FIELDS = Object.keys(paymentRow.shape);

/** One payment list row: the dataset already names its status (LH16). */
export function paymentListRowOf(
  row: z.infer<typeof paymentRow>
): PaymentListRow {
  return row;
}

const paymentGroup = z.object({
  currency: z.string(),
  status: z.enum(PAYMENT_STATUSES),
  collected: z.number().int(),
  unallocated: z.number().int(),
  rows: z.number().int(),
});

/** Per currency and status, under every filter but the tab. */
async function paymentGroups(
  ctx: ModuleRequestContext,
  filters: readonly DatasetFilter[],
  search: string | undefined
) {
  const result = await queryDataset(ctx, {
    dataset: "invoices.payments",
    search,
    query: {
      filters,
      groupBy: [{ field: "currency" }, { field: "status" }],
      aggregates: [
        { fn: "sum", field: "amountCents", as: "collected" },
        { fn: "sum", field: "unallocatedCents", as: "unallocated" },
        { fn: "count", as: "rows" },
      ],
    },
  });

  return result.rows.map((entry) => paymentGroup.parse(entry));
}

/** The figures of each currency over the groups of the active tab (LH17). */
function paymentSummaryOf(
  groups: readonly z.infer<typeof paymentGroup>[]
): PaymentListSummary[] {
  const totals = new Map<string, PaymentListSummary>();

  for (const group of groups) {
    const total = totals.get(group.currency) ?? {
      currency: group.currency,
      collectedCents: 0,
      allocatedCents: 0,
      unallocatedCents: 0,
      count: 0,
      allocatedCount: 0,
      notLinkedCount: 0,
    };

    totals.set(group.currency, {
      ...total,
      collectedCents: total.collectedCents + group.collected,
      allocatedCents:
        total.allocatedCents + group.collected - group.unallocated,
      unallocatedCents: total.unallocatedCents + group.unallocated,
      count: total.count + group.rows,
      allocatedCount:
        total.allocatedCount +
        (group.status === "unallocated" ? 0 : group.rows),
      notLinkedCount:
        total.notLinkedCount + (group.status === "allocated" ? 0 : group.rows),
    });
  }

  return byCurrency(totals.values());
}

/** The Payments list, read as `loadInvoiceList` reads the Invoices list (DEC-39, R-9). */
export async function loadPaymentList(
  ctx: ModuleRequestContext,
  after: DatasetCursor | null = null,
  params: PaymentListParams = {}
): Promise<PaymentListView> {
  const list = listQueryOf(paymentListDefinition, paramsOf(params));
  const first = after === null;

  const [result, groups] = await Promise.all([
    queryDataset(ctx, {
      dataset: "invoices.payments",
      after: after ?? undefined,
      search: list.search,
      query: {
        select: PAYMENT_ROW_FIELDS,
        filters: [...list.filters, ...list.tab],
        orderBy: list.orderBy,
        limit: LIST_PAGE_SIZE,
      },
    }),
    first ? paymentGroups(ctx, list.filters, list.search) : null,
  ]);

  return {
    asOf: result.asOf,
    rows: result.rows.map((row) => paymentListRowOf(paymentRow.parse(row))),
    truncated: result.truncated,
    next: result.next ?? null,
    counts: groups === null ? null : countsOf(paymentListDefinition, groups),
    summary:
      groups === null
        ? null
        : paymentSummaryOf(groups.filter(({ status }) => inTab(list, status))),
  };
}

/** The Payments page: its first page with no filter, the customers of its picker, and the zone. */
export async function loadPaymentListPage(
  ctx: ModuleRequestContext
): Promise<PaymentListPageView> {
  const [list, customers, branding] = await Promise.all([
    loadPaymentList(ctx),
    loadListCustomers(ctx),
    ctx.tenant.branding.get(),
  ]);

  return { ...list, customers, timeZone: branding.defaultTimeZone };
}
