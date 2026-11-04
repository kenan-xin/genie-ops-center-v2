"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  type DataTableColumn,
  EmptyState,
  ListHeader,
  useListState,
} from "@genie/ui";
import { useMemo } from "react";

import { invoicesContract, paymentListParams } from "../contract.ts";
import {
  formatDay,
  formatInstant,
  formatMoney,
  paymentLabel,
  rangeNote,
} from "./format.ts";
import { paymentListDefinition } from "./list-definitions.ts";
import { PaymentStatusBadge } from "./payment-status-badge.tsx";
import {
  procedureParams,
  useListPages,
  withOptions,
} from "./use-list-pages.ts";
import type {
  PaymentListPageView,
  PaymentListRow,
  PaymentListSummary,
  PaymentListView,
} from "./views.ts";

const paymentCount = (count: number) =>
  `${count} ${count === 1 ? "payment" : "payments"}`;

const recordHref = (row: PaymentListRow) => `/m/invoices/payments/${row.id}`;

const recordLink = (row: PaymentListRow) => (
  <PageLink href={recordHref(row)} className="after:absolute after:inset-0">
    {paymentLabel(row)}
  </PageLink>
);

/** One figure card per currency, so no figure adds two currencies (LH17). */
const figuresOf = (summary: readonly PaymentListSummary[], collected: string) =>
  summary.map((entry) => ({
    label: `Totals in ${entry.currency}`,
    figures: [
      {
        label: "Collected",
        value: formatMoney(entry.collectedCents, entry.currency),
        note: collected,
        lead: true as const,
      },
      {
        label: "Allocated",
        value: formatMoney(entry.allocatedCents, entry.currency),
        note: `In ${paymentCount(entry.allocatedCount)}`,
      },
      {
        label: "Unallocated",
        value: formatMoney(entry.unallocatedCents, entry.currency),
        note: `In ${paymentCount(entry.notLinkedCount)}`,
      },
      {
        label: "Payments",
        value: String(entry.count),
        note: `${entry.notLinkedCount} not linked`,
      },
    ],
  }));

export type PaymentListProps = {
  readonly view: PaymentListPageView;
};

/**
 * The Payments list on the list header (variant C, `czjw.73`): the figures, the link tabs, the
 * search, customer and payment-date filters, and the table, with every part in the page address
 * and run on the server. The server page is the default one, so the first paint matches it.
 */
export function PaymentList(props: PaymentListProps) {
  const { view } = props;
  const invoices = useModuleClient(invoicesContract);

  const definition = useMemo(
    () =>
      withOptions(
        paymentListDefinition,
        "customer",
        view.customers.map((customer) => ({
          value: customer.id,
          label: customer.name,
        }))
      ),
    [view.customers]
  );

  const state = useListState(definition);
  const params = procedureParams(paymentListParams, state.params);
  const filtered = Object.keys(params).length > 0;

  const list = useListPages<PaymentListView>({
    key: ["invoices", "payment-list", view.asOf, params],
    first: filtered ? undefined : view,
    read: (after) => invoices.listPayments({ after, params }),
  });

  // LH29: the Payment column already shows the reference, and Unallocated is the figure acted on.
  const columns: readonly DataTableColumn<PaymentListRow>[] = [
    { id: "payment", header: "Payment", cell: recordLink },
    {
      id: "customer",
      header: "Customer",
      cell: (row) => row.customerName,
      sort: "text",
    },
    {
      id: "paymentDate",
      header: "Date",
      cell: (row) => formatDay(row.paymentDate),
      sort: "date",
    },
    {
      id: "method",
      header: "Method",
      cell: (row) => row.method ?? "None",
      sort: "text",
    },
    {
      id: "amount",
      header: "Amount",
      cell: (row) => formatMoney(row.amountCents, row.currency),
      align: "end",
      sort: "number",
    },
    {
      id: "unallocated",
      header: "Unallocated",
      cell: (row) => formatMoney(row.unallocatedCents, row.currency),
      align: "end",
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <PaymentStatusBadge status={row.status} />,
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
        title="Payments"
        meta={`Amounts as of ${formatDay(view.asOf)}, the reporting date.`}
      />
      {view.rows.length === 0 ? (
        <EmptyState
          variant="framed"
          title="No payments to show"
          description="Saved payments show here with the amount not yet linked to an invoice."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {list.broken ? (
            <p role="alert">
              The payments could not be read. Change a filter to try again.
            </p>
          ) : null}
          <ListHeader
            definition={definition}
            state={state}
            counts={list.first?.counts ?? undefined}
            figures={figuresOf(
              list.first?.summary ?? [],
              rangeNote(params.date, "All payment dates")
            )}
            anchorDay={view.asOf}
            table={{
              rows: list.rows,
              rowKey: (row) => row.id,
              rowLabel: paymentLabel,
              columns,
              rowLinks: true,
              card: {
                title: recordLink,
                badge: (row) => <PaymentStatusBadge status={row.status} />,
                detail: (row) => row.customerName,
                facts: (row) => [
                  `${formatMoney(row.amountCents, row.currency)} paid ${formatDay(row.paymentDate)}`,
                  `Unallocated ${formatMoney(row.unallocatedCents, row.currency)}`,
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
              title: "No payment matches these filters.",
              description: "Change a filter, or clear them all.",
            }}
          />
        </div>
      )}
    </main>
  );
}
