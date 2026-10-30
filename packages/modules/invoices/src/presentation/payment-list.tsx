"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import { DataTable, type DataTableColumn, EmptyState } from "@genie/ui";

import { formatDay, formatMoney, paymentLabel } from "./format.ts";
import { PaymentStatusBadge } from "./payment-status-badge.tsx";
import type { PaymentListRow, PaymentListView } from "./views.ts";

const recordHref = (row: PaymentListRow) => `/m/invoices/payments/${row.id}`;

export type PaymentListProps = {
  readonly view: PaymentListView;
};

/** The Payments list: a table from 768 px, the same rows as cards below it. */
export function PaymentList(props: PaymentListProps) {
  const { view } = props;

  const columns: readonly DataTableColumn<PaymentListRow>[] = [
    {
      id: "payment",
      header: "Payment",
      cell: (row) => (
        <PageLink href={recordHref(row)}>{paymentLabel(row)}</PageLink>
      ),
    },
    { id: "customer", header: "Customer", cell: (row) => row.customerName },
    {
      id: "paymentDate",
      header: "Date",
      cell: (row) => formatDay(row.paymentDate),
    },
    { id: "method", header: "Method", cell: (row) => row.method ?? "None" },
    {
      id: "amount",
      header: "Amount",
      cell: (row) => formatMoney(row.amountCents, row.currency),
      align: "end",
    },
    {
      id: "unallocated",
      header: "Unallocated",
      cell: (row) => formatMoney(row.unallocatedCents, row.currency),
      align: "end",
    },
  ];

  return (
    <main>
      <PageHeader title="Payments" />
      <p>Amounts as of {view.asOf}, the reporting date.</p>
      {view.rows.length === 0 ? (
        <EmptyState
          variant="framed"
          title="No payments to show"
          description="Saved payments show here with the amount not yet linked to an invoice."
        />
      ) : (
        <>
          <DataTable
            label="Payments"
            rows={view.rows}
            rowKey={(row) => row.id}
            rowLabel={paymentLabel}
            columns={columns}
            status={(row) => <PaymentStatusBadge status={row.status} />}
            card={{
              title: (row) => (
                <PageLink
                  href={recordHref(row)}
                  className="after:absolute after:inset-0"
                >
                  {paymentLabel(row)}
                </PageLink>
              ),
              badge: (row) => <PaymentStatusBadge status={row.status} />,
              detail: (row) => row.customerName,
              facts: (row) => [
                formatDay(row.paymentDate),
                `Amount ${formatMoney(row.amountCents, row.currency)}`,
                `Unallocated ${formatMoney(row.unallocatedCents, row.currency)}`,
              ],
            }}
          />
          {view.truncated ? (
            <p>Showing the first {view.rows.length} payments.</p>
          ) : null}
        </>
      )}
    </main>
  );
}
