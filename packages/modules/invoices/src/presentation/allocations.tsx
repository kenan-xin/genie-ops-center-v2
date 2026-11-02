import { PageLink } from "@genie/core/features/shell";
import { Button, DataTable, type DataTableColumn } from "@genie/ui";

import { formatDay, formatInstant, formatMoney } from "./format.ts";
import { historySentence, labelOf, type LinkedRecord } from "./history-text.ts";
import type { AllocationRow, HistoryRow } from "./views.ts";

export type { LinkedRecord };

type Linked = Omit<AllocationRow, "id" | "amountCents">;

const HEADER: Record<LinkedRecord, string> = {
  payment: "Payment",
  invoice: "Invoice",
};

/** The name of a record's links card and of its table: the records on the other side. */
export const LINKS_LABEL: Record<LinkedRecord, string> = {
  payment: "Payments",
  invoice: "Invoices",
};

const how = (row: Linked) => (row.automatic ? "Automatic" : "By a person");

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
      label={LINKS_LABEL[other]}
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

export type HistoryListProps = {
  /** Oldest first, as the record answers them. */
  readonly rows: readonly HistoryRow[];
  readonly other: LinkedRecord;
  /** The tenant's time zone, in which each change's time shows (P10). */
  readonly timeZone: string;
};

/** Every change of the links of one record, newest first, one dated sentence each (2.5). */
export function HistoryList(props: HistoryListProps) {
  const { rows, other, timeZone } = props;

  return (
    <ol aria-label="History" className="divide-y divide-border border-y">
      {rows.toReversed().map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-1 py-2.5 text-sm md:flex-row md:gap-3"
        >
          <time
            dateTime={row.occurredAt}
            className="shrink-0 text-muted-foreground tabular-nums md:w-44"
          >
            {formatInstant(row.occurredAt, timeZone)}
          </time>
          <span>{historySentence(row, other)}</span>
        </li>
      ))}
    </ol>
  );
}
