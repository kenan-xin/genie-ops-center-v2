"use client";

import { EllipsisIcon } from "lucide-react";
import type { ReactNode } from "react";

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
};

export type DataTableAction = {
  readonly label: string;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  /** Set when the action is refused: the item stays, disabled, with this reason as its title. */
  readonly refusal?: string;
};

export type DataTableProps<Row> = {
  /** Names the table and the card list. */
  readonly label: string;
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /** Names the row's menu: `Actions for ${rowLabel(row)}`. */
  readonly rowLabel: (row: Row) => string;
  /** The first column is the identity, on the table and on the card. */
  readonly columns: readonly DataTableColumn<Row>[];
  /** Shows on the table as a "Status" column after the given columns, and on the card. */
  readonly status?: (row: Row) => ReactNode;
  /** One or two scan facts for the card. A third is not rendered. */
  readonly facts?: (row: Row) => readonly ReactNode[];
  readonly onOpenRow?: (row: Row) => void;
  readonly actions?: (row: Row) => readonly DataTableAction[];
};

const maxFacts = 2;

export function DataTable<Row>({
  label,
  rows,
  rowKey,
  rowLabel,
  columns,
  status,
  facts,
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
            <DropdownMenuItem
              key={item.label}
              variant={item.danger ? "destructive" : "default"}
              disabled={item.refusal !== undefined}
              title={item.refusal}
              onClick={item.onSelect}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const [identityColumn] = columns;

  return (
    <>
      <Table className="hidden md:table">
        <TableCaption className="sr-only">{label}</TableCaption>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.id}>{column.header}</TableHead>
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
              {columns.map((column, index) => (
                <TableCell key={column.id}>
                  {index === 0
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
      <ul
        role="list"
        aria-label={label}
        className="divide-y divide-border border-y border-border md:hidden"
      >
        {rows.map((row) => (
          <li key={rowKey(row)} className="flex items-start gap-2 py-4 text-sm">
            <div className="grid min-w-0 flex-1 gap-1">
              {identityColumn ? identity(row, identityColumn.cell(row)) : null}
              {status ? <div>{status(row)}</div> : null}
              {facts
                ? facts(row)
                    .slice(0, maxFacts)
                    .map((fact, index) => (
                      <div
                        key={index}
                        className="text-muted-foreground wrap-anywhere"
                      >
                        {fact}
                      </div>
                    ))
                : null}
            </div>
            {menu(row)}
          </li>
        ))}
      </ul>
    </>
  );
}
