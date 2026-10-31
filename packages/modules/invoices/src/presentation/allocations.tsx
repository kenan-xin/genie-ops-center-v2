import { PageLink } from "@genie/core/features/shell";
import { Button, DataTable, type DataTableColumn } from "@genie/ui";

import { formatDay, formatInstant, formatMoney } from "./format.ts";
import type { AllocationRow, HistoryRow } from "./views.ts";

/** Which record of a link a row opens: the payment on an invoice's page, the invoice on a payment's. */
export type LinkedRecord = "payment" | "invoice";

type Linked = Omit<AllocationRow, "id" | "amountCents">;

const HEADER: Record<LinkedRecord, string> = {
  payment: "Payment",
  invoice: "Invoice",
};

const how = (row: Linked) => (row.automatic ? "Automatic" : "By a person");

const CHANGE: Record<HistoryRow["action"], string> = {
  linked: "Linked",
  changed: "Changed",
  unlinked: "Unlinked",
};

const amount = (row: HistoryRow) =>
  `${formatMoney(row.amountBeforeCents, row.currency)} → ${formatMoney(row.amountAfterCents, row.currency)}`;

/** How a link names its other record: a payment by reference, else by day; an invoice by number. */
export function labelOf(row: Linked, other: LinkedRecord): string {
  return other === "payment"
    ? (row.paymentReference ?? formatDay(row.paymentDate))
    : row.invoiceNumber;
}

function OtherRecord(props: {
  readonly row: Linked;
  readonly other: LinkedRecord;
  readonly className?: string;
}) {
  const { row, other, className } = props;

  const href =
    other === "payment"
      ? `/m/invoices/payments/${row.paymentId}`
      : `/m/invoices/invoices/${row.invoiceId}`;

  return (
    <PageLink href={href} className={className}>
      {labelOf(row, other)}
    </PageLink>
  );
}

// The whole card opens the other record, as the list's cards do.
const CARD_LINK = "after:absolute after:inset-0";

/** What a writer of the record may do to one link (R-32). */
export type LinkActions = {
  readonly onUndo: (row: AllocationRow) => void;
  readonly onChange: (row: AllocationRow) => void;
  readonly onRemove: (row: AllocationRow) => void;
};

export type AllocationTableProps = {
  readonly rows: readonly AllocationRow[];
  readonly other: LinkedRecord;
  /** Without it the table shows no Undo and no action. */
  readonly actions?: LinkActions;
};

/** The links of one record, each opening the other record. */
export function AllocationTable(props: AllocationTableProps) {
  const { rows, other, actions } = props;

  // Undo only for an automatic link, with no confirmation (decision 9).
  const undo = (row: AllocationRow) =>
    actions === undefined || !row.automatic ? null : (
      <Button
        variant="secondary"
        size="sm"
        aria-label={`Undo the automatic link to ${labelOf(row, other)}`}
        onClick={() => actions.onUndo(row)}
      >
        Undo
      </Button>
    );

  const columns: readonly DataTableColumn<AllocationRow>[] = [
    {
      id: "other",
      header: HEADER[other],
      cell: (row) => <OtherRecord row={row} other={other} />,
    },
    { id: "date", header: "Date", cell: (row) => formatDay(row.paymentDate) },
    {
      id: "amount",
      header: "Amount",
      cell: (row) => formatMoney(row.amountCents, row.currency),
      align: "end",
    },
    {
      id: "how",
      header: "How",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {how(row)}
          {undo(row)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      label="Allocations"
      rows={rows}
      rowKey={(row) => row.id}
      rowLabel={(row) => labelOf(row, other)}
      columns={columns}
      actions={(row) =>
        actions === undefined
          ? []
          : [
              { label: "Change amount", onSelect: () => actions.onChange(row) },
              {
                label: "Remove link",
                danger: true,
                onSelect: () => actions.onRemove(row),
              },
            ]
      }
      card={{
        title: (row) => (
          <OtherRecord row={row} other={other} className={CARD_LINK} />
        ),
        facts: (row) => [
          formatDay(row.paymentDate),
          formatMoney(row.amountCents, row.currency),
          how(row),
        ],
        content: undo,
      }}
    />
  );
}

export type HistoryTableProps = {
  readonly rows: readonly HistoryRow[];
  readonly other: LinkedRecord;
  /** The tenant's time zone, in which each change's time shows (P10). */
  readonly timeZone: string;
};

/** Every change of the links of one record, oldest first, with the amount before and after. */
export function HistoryTable(props: HistoryTableProps) {
  const { rows, other, timeZone } = props;

  const when = (row: HistoryRow) => formatInstant(row.occurredAt, timeZone);

  const columns: readonly DataTableColumn<HistoryRow>[] = [
    { id: "when", header: "When", cell: when },
    { id: "change", header: "Change", cell: (row) => CHANGE[row.action] },
    {
      id: "other",
      header: HEADER[other],
      cell: (row) => <OtherRecord row={row} other={other} />,
    },
    { id: "amount", header: "Amount", cell: amount, align: "end" },
    { id: "how", header: "How", cell: how },
  ];

  return (
    <DataTable
      label="History"
      rows={rows}
      rowKey={(row) => row.id}
      rowLabel={(row) => `${CHANGE[row.action]} ${when(row)}`}
      columns={columns}
      card={{
        title: (row) => CHANGE[row.action],
        detail: (row) => <OtherRecord row={row} other={other} />,
        facts: (row) => [when(row), amount(row), how(row)],
      }}
    />
  );
}
