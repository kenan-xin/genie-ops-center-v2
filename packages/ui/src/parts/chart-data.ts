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
  /** Table only: the page each row opens, by row index, or null. */
  readonly recordPaths?: readonly (string | null)[];
  readonly datasets: readonly string[];
  /** The datasets by human title, for the caption (6.1); a chart stored without them shows `datasets`. */
  readonly sources?: readonly string[];
  /** KPI only: the figure of the prior period, for the change line, for example "September". */
  readonly change?: { readonly previous: number; readonly label: string };
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
  compact: boolean,
  bare: boolean
): string {
  try {
    // The standard formatter knows the minor unit digits; a compact one reports 0.
    const digits =
      new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;

    if (bare) {
      return new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(minorUnits / 10 ** digits);
    }

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
  options: {
    readonly row?: ChartRow;
    readonly compact?: boolean;
    /** Money of a column's one currency without its code, where the currency shows once (5.5). */
    readonly bare?: boolean;
  } = {}
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
    return formatMoney(
      Number(value),
      String(currency),
      compact,
      options.bare === true && column.currency !== undefined
    );
  }

  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 2,
    notation: compact ? "compact" : "standard",
  }).format(Number(value));
}

/** An instant as "27 Oct 2026, 09:06" in the tenant zone. */
export function formatReadTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(instant));
}

/**
 * "Source: <sources> · Read <time>", plus the row cap when the read was cut (R-16). `source` drops
 * the read time, where the page names it once (6.1).
 */
export function chartCaption(
  data: Pick<
    ChartData,
    "datasets" | "sources" | "readAt" | "truncated" | "rows"
  >,
  timeZone: string,
  form: "full" | "source" = "full"
): string {
  const source = `Source: ${(data.sources ?? data.datasets).join(", ")}`;

  const caption =
    form === "source"
      ? source
      : `${source} · Read ${formatReadTime(data.readAt, timeZone)}`;

  return data.truncated
    ? `${caption} · First ${data.rows.length.toLocaleString(LOCALE)} rows`
    : caption;
}

export type KpiChange = {
  readonly direction: "up" | "down" | "flat";
  readonly text: string;
};

/**
 * A KPI against its prior period, as "+4.3% on September" (prototype `deltaLine`). A rise from 0
 * has no percentage, and a missing current figure has no line.
 */
export function kpiChange(
  current: number | null,
  change: NonNullable<ChartData["change"]>
): KpiChange | null {
  if (current === null) return null;

  const { previous, label } = change;

  if (current === previous) {
    return { direction: "flat", text: `No change on ${label}` };
  }

  const direction = current > previous ? "up" : "down";

  if (previous === 0) {
    return {
      direction,
      text: `${direction === "up" ? "Up" : "Down"} from 0 on ${label}`,
    };
  }

  const percent = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 1,
  }).format(Math.abs(((current - previous) / Math.abs(previous)) * 100));

  return {
    direction,
    text: `${direction === "up" ? "+" : "−"}${percent}% on ${label}`,
  };
}

/**
 * The chart's values as labelled text rows, for Copy and Download (AG21): the x column first, then
 * each column, every value as the chart shows it. Money of a column's one currency shows its code in
 * the header, not in each cell; money with a currency per row keeps the code in each cell.
 */
export type ChartTextRows = {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

export function chartRows(
  data: Pick<ChartData, "x" | "columns" | "rows">
): ChartTextRows {
  const columns =
    data.x === undefined ? data.columns : [data.x, ...data.columns];

  return {
    // A column of one currency drops the code from each amount, so the header names it once.
    header: columns.map((column) =>
      column.type === "money" && column.currency !== undefined
        ? `${column.label} (${column.currency})`
        : column.label
    ),
    rows: data.rows.map((row) =>
      columns.map((column) =>
        formatChartValue(column, row[column.key] ?? null, { row, bare: true })
      )
    ),
  };
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
