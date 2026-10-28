"use client";

import { EllipsisIcon } from "lucide-react";
import { Fragment, useId, type ReactNode } from "react";

import { Button } from "../components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/dropdown-menu.tsx";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/table.tsx";
import { focusRing } from "../theme/tokens.ts";

export type DataTableColumn<Row> = {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** `end` lines the header and the cells up at the end of the column, for a count. */
  readonly align?: "end";
};

/**
 * The phone card of one row (fix list "Phone card lists (layout)"): a neutral tile, the name with
 * its pills, up to two muted lines, and the actions menu. The title's button stretches over the
 * card, so a tap anywhere but the menu opens the row.
 */
export type DataTableCard<Row> = {
  /** The leading tile: an `IconTile`, or an `Avatar` for a person. */
  readonly media?: (row: Row) => ReactNode;
  /** Line 1, inside the button that opens the row. */
  readonly title: (row: Row) => ReactNode;
  /** Pills on line 1, right of the title: a kind, a status, or both. */
  readonly badge?: (row: Row) => ReactNode;
  /** A muted line under the title: an email, an id. */
  readonly detail?: (row: Row) => ReactNode;
  /** Muted segments joined with " · " on one line. A long line truncates. */
  readonly facts?: (row: Row) => readonly ReactNode[];
  /** Content under the facts that takes its own layout: a picker, a row of access. */
  readonly content?: (row: Row) => ReactNode;
  /** The end of line 1, above the row button: an age, or a switch, which stays clickable. */
  readonly trailing?: (row: Row) => ReactNode;
};

export type DataTableAction = {
  readonly label: string;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  /** Set when the action is refused: the item stays, disabled, and shows this reason as its description. */
  readonly refusal?: string;
};

export type DataTableProps<Row> = {
  /** Names the table and the card list. */
  readonly label: string;
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /** Names the row's menu: `Actions for ${rowLabel(row)}`. */
  readonly rowLabel: (row: Row) => string;
  /** The first column is the identity, on the table and on the card, unless `identityColumn` names another. */
  readonly columns: readonly DataTableColumn<Row>[];
  /** The id of the column whose cell opens the row. */
  readonly identityColumn?: string;
  /** Shows as a "Status" column after the given columns. The card states the same fact in `badge`. */
  readonly status?: (row: Row) => ReactNode;
  /** The phone card. Below 768 px the table is this list instead. */
  readonly card: DataTableCard<Row>;
  readonly onOpenRow?: (row: Row) => void;
  readonly actions?: (row: Row) => readonly DataTableAction[];
};

/** One line of facts, so that every card of a list keeps the same height. */
function Facts(props: { readonly items: readonly ReactNode[] }) {
  return (
    <>
      {props.items.map((item, index) => (
        <Fragment key={index}>
          {index === 0 ? null : " · "}
          {item}
        </Fragment>
      ))}
    </>
  );
}

// The reason is visible text, not a title, because a touch screen has no hover (R-21, R-38).
function ActionItem({ item }: { readonly item: DataTableAction }) {
  const reasonId = useId();

  return (
    <DropdownMenuItem
      variant={item.danger ? "destructive" : "default"}
      disabled={item.refusal !== undefined}
      aria-label={item.label}
      aria-describedby={item.refusal === undefined ? undefined : reasonId}
      className={
        item.refusal === undefined ? undefined : "flex-col items-start"
      }
      onClick={item.onSelect}
    >
      {item.label}
      {item.refusal === undefined ? null : (
        <span id={reasonId} className="text-xs text-muted-foreground">
          {item.refusal}
        </span>
      )}
    </DropdownMenuItem>
  );
}

export function DataTable<Row>({
  label,
  rows,
  rowKey,
  rowLabel,
  columns,
  identityColumn: identityId,
  status,
  card,
  onOpenRow,
  actions,
}: DataTableProps<Row>) {
  // The identity opens the row through a native button (R-23): Enter and Space
  // come with it, and the actions menu follows it in the tab order.
  const identity = (row: Row, content: ReactNode) =>
    onOpenRow ? (
      <button
        type="button"
        className={`flex min-h-11 w-full items-center rounded-lg text-left font-medium wrap-anywhere text-foreground lg:min-h-0 ${focusRing}`}
        onClick={() => onOpenRow(row)}
      >
        {content}
      </button>
    ) : (
      <span className="block font-medium wrap-anywhere">{content}</span>
    );

  const menu = (row: Row) => {
    const items = actions?.(row) ?? [];

    if (items.length === 0) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${rowLabel(row)}`}
            />
          }
        >
          <EllipsisIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item) => (
            <ActionItem key={item.label} item={item} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const identityColumn =
    columns.find((column) => column.id === identityId) ?? columns[0];

  return (
    <>
      {/* A bordered card holds the header band and the rows, so the band does not float (UI-1). */}
      <div
        data-slot="data-table"
        className="hidden overflow-hidden rounded-xl border border-border md:block"
      >
        <Table>
          <TableCaption className="sr-only">{label}</TableCaption>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={column.align === "end" ? "text-right" : undefined}
                >
                  {column.header}
                </TableHead>
              ))}
              {status ? <TableHead>Status</TableHead> : null}
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={
                      column.align === "end" ? "text-right" : undefined
                    }
                  >
                    {column === identityColumn
                      ? identity(row, column.cell(row))
                      : column.cell(row)}
                  </TableCell>
                ))}
                {status ? <TableCell>{status(row)}</TableCell> : null}
                <TableCell className="text-right">{menu(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul
        role="list"
        aria-label={label}
        className="divide-y divide-border rounded-xl border border-border md:hidden"
      >
        {rows.map((row) => {
          const badge = card.badge?.(row) ?? null;
          const detail = card.detail?.(row) ?? null;
          const facts = card.facts?.(row) ?? [];
          const content = card.content?.(row) ?? null;
          const trailing = card.trailing?.(row) ?? null;
          const rowMenu = menu(row);

          return (
            <li
              key={rowKey(row)}
              className="relative flex items-start gap-3 px-4 py-3 text-sm"
            >
              {card.media === undefined ? null : (
                <span className="pt-0.5">{card.media(row)}</span>
              )}
              <div className="grid min-w-0 flex-1 gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  {onOpenRow === undefined ? (
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {card.title(row)}
                    </span>
                  ) : (
                    // The pseudo-element covers the card, so the whole row is one tap target (R-23).
                    <button
                      type="button"
                      className={`min-w-0 rounded-sm text-left font-medium text-foreground after:absolute after:inset-0 ${focusRing}`}
                      onClick={() => onOpenRow(row)}
                    >
                      <span className="block truncate">{card.title(row)}</span>
                    </button>
                  )}
                  {badge === null ? null : (
                    <span className="flex shrink-0 items-center gap-1.5">
                      {badge}
                    </span>
                  )}
                  {trailing === null ? null : (
                    <span className="relative z-10 ml-auto shrink-0">
                      {trailing}
                    </span>
                  )}
                </div>
                {detail === null ? null : (
                  <div className="truncate text-xs text-muted-foreground">
                    {detail}
                  </div>
                )}
                {facts.length === 0 ? null : (
                  <div className="truncate text-muted-foreground">
                    <Facts items={facts} />
                  </div>
                )}
                {content === null ? null : (
                  <div className="relative z-10">{content}</div>
                )}
              </div>
              {/* No empty cell, so a card without actions keeps no gap at its end. */}
              {rowMenu === null ? null : (
                <span className="relative z-10">{rowMenu}</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
