import {
  axisTickFormat,
  type ChartColumn,
  type ChartData,
  currencyDigits,
  formatChartValue,
  niceAxis,
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
  /** The screen's value axis in the plotted unit, the shared top of two comparison charts included (P14-45, C14-1); none for a donut. */
  readonly axis:
    | { readonly min: number; readonly max: number; readonly step: number }
    | undefined;
};

const TYPES = {
  bar: "bar",
  line: "line",
  area: "area",
  donut: "doughnut",
} as const;

const digitsOfColumn = (column: ChartColumn) =>
  column.type === "money" && column.currency !== undefined
    ? currencyDigits(column.currency)
    : 0;

/**
 * The native chart of one bar, line, area or donut (R-55, D8). Labels are the screen's text of
 * each x value; a money value turns from minor units into its currency, so PowerPoint draws the
 * amount the screen shows. A missing value stays null, a gap and never 0 (R-7). A KPI and a table
 * have no native chart: the export writes them as text and as a table. The value axis is the
 * screen's (`niceAxis`), over a shared `valueMax` in minor units as `comparisonMax` answers it.
 */
export function pptxChartOf(data: ChartData, valueMax?: number): PptxChart {
  const { x } = data;

  if (data.kind === "kpi" || data.kind === "table" || x === undefined) {
    throw new Error(`A ${data.kind} chart has no native PowerPoint chart.`);
  }

  // The screen's compact x labels, "May 26" (C14-3).
  const labels = data.rows.map((row) =>
    formatChartValue(x, row[x.key] ?? null, { compact: true })
  );

  const digits = Math.max(0, ...data.columns.map(digitsOfColumn));
  const scale = 10 ** digits;

  // One measure only (P14-45), so one divisor turns the screen's axis into the plotted unit.
  const axis =
    data.kind === "donut"
      ? undefined
      : niceAxis(
          valueMax === undefined
            ? data.rows.flatMap((row) =>
                data.columns.flatMap((column) => {
                  const value = row[column.key] ?? null;

                  return value === null ? [] : [Number(value)];
                })
              )
            : [valueMax]
        );

  const plotted =
    axis === undefined
      ? undefined
      : {
          min: axis.min / scale,
          max: axis.max / scale,
          step: axis.step / scale,
          ticks: axis.ticks.map((tick) => tick / scale),
        };

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
    // A donut has no value axis; its values keep their currency digits.
    formatCode:
      plotted === undefined
        ? digits > 0
          ? `#,##0.${"0".repeat(digits)}`
          : "#,##0"
        : axisTickFormat(plotted.ticks).code,
    axis:
      plotted === undefined
        ? undefined
        : { min: plotted.min, max: plotted.max, step: plotted.step },
  };
}
