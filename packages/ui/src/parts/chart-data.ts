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

const LOCALE = "en-GB";

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthFormat = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatMoney(
  minorUnits: number,
  currency: string,
  compact: boolean
): string {
  try {
    // The standard formatter knows the minor unit digits; a compact one reports 0.
    const digits =
      new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;

    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
    }).format(minorUnits / 10 ** digits);
  } catch {
    // A code that Intl refuses still shows its amount, never a crash.
    return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minorUnits / 100)} ${currency}`;
  }
}

function formatDate(column: ChartColumn, value: string): string {
  // A date is a calendar day, so it is read and shown in UTC and never moves a day.
  const day = new Date(`${value}T00:00:00Z`);

  if (column.bucket === "month") {
    return monthFormat.format(day);
  }

  return column.bucket === "week"
    ? `Week of ${dayFormat.format(day)}`
    : dayFormat.format(day);
}

/** The text of one value: money in its currency, a date as a day or a bucket, a gap as "". */
export function formatChartValue(
  column: ChartColumn,
  value: ChartValue,
  options: { readonly row?: ChartRow; readonly compact?: boolean } = {}
): string {
  if (value === null) {
    return "";
  }

  if (column.type === "boolean") {
    return value === true ? "Yes" : "No";
  }

  if (column.type === "text") {
    return String(value);
  }

  if (column.type === "date") {
    return formatDate(column, String(value));
  }

  const compact = options.compact ?? false;

  const currency =
    column.currency ??
    (column.currencyKey === undefined
      ? null
      : (options.row?.[column.currencyKey] ?? null));

  if (column.type === "money" && currency !== null) {
    return formatMoney(Number(value), String(currency), compact);
  }

  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 2,
    notation: compact ? "compact" : "standard",
  }).format(Number(value));
}

/** "Source: <datasets> · Read <time>", plus the row cap when the read was cut (R-16). */
export function chartCaption(
  data: Pick<ChartData, "datasets" | "readAt" | "truncated" | "rows">,
  timeZone: string
): string {
  const read = new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(data.readAt));

  const caption = `Source: ${data.datasets.join(", ")} · Read ${read}`;

  return data.truncated
    ? `${caption} · First ${data.rows.length.toLocaleString(LOCALE)} rows`
    : caption;
}

/** No figure to draw: no rows, or only missing values, or a donut with no part above 0. */
export function isChartEmpty(
  data: Pick<ChartData, "kind" | "columns" | "rows">
): boolean {
  if (data.kind === "table") {
    return data.rows.length === 0;
  }

  const values = data.rows.flatMap((row) =>
    data.columns.map((column) => row[column.key] ?? null)
  );

  return data.kind === "donut"
    ? !values.some((value) => Number(value) > 0)
    : values.every((value) => value === null);
}
