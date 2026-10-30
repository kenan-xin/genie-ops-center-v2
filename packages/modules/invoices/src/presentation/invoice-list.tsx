"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import {
  type ChartColumn,
  DataTable,
  type DataTableColumn,
  EmptyState,
  formatChartValue,
} from "@genie/ui";

import { InvoiceStatusBadge } from "./invoice-status-badge.tsx";
import type { InvoiceListRow, InvoiceListView } from "./views.ts";

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

/** Every amount is read and shown in its own row's currency (Review Focus 1). */
const money = (row: InvoiceListRow, cents: number) =>
  formatChartValue(AMOUNT, cents, { row: { currency: row.currency } });

const invoiceDate = (row: InvoiceListRow) =>
  formatChartValue(INVOICE_DATE, row.invoiceDate);

const dueDate = (row: InvoiceListRow) =>
  row.dueDate === null
    ? "No due date"
    : formatChartValue(DUE_DATE, row.dueDate);

const recordHref = (row: InvoiceListRow) => `/m/invoices/invoices/${row.id}`;

export type InvoiceListProps = {
  readonly view: InvoiceListView;
};

/** The Invoices list: a table from 768 px, the same rows as cards below it. */
export function InvoiceList(props: InvoiceListProps) {
  const { view } = props;

  const columns: readonly DataTableColumn<InvoiceListRow>[] = [
    {
      id: "invoice",
      header: "Invoice",
      cell: (row) => (
        <PageLink href={recordHref(row)}>{row.invoiceNumber}</PageLink>
      ),
    },
    { id: "customer", header: "Customer", cell: (row) => row.customerName },
    { id: "invoiceDate", header: "Invoice date", cell: invoiceDate },
    { id: "dueDate", header: "Due date", cell: dueDate },
    {
      id: "total",
      header: "Total",
      cell: (row) => money(row, row.totalCents),
      align: "end",
    },
    {
      id: "outstanding",
      header: "Outstanding",
      cell: (row) => money(row, row.outstandingCents),
      align: "end",
    },
  ];

  return (
    <main>
      <PageHeader title="Invoices" />
      <p>Balances as of {view.asOf}, the reporting date.</p>
      {view.rows.length === 0 ? (
        <EmptyState
          variant="framed"
          title="No invoices to show"
          description="Saved invoices show here with their balance."
        />
      ) : (
        <>
          <DataTable
            label="Invoices"
            rows={view.rows}
            rowKey={(row) => row.id}
            rowLabel={(row) => row.invoiceNumber}
            columns={columns}
            status={(row) => <InvoiceStatusBadge status={row.status} />}
            card={{
              title: (row) => (
                <PageLink
                  href={recordHref(row)}
                  className="after:absolute after:inset-0"
                >
                  {row.invoiceNumber}
                </PageLink>
              ),
              badge: (row) => <InvoiceStatusBadge status={row.status} />,
              detail: (row) => row.customerName,
              facts: (row) => [
                invoiceDate(row),
                `Outstanding ${money(row, row.outstandingCents)}`,
              ],
            }}
          />
          {view.truncated ? (
            <p>Showing the first {view.rows.length} invoices.</p>
          ) : null}
        </>
      )}
    </main>
  );
}
