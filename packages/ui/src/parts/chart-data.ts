/**
 * The data one chart draws (Spec 7 R-16). Core's chart gate answers it, and the chart component
 * draws it. Every number in it came from a dataset query.
 */

export type ChartKind = "kpi" | "bar" | "line" | "area" | "donut" | "table";

export type ChartFieldType = "text" | "date" | "number" | "money" | "boolean";

export type ChartValue = string | number | boolean | null;

export type ChartRow = Readonly<Record<string, ChartValue>>;

export type ChartColumn = {
  /** The row key of this column. */
  readonly key: string;
  /** The legend, header and tooltip text. */
  readonly label: string;
  readonly type: ChartFieldType;
  readonly bucket?: "month" | "week" | "ranges";
  /** One currency covers every value of the column. */
  readonly currency?: string;
  /** Table only: the row key of each value's currency. */
  readonly currencyKey?: string;
};

export type ChartData = {
  readonly kind: ChartKind;
  readonly title: string;
  /** Bar, line and area: the x-axis. Donut: the part names. */
  readonly x?: ChartColumn;
  /** The series, the KPI or donut value, or every table column. */
  readonly columns: readonly ChartColumn[];
  readonly rows: readonly ChartRow[];
  readonly datasets: readonly string[];
  /** The ISO instant of the read. */
  readonly readAt: string;
  readonly truncated: boolean;
};
