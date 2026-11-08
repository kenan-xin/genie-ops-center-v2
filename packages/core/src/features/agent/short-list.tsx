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

/** Which amounts the rows show (czjw.118 item 11): "Amount: Total", "Amounts: Total, Paid", or none. */
export function amountNote(
  columns: readonly ChartColumn[]
): string | undefined {
  const labels = columns.flatMap((column) =>
    column.type === "money" ? [column.label] : []
  );

  if (labels.length === 0) return undefined;

  return `${labels.length === 1 ? "Amount" : "Amounts"}: ${labels.join(", ")}`;
}

/**
 * The first rows of a table, one line each, the values of its columns joined with " · ". A column
 * that holds another column's currency is left out, because that amount already shows it.
 */
export function ShortListRows(props: { readonly data: ChartData }): ReactNode {
  const { data } = props;

  const all = data.x === undefined ? data.columns : [data.x, ...data.columns];

  const currencyKeys = new Set(all.map((column) => column.currencyKey));

  const columns = all.filter((column) => !currencyKeys.has(column.key));

  return (
    <ul
      aria-label="First rows"
      className="grid gap-1.5 text-sm text-muted-foreground tabular-nums"
    >
      {data.rows.slice(0, SHORT_LIST_ROWS).map((row, index) => (
        <li key={index} className="truncate">
          {columns
            .map((column) =>
              formatChartValue(column, row[column.key] ?? null, { row })
            )
            .filter((value) => value !== "")
            .join(" · ")}
        </li>
      ))}
    </ul>
  );
}
