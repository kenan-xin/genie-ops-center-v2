"use client";

import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { ChevronRightIcon, EllipsisIcon } from "lucide-react";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

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
import { scrollParentOf, useRowWindow, VIRTUAL_FROM } from "./row-window.ts";

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
  /**
   * Set when the identity cell and the card title hold a link with `after:absolute after:inset-0`.
   * The link then covers its table row, and each card shows a chevron, so a row reads as a link
   * (design review 1.5).
   */
  readonly rowLinks?: boolean;
  readonly actions?: (row: Row) => readonly DataTableAction[];
  /** `false` drops the outer border, for a table inside a card that draws its own. */
  readonly framed?: boolean;
  /**
   * A band under the rows, inside the frame, at both widths: a count or a note about the list.
   * Its children sit at the two ends of the band.
   */
  readonly footer?: ReactNode;
  /**
   * Called once per row count when the end of the rows comes within 600 px of the screen, so the
   * list can read its next page (LH12). Show more stays the accessible fallback.
   */
  readonly onEndReached?: () => void;
};

const subscribeNothing = () => () => undefined;

// The server and the hydration render answer `false`, every later render `true`.
const useHydrated = () =>
  useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );

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
  rowLinks = false,
  actions,
  framed = true,
  footer,
  onEndReached,
}: DataTableProps<Row>) {
  // A long list renders only the rows near the screen (czjw.70). Before hydration both layouts
  // render the first window, so the server and the client agree; after it only the shown one.
  const virtual = rows.length > VIRTUAL_FROM;
  const wide = useMediaQuery("(min-width: 768px)", {});
  const hydrated = useHydrated();
  const showTable = !hydrated || wide;
  const showList = !hydrated || !wide;

  const tableBody = useRef<HTMLTableSectionElement>(null);
  const cardList = useRef<HTMLUListElement>(null);

  const tableWindow = useRowWindow({
    count: rows.length,
    enabled: virtual && showTable,
    // A row with an actions button is 65 px (40 px button and 24 px padding), else 49 px.
    estimateSize: actions === undefined ? 49 : 65,
    anchor: tableBody,
  });

  const listWindow = useRowWindow({
    count: rows.length,
    enabled: virtual && showList,
    estimateSize: 76,
    anchor: cardList,
  });

  const rowsAt = (indexes: readonly number[], shown: boolean) =>
    virtual && !shown
      ? []
      : indexes.flatMap((index) => {
          const row = rows[index];

          return row === undefined ? [] : [{ index, row }];
        });

  // Swapped rows must not move a column (LH9): the shares of the first window hold.
  const headRow = useRef<HTMLTableRowElement>(null);

  const columnKey = `${columns.map((column) => column.id).join()}|${status === undefined ? "" : "status"}`;

  const [shares, setShares] = useState<{
    readonly key: string;
    readonly widths: readonly number[];
  }>();

  useLayoutEffect(() => {
    const row = headRow.current;

    if (!virtual || !showTable || row === null || shares?.key === columnKey)
      return;

    const total = row.getBoundingClientRect().width;

    if (total === 0) return;

    setShares({
      key: columnKey,
      widths: [...row.cells].map(
        (cell) => (cell.getBoundingClientRect().width / total) * 100
      ),
    });
  });

  const fixedWidths =
    virtual && shares?.key === columnKey ? shares.widths : undefined;

  const columnCount = columns.length + (status ? 2 : 1);

  const end = useRef<HTMLDivElement>(null);

  const reportedAt = useRef(-1);

  const reportEnd = useEffectEvent((count: number) => {
    if (reportedAt.current === count) return;

    reportedAt.current = count;
    onEndReached?.();
  });

  const listensForEnd = onEndReached !== undefined;

  // A new observer per row count reports at once when the end is still near after a page.
  useEffect(() => {
    const sentinel = end.current;

    if (!listensForEnd || sentinel === null) return;

    const count = rows.length;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reportEnd(count);
      },
      { root: scrollParentOf(sentinel), rootMargin: "0px 0px 600px 0px" }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [listensForEnd, rows.length]);

  const outer = framed ? "rounded-xl border border-border" : "";

  // With a footer, one frame holds the rows and the band, so the band renders once.
  const frame = footer === undefined ? outer : "";

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

  const body = (
    <>
      {/* A bordered card holds the header band and the rows, so the band does not float (UI-1). */}
      <div
        data-slot="data-table"
        className={`hidden overflow-hidden md:block ${frame}`}
      >
        <Table
          aria-rowcount={rows.length + 1}
          className={fixedWidths === undefined ? undefined : "table-fixed"}
        >
          <TableCaption className="sr-only">{label}</TableCaption>
          {fixedWidths === undefined ? null : (
            <colgroup>
              {fixedWidths.map((width, index) => (
                <col
                  key={index}
                  className="w-(--column)"
                  style={
                    // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
                    { "--column": `${width}%` } as CSSProperties
                  }
                />
              ))}
            </colgroup>
          )}
          <TableHeader>
            <TableRow ref={headRow} aria-rowindex={1}>
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
          <TableBody ref={tableBody}>
            {tableWindow.before > 0 ? (
              <tr aria-hidden="true">
                <td
                  colSpan={columnCount}
                  className="h-(--spacer) p-0"
                  style={
                    // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
                    { "--spacer": `${tableWindow.before}px` } as CSSProperties
                  }
                />
              </tr>
            ) : null}
            {rowsAt(tableWindow.indexes, showTable).map(({ index, row }) => (
              <TableRow
                key={rowKey(row)}
                ref={virtual ? tableWindow.measure : undefined}
                data-index={index}
                aria-rowindex={index + 2}
                className={rowLinks ? "relative" : undefined}
              >
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
                <TableCell className="relative z-10 text-right">
                  {menu(row)}
                </TableCell>
              </TableRow>
            ))}
            {tableWindow.after > 0 ? (
              <tr aria-hidden="true">
                <td
                  colSpan={columnCount}
                  className="h-(--spacer) p-0"
                  style={
                    // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
                    { "--spacer": `${tableWindow.after}px` } as CSSProperties
                  }
                />
              </tr>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <ul
        ref={cardList}
        role="list"
        aria-label={label}
        className={`divide-y divide-border md:hidden ${frame}`}
      >
        {listWindow.before > 0 ? (
          <li
            aria-hidden="true"
            className="h-(--spacer)"
            style={
              // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
              { "--spacer": `${listWindow.before}px` } as CSSProperties
            }
          />
        ) : null}
        {rowsAt(listWindow.indexes, showList).map(({ index, row }) => {
          const badge = card.badge?.(row) ?? null;
          const detail = card.detail?.(row) ?? null;
          const facts = card.facts?.(row) ?? [];
          const content = card.content?.(row) ?? null;
          const trailing = card.trailing?.(row) ?? null;
          const rowMenu = menu(row);

          return (
            <li
              key={rowKey(row)}
              ref={virtual ? listWindow.measure : undefined}
              data-index={index}
              aria-setsize={rows.length}
              aria-posinset={index + 1}
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
              {rowLinks ? (
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 self-center text-muted-foreground"
                />
              ) : null}
              {/* No empty cell, so a card without actions keeps no gap at its end. */}
              {rowMenu === null ? null : (
                <span className="relative z-10">{rowMenu}</span>
              )}
            </li>
          );
        })}
        {listWindow.after > 0 ? (
          <li
            aria-hidden="true"
            className="h-(--spacer)"
            style={
              // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
              { "--spacer": `${listWindow.after}px` } as CSSProperties
            }
          />
        ) : null}
      </ul>
      {listensForEnd ? <div ref={end} aria-hidden="true" /> : null}
    </>
  );

  if (footer === undefined) return body;

  return (
    <div className={`overflow-hidden ${outer}`}>
      {body}
      <div
        data-slot="data-table-footer"
        className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-muted-foreground md:px-5"
      >
        {footer}
      </div>
    </div>
  );
}
