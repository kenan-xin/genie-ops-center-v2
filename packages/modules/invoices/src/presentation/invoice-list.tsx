"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  type ChartColumn,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FigureStrip,
  formatChartValue,
  ToggleGroup,
  ToggleGroupItem,
} from "@genie/ui";

import {
  INVOICE_LIST_STATUSES,
  invoiceListFilters,
  invoicesContract,
} from "../contract.ts";
import { formatDay, formatMoney } from "./format.ts";
import { InvoiceStatusBadge } from "./invoice-status-badge.tsx";
import {
  CustomerFilter,
  DateRangeFilter,
  ListFilterBar,
} from "./list-filters.tsx";
import { type AddressPatch, useAddressFilters } from "./use-address-filters.ts";
import { useListPages } from "./use-list-pages.ts";
import type {
  InvoiceListFilters,
  InvoiceListPageView,
  InvoiceListRow,
  InvoiceListSummary,
  InvoiceListView,
} from "./views.ts";

/** Each filter's query parameter in the page address. */
const ADDRESS = {
  search: "q",
  status: "status",
  customerId: "customer",
  from: "from",
  to: "to",
} as const;

const ALL = "all";

const STATUS_CHIPS = [
  { value: ALL, label: "All" },
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "no-due-date", label: "No due date" },
] as const;

const invoiceCount = (count: number) =>
  `${count} ${count === 1 ? "invoice" : "invoices"}`;

/** One figure strip per currency, so no figure adds two currencies (Review Focus 1). */
function SummaryStrips(props: {
  readonly summary: readonly InvoiceListSummary[];
}) {
  return props.summary.map((entry) => (
    <FigureStrip
      key={entry.currency}
      label={`Totals in ${entry.currency}`}
      figures={[
        {
          label: "Outstanding",
          value: formatMoney(entry.outstandingCents, entry.currency),
          lead: true,
        },
        {
          label: "Overdue",
          value: formatMoney(entry.overdueCents, entry.currency),
          note: `In ${invoiceCount(entry.overdueCount)}`,
        },
        {
          label: "Invoiced",
          value: formatMoney(entry.invoicedCents, entry.currency),
        },
        { label: "Invoices", value: String(entry.count) },
      ]}
    />
  ));
}

/** The status chips, the customer picker and the invoice-date range. */
function InvoiceFilters(props: {
  readonly customers: InvoiceListPageView["customers"];
  readonly filters: InvoiceListFilters;
  readonly update: (patch: AddressPatch<keyof InvoiceListFilters>) => void;
}) {
  const { filters, update } = props;

  return (
    <>
      <ToggleGroup
        aria-label="Status"
        value={[filters.status ?? ALL]}
        onValueChange={(value) => {
          const [chosen] = value;

          // A click on the pressed chip answers no chip; the list keeps its status.
          if (chosen === undefined) return;

          update({
            status: INVOICE_LIST_STATUSES.find((status) => status === chosen),
          });
        }}
      >
        {STATUS_CHIPS.map((chip) => (
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
        label="Invoice date"
        from={filters.from}
        to={filters.to}
        onChange={(range) => update(range)}
      />
    </>
  );
}

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
  readonly view: InvoiceListPageView;
};

/**
 * The Invoices list: a table from 768 px, the same rows as cards below it. Its search, status,
 * customer and invoice-date filters live in the page address and run on the server, so they hold
 * across pages, and the summary covers every invoice they keep (design review 1.4).
 */
export function InvoiceList(props: InvoiceListProps) {
  const { view } = props;
  const invoices = useModuleClient(invoicesContract);
  const { filters, update } = useAddressFilters(invoiceListFilters, ADDRESS);
  const filtered = Object.keys(filters).length > 0;

  const list = useListPages<InvoiceListView>({
    key: ["invoices", "invoice-list", view.asOf, filters],
    // The server page is the unfiltered one; a filtered page one is read here.
    first: filtered ? undefined : view,
    read: (after) => invoices.listInvoices({ after, filters }),
  });

  const { search: _search, ...narrowing } = filters;

  const clear = () =>
    update({
      status: undefined,
      customerId: undefined,
      from: undefined,
      to: undefined,
    });

  const columns: readonly DataTableColumn<InvoiceListRow>[] = [
    {
      id: "invoice",
      header: "Invoice",
      cell: (row) => (
        <PageLink
          href={recordHref(row)}
          className="after:absolute after:inset-0"
        >
          {row.invoiceNumber}
        </PageLink>
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
          {list.first === undefined ? null : (
            <SummaryStrips summary={list.first.summary} />
          )}
          <ListFilterBar
            searchLabel="Search invoice number or customer"
            search={filters.search}
            onSearch={(search) => update({ search })}
            count={Object.keys(narrowing).length}
            onClear={clear}
            filters={() => (
              <InvoiceFilters
                customers={view.customers}
                filters={filters}
                update={update}
              />
            )}
          />
          {list.pending ? <p role="status">Loading invoices…</p> : null}
          {list.broken ? (
            <p role="alert">
              The invoices could not be read. Change a filter to try again.
            </p>
          ) : null}
          {!list.pending && !list.broken && list.rows.length === 0 ? (
            <EmptyState
              variant="framed"
              title="No invoices match"
              description="Change or clear the filters to see more invoices."
            />
          ) : null}
          {list.rows.length === 0 ? null : (
            <DataTable
              label="Invoices"
              rows={list.rows}
              rowKey={(row) => row.id}
              rowLabel={(row) => row.invoiceNumber}
              columns={columns}
              rowLinks
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
          )}
          {list.more ? (
            <div className="flex flex-wrap items-center gap-3">
              <p>Showing the first {list.rows.length} invoices.</p>
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
              More invoices could not be read. Try Show more again.
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}
