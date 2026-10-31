import {
  type ChartColumn,
  type ChartData,
  formatChartValue,
} from "@genie/ui/chart-data";

/** One native PowerPoint chart: the series pptxgenjs takes and the number format of its values. */
export type PptxChart = {
  readonly type: "bar" | "line" | "area" | "doughnut";
  readonly series: readonly {
    readonly name: string;
    readonly labels: readonly string[];
    readonly values: readonly (number | null)[];
  }[];
  readonly formatCode: string;
};

const TYPES = {
  bar: "bar",
  line: "line",
  area: "area",
  donut: "doughnut",
} as const;

/** The minor unit digits of a currency, as `formatChartValue` reads them (2 for SGD). */
function digitsOf(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    // A code that Intl refuses: `formatChartValue` reads it in hundredths too.
    return 2;
  }
}

const digitsOfColumn = (column: ChartColumn) =>
  column.type === "money" && column.currency !== undefined
    ? digitsOf(column.currency)
    : 0;

/**
 * The native chart of one bar, line, area or donut (R-55, D8). Labels are the screen's text of
 * each x value; a money value turns from minor units into its currency, so PowerPoint draws the
 * amount the screen shows. A missing value stays null, a gap and never 0 (R-7). A KPI and a table
 * have no native chart: the export writes them as text and as a table.
 */
export function pptxChartOf(data: ChartData): PptxChart {
  const { x } = data;

  if (data.kind === "kpi" || data.kind === "table" || x === undefined) {
    throw new Error(`A ${data.kind} chart has no native PowerPoint chart.`);
  }

  const labels = data.rows.map((row) =>
    formatChartValue(x, row[x.key] ?? null)
  );

  const digits = Math.max(0, ...data.columns.map(digitsOfColumn));

  return {
    type: TYPES[data.kind],
    series: data.columns.map((column) => {
      const divisor = 10 ** digitsOfColumn(column);

      return {
        name: column.label,
        labels,
        values: data.rows.map((row) => {
          const value = row[column.key] ?? null;

          return value === null ? null : Number(value) / divisor;
        }),
      };
    }),
    formatCode: digits > 0 ? `#,##0.${"0".repeat(digits)}` : "#,##0",
  };
}
