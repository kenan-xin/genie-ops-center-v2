"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  type ChartColumn,
  type DataTableColumn,
  EmptyState,
  formatChartValue,
  ListHeader,
  useListState,
} from "@genie/ui";
import { useMemo } from "react";

import { invoiceListParams, invoicesContract } from "../contract.ts";
import { formatDay, formatInstant, rangeNote } from "./format.ts";
import { InvoiceStatusBadge } from "./invoice-status-badge.tsx";
import { invoiceListDefinition } from "./list-definitions.ts";
import {
  procedureParams,
  useListPages,
  withOptions,
} from "./use-list-pages.ts";
import type {
  InvoiceListPageView,
  InvoiceListRow,
  InvoiceListSummary,
  InvoiceListView,
} from "./views.ts";

const invoiceCount = (count: number) =>
  `${count} ${count === 1 ? "invoice" : "invoices"}`;

const AMOUNT: ChartColumn = {
  key: "amount",
  label: "Amount",
  type: "money",
  currencyKey: "currency",
};

const INVOICE_DATE: ChartColumn = {
  key: "invoiceDate",
  label: "Invoice date",
  type: "date",
};

const DUE_DATE: ChartColumn = {
  key: "dueDate",
  label: "Due date",
  type: "date",
};

/** Every amount is read and shown in its own currency (Review Focus 1). */
const money = (currency: string, cents: number) =>
  formatChartValue(AMOUNT, cents, { row: { currency } });

const invoiceDate = (row: InvoiceListRow) =>
  formatChartValue(INVOICE_DATE, row.invoiceDate);

const dueDate = (row: InvoiceListRow) =>
  row.dueDate === null
    ? "No due date"
    : formatChartValue(DUE_DATE, row.dueDate);

const recordHref = (row: InvoiceListRow) => `/m/invoices/invoices/${row.id}`;

const recordLink = (row: InvoiceListRow) => (
  <PageLink href={recordHref(row)} className="after:absolute after:inset-0">
    {row.invoiceNumber}
  </PageLink>
);

/** One figure card per currency, so no figure adds two currencies (LH17). */
const figuresOf = (summary: readonly InvoiceListSummary[], invoiced: string) =>
  summary.map((entry) => ({
    label: `Totals in ${entry.currency}`,
    figures: [
      {
        label: "Outstanding",
        value: money(entry.currency, entry.outstandingCents),
        note: `In ${invoiceCount(entry.unpaidCount)}`,
        lead: true as const,
      },
      {
        label: "Overdue",
        value: money(entry.currency, entry.overdueCents),
        note: `In ${invoiceCount(entry.overdueCount)}`,
      },
      {
        label: "Invoiced",
        value: money(entry.currency, entry.invoicedCents),
        note: invoiced,
      },
      {
        label: "Invoices",
        value: String(entry.count),
        note: `${entry.paidCount} paid`,
      },
    ],
  }));

export type InvoiceListProps = {
  readonly view: InvoiceListPageView;
};

/**
 * The Invoices list on the list header (variant C, `czjw.73`): the figures, the status tabs, the
 * search, customer and invoice-date filters, and the table, with every part in the page address
 * and run on the server. The server page is the default one, so the first paint matches it.
 */
export function InvoiceList(props: InvoiceListProps) {
  const { view } = props;
  const invoices = useModuleClient(invoicesContract);

  const definition = useMemo(
    () =>
      withOptions(
        invoiceListDefinition,
        "customer",
        view.customers.map((customer) => ({
          value: customer.id,
          label: customer.name,
        }))
      ),
    [view.customers]
  );

  const state = useListState(definition);
  const params = procedureParams(invoiceListParams, state.params);
  const filtered = Object.keys(params).length > 0;

  const list = useListPages<InvoiceListView>({
    key: ["invoices", "invoice-list", view.asOf, params],
    first: filtered ? undefined : view,
    read: (after) => invoices.listInvoices({ after, params }),
  });

  const columns: readonly DataTableColumn<InvoiceListRow>[] = [
    { id: "invoice", header: "Invoice", cell: recordLink, sort: "text" },
    {
      id: "customer",
      header: "Customer",
      cell: (row) => row.customerName,
      sort: "text",
    },
    {
      id: "invoiceDate",
      header: "Invoice date",
      cell: invoiceDate,
      sort: "date",
    },
    { id: "dueDate", header: "Due date", cell: dueDate, sort: "date" },
    {
      id: "total",
      header: "Total",
      cell: (row) => money(row.currency, row.totalCents),
      align: "end",
      sort: "number",
    },
    {
      id: "outstanding",
      header: "Outstanding",
      cell: (row) => money(row.currency, row.outstandingCents),
      align: "end",
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <InvoiceStatusBadge status={row.status} />,
    },
    {
      id: "updated",
      header: "Updated",
      cell: (row) => formatInstant(row.updatedAt, view.timeZone),
      sort: "date",
    },
  ];

  return (
    <main>
      <PageHeader
        title="Invoices"
        meta={`Balances as of ${formatDay(view.asOf)}, the reporting date.`}
      />
      {view.rows.length === 0 ? (
        <EmptyState
          variant="framed"
          title="No invoices to show"
          description="Saved invoices show here with their balance."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {list.broken ? (
            <p role="alert">
              The invoices could not be read. Change a filter to try again.
            </p>
          ) : null}
          <ListHeader
            definition={definition}
            state={state}
            counts={list.first?.counts ?? undefined}
            figures={figuresOf(
              list.first?.summary ?? [],
              rangeNote(params.date, "All invoice dates")
            )}
            anchorDay={view.asOf}
            table={{
              rows: list.rows,
              rowKey: (row) => row.id,
              rowLabel: (row) => row.invoiceNumber,
              columns,
              rowLinks: true,
              card: {
                title: recordLink,
                badge: (row) => <InvoiceStatusBadge status={row.status} />,
                detail: (row) => row.customerName,
                facts: (row) => [
                  row.outstandingCents === 0
                    ? `${money(row.currency, row.totalCents)} paid`
                    : `${money(row.currency, row.outstandingCents)} outstanding`,
                  row.dueDate === null
                    ? "No due date"
                    : `Due ${formatDay(row.dueDate)}`,
                  `Updated ${formatInstant(row.updatedAt, view.timeZone)}`,
                ],
              },
            }}
            page={{
              loaded: list.rows.length,
              more: list.more,
              loading: list.pending || list.loading,
              failed: list.failed,
              onMore: list.showMore,
            }}
            empty={{
              title: "No invoice matches these filters.",
              description: "Change a filter, or clear them all.",
            }}
          />
        </div>
      )}
    </main>
  );
}
