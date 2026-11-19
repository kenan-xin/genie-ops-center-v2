import {
  formatChartValue,
  type ChartColumn,
  type ChartData,
} from "@genie/ui/chart-data";
import type { ReactNode } from "react";

/**
 * The short list of a list answer (R-44a): the chat shows the first rows and how many more, and
 * the full list opens as the table artifact. A large row count never renders in the chat.
 */
export const SHORT_LIST_ROWS = 5;

/** "7 more rows", or "995+ more rows" when the gate cut the read, because then the count is only a floor. */
export function moreText(hidden: number, truncated: boolean): string {
  return `${hidden.toLocaleString("en-GB")}${truncated ? "+" : ""} more rows`;
}

/** The columns the card's first rows show, from a 480 px card; a narrow card shows three. */
export const SHORT_LIST_COLUMNS = 5;

/** A cell's class by its column and index: an id or an amount on one line, a later text cut. */
const cellClass = (column: ChartColumn, i: number) =>
  [
    i >= 3 ? "hidden @lg:table-cell" : "",
    "pe-3 last:pe-0",
    column.type === "number" || column.type === "money"
      ? "text-end"
      : "text-start",
    column.type === "text" && i > 0
      ? "w-full max-w-0 truncate"
      : "whitespace-nowrap",
  ].join(" ");

/**
 * The first rows of a table as a small table with column headers (czjw.197, D7): the table's first
 * columns in its own order, three in a narrow card and five from a 480 px card. An id or an amount
 * stays on one line, and a text column after the first ends in an ellipsis. A column that holds
 * another column's currency is left out, because that amount already shows it.
 */
export function ShortListTable(props: { readonly data: ChartData }): ReactNode {
  const { data } = props;

  const all = data.x === undefined ? data.columns : [data.x, ...data.columns];

  const currencyKeys = new Set(all.map((column) => column.currencyKey));

  const columns = all
    .filter((column) => !currencyKeys.has(column.key))
    .slice(0, SHORT_LIST_COLUMNS);

  return (
    <table
      aria-label="First rows"
      className="w-full text-sm text-muted-foreground tabular-nums"
    >
      <thead>
        <tr className="border-b border-border">
          {columns.map((column, i) => (
            <th
              key={column.key}
              scope="col"
              className={`${cellClass(column, i)} pb-1.5 text-xs font-semibold`}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.slice(0, SHORT_LIST_ROWS).map((row, index) => (
          <tr key={index}>
            {columns.map((column, i) => {
              const value = formatChartValue(column, row[column.key] ?? null, {
                row,
              });

              return (
                <td
                  key={column.key}
                  className={`${cellClass(column, i)} pt-1.5`}
                >
                  {i === 0 ? (
                    <span className="block max-w-40 truncate">{value}</span>
                  ) : (
                    value
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
