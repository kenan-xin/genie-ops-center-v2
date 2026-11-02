"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ToggleGroup,
  ToggleGroupItem,
} from "@genie/ui";

import {
  invoicesContract,
  PAYMENT_LIST_LINKS,
  paymentListFilters,
} from "../contract.ts";
import { formatDay, formatMoney, paymentLabel } from "./format.ts";
import {
  CustomerFilter,
  DateRangeFilter,
  ListFilterBar,
} from "./list-filters.tsx";
import { PaymentStatusBadge } from "./payment-status-badge.tsx";
import { type AddressPatch, useAddressFilters } from "./use-address-filters.ts";
import { useListPages } from "./use-list-pages.ts";
import type {
  PaymentListFilters,
  PaymentListPageView,
  PaymentListRow,
  PaymentListView,
} from "./views.ts";

/** Each filter's query parameter in the page address. */
const ADDRESS = {
  search: "q",
  link: "link",
  customerId: "customer",
  from: "from",
  to: "to",
} as const;

const ALL = "all";

const LINK_CHIPS = [
  { value: ALL, label: "All" },
  { value: "linked", label: "Linked" },
  { value: "not-linked", label: "Not linked" },
] as const;

/** The link chips, the customer picker and the payment-date range. */
function PaymentFilters(props: {
  readonly customers: PaymentListPageView["customers"];
  readonly filters: PaymentListFilters;
  readonly update: (patch: AddressPatch<keyof PaymentListFilters>) => void;
}) {
  const { filters, update } = props;

  return (
    <>
      <ToggleGroup
        aria-label="Link"
        value={[filters.link ?? ALL]}
        onValueChange={(value) => {
          const [chosen] = value;

          // A click on the pressed chip answers no chip; the list keeps its link filter.
          if (chosen === undefined) return;

          update({ link: PAYMENT_LIST_LINKS.find((link) => link === chosen) });
        }}
      >
        {LINK_CHIPS.map((chip) => (
          <ToggleGroupItem key={chip.value} value={chip.value}>
            {chip.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <CustomerFilter
        customers={props.customers}
        value={filters.customerId}
        onChange={(customerId) => update({ customerId })}
      />
      <DateRangeFilter
        label="Payment date"
        from={filters.from}
        to={filters.to}
        onChange={(range) => update(range)}
      />
    </>
  );
}

const recordHref = (row: PaymentListRow) => `/m/invoices/payments/${row.id}`;

export type PaymentListProps = {
  readonly view: PaymentListPageView;
};

/**
 * The Payments list: a table from 768 px, the same rows as cards below it. Its search, link,
 * customer and payment-date filters live in the page address and run on the server, so they hold
 * across pages (design review 1.4).
 */
export function PaymentList(props: PaymentListProps) {
  const { view } = props;
  const invoices = useModuleClient(invoicesContract);
  const { filters, update } = useAddressFilters(paymentListFilters, ADDRESS);
  const filtered = Object.keys(filters).length > 0;

  const list = useListPages<PaymentListView>({
    key: ["invoices", "payment-list", view.asOf, filters],
    // The server page is the unfiltered one; a filtered page one is read here.
    first: filtered ? undefined : view,
    read: (after) => invoices.listPayments({ after, filters }),
  });

  const { search: _search, ...narrowing } = filters;

  const clear = () =>
    update({
      link: undefined,
      customerId: undefined,
      from: undefined,
      to: undefined,
    });

  const columns: readonly DataTableColumn<PaymentListRow>[] = [
    {
      id: "payment",
      header: "Payment",
      cell: (row) => (
        <PageLink
          href={recordHref(row)}
          className="after:absolute after:inset-0"
        >
          {paymentLabel(row)}
        </PageLink>
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
      <p>Amounts as of {formatDay(view.asOf)}, the reporting date.</p>
      {view.rows.length === 0 ? (
        <EmptyState
          variant="framed"
          title="No payments to show"
          description="Saved payments show here with the amount not yet linked to an invoice."
        />
      ) : (
        <>
          <ListFilterBar
            searchLabel="Search reference or customer"
            search={filters.search}
            onSearch={(search) => update({ search })}
            count={Object.keys(narrowing).length}
            onClear={clear}
            filters={() => (
              <PaymentFilters
                customers={view.customers}
                filters={filters}
                update={update}
              />
            )}
          />
          {list.pending ? <p role="status">Loading payments…</p> : null}
          {list.broken ? (
            <p role="alert">
              The payments could not be read. Change a filter to try again.
            </p>
          ) : null}
          {!list.pending && !list.broken && list.rows.length === 0 ? (
            <EmptyState
              variant="framed"
              title="No payments match"
              description="Change or clear the filters to see more payments."
            />
          ) : null}
          {list.rows.length === 0 ? null : (
            <DataTable
              label="Payments"
              rows={list.rows}
              rowKey={(row) => row.id}
              rowLabel={paymentLabel}
              columns={columns}
              rowLinks
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
          )}
          {list.more ? (
            <div className="flex flex-wrap items-center gap-3">
              <p>Showing the first {list.rows.length} payments.</p>
              <Button
                variant="secondary"
                disabled={list.loading}
                onClick={list.showMore}
              >
                {list.loading ? "Loading more…" : "Show more"}
              </Button>
            </div>
          ) : null}
          {list.failed ? (
            <p role="alert">
              More payments could not be read. Try Show more again.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
