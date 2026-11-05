import { formatChartValue, type ChartData } from "@genie/ui/chart-data";
import type { ReactNode } from "react";

/**
 * The short list of a list answer (R-44a): the chat shows the first rows and how many more, and
 * the full list opens as the table artifact. A large row count never renders in the chat.
 */
export const SHORT_LIST_ROWS = 5;

/** "7 more", or "995+ more" when the gate cut the read, because then the count is only a floor. */
export function moreText(hidden: number, truncated: boolean): string {
  return `${hidden.toLocaleString("en-GB")}${truncated ? "+" : ""} more`;
}

/** The first rows of a table, one line each, the values of its columns joined with " · ". */
export function ShortListRows(props: { readonly data: ChartData }): ReactNode {
  const { data } = props;

  const columns =
    data.x === undefined ? data.columns : [data.x, ...data.columns];

  return (
    <ul aria-label="First rows" className="grid gap-0.5 text-sm">
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
