import type { ChartColumn, ChartData, ChartRow } from "@genie/ui";
import { lowerCase, uniq, upperFirst } from "es-toolkit";

import {
  AppError,
  CORE_ERRORS,
  type AppErrorIssue,
} from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import {
  type DatasetColumn,
  type DatasetResult,
  listDatasets,
  queryDataset,
  queryDatasetSeries,
} from "../datasets/index.ts";
import {
  type CartesianSeries,
  checkPanelConfig,
  type PanelConfig,
  type TableSeries,
} from "./panel-config.ts";
import { dataIssues, queryRuleIssues } from "./rules.ts";

export type CheckedChart = {
  readonly config: PanelConfig;
  readonly data: ChartData;
};

const hidden = (name: string) =>
  `Dataset "${name}" does not exist, or you cannot read it.`;

function refuse(issues: readonly AppErrorIssue[]): never {
  throw new AppError(CORE_ERRORS["chart-invalid"], { issues });
}

/** "recordedOn" reads "Recorded on", and a money "amountCents" reads "Amount". */
function labelOf(column: DatasetColumn): string {
  const words = lowerCase(column.name);

  return upperFirst(
    column.type === "money" ? words.replace(/ cents$/, "") : words
  );
}

function chartColumn(
  column: DatasetColumn,
  key: string,
  label: string
): ChartColumn {
  const { name: _name, ...facts } = column;

  return { ...facts, key, label };
}

function columnNamed(result: DatasetResult, name: string): DatasetColumn {
  const column = result.columns.find((entry) => entry.name === name);

  // The query rules already made the field a group or an aggregate of this query.
  if (column === undefined) {
    throw new Error(`Dataset "${result.dataset}" did not answer "${name}".`);
  }

  return column;
}

/** One series against its dataset, with a refused query's issues under its own path. */
async function runOne(
  ctx: ModuleRequestContext,
  series: TableSeries
): Promise<DatasetResult> {
  return queryDataset(ctx, series).catch((cause: unknown) =>
    rethrow(cause, (path) => `series.0.query.${path}`, "series.0")
  );
}

/**
 * A dataset refusal thrown as a chart refusal, any other error unchanged. A `not-found` or
 * `forbidden` here is a race after the dataset check, so it gets the same hint. One series
 * answers under `series.0`, a series query under `series`.
 */
function rethrow(
  cause: unknown,
  queryPath: (path: string) => string,
  at: "series" | "series.0"
): never {
  if (!(cause instanceof AppError)) throw cause;

  switch (cause.code) {
    case "dataset-query-invalid":
      refuse(
        (cause.issues ?? []).map((issue) => ({
          path: queryPath(issue.path),
          message: issue.message,
        }))
      );
    case "dataset-mixed-currency":
      refuse([
        {
          path: at === "series" ? at : `${at}.query`,
          message: CORE_ERRORS["dataset-mixed-currency"].message,
        },
      ]);
    case "not-found":
    case "forbidden":
      refuse([
        {
          path: at === "series" ? at : `${at}.dataset`,
          message:
            "A dataset of this chart does not exist, or you cannot read it.",
        },
      ]);
    default:
      throw cause;
  }
}

async function cartesianData(
  ctx: ModuleRequestContext,
  series: readonly CartesianSeries[]
): Promise<Omit<ChartData, "kind" | "title" | "datasets">> {
  const [only] = series;

  if (only !== undefined && series.length === 1) {
    const result = await runOne(ctx, only);

    return {
      x: chartColumn(
        columnNamed(result, only.x),
        "x",
        labelOf(columnNamed(result, only.x))
      ),
      columns: [chartColumn(columnNamed(result, only.y), only.name, only.name)],
      rows: result.rows.map((row): ChartRow => ({
        x: row[only.x] ?? null,
        [only.name]: row[only.y] ?? null,
      })),
      readAt: result.readAt,
      truncated: result.truncated,
    };
  }

  const result = await queryDatasetSeries(ctx, {
    series: series.map(({ name, dataset, query }) => ({
      name,
      dataset,
      query,
    })),
  }).catch((cause: unknown) => rethrow(cause, (path) => path, "series"));

  return {
    x: chartColumn(
      result.x,
      "x",
      labelOf({ ...result.x, name: only?.x ?? result.x.name })
    ),
    columns: result.series.map((entry) =>
      chartColumn(entry.column, entry.name, entry.name)
    ),
    rows: result.rows,
    readAt: result.readAt,
    truncated: result.truncated,
  };
}

async function chartData(
  ctx: ModuleRequestContext,
  config: PanelConfig,
  currencyFields: ReadonlyMap<string, string | undefined>
): Promise<ChartData> {
  const shared = {
    kind: config.type,
    title: config.title,
    datasets: uniq(config.series.map((series) => series.dataset)),
  };

  switch (config.type) {
    case "bar":
    case "line":
    case "area":
      return {
        ...shared,
        ...(await cartesianData(ctx, config.series)),
      };

    case "donut": {
      const [series] = config.series;
      const result = await runOne(ctx, series);
      const category = columnNamed(result, series.category);

      return {
        ...shared,
        x: chartColumn(category, "x", labelOf(category)),
        columns: [
          chartColumn(
            columnNamed(result, series.value),
            series.name,
            series.name
          ),
        ],
        rows: result.rows.map((row): ChartRow => ({
          x: row[series.category] ?? null,
          [series.name]: row[series.value] ?? null,
        })),
        readAt: result.readAt,
        truncated: result.truncated,
      };
    }

    case "kpi": {
      const [series] = config.series;
      const result = await runOne(ctx, series);

      return {
        ...shared,
        columns: [
          chartColumn(
            columnNamed(result, series.value),
            series.name,
            series.name
          ),
        ],
        rows: result.rows.map((row): ChartRow => ({
          [series.name]: row[series.value] ?? null,
        })),
        readAt: result.readAt,
        truncated: result.truncated,
      };
    }

    case "table": {
      const [series] = config.series;
      const result = await runOne(ctx, series);
      const currencyField = currencyFields.get(series.dataset);

      const currencyKey =
        currencyField !== undefined &&
        result.columns.some((column) => column.name === currencyField)
          ? currencyField
          : undefined;

      return {
        ...shared,
        columns: result.columns.map((column) => {
          const chart = chartColumn(column, column.name, labelOf(column));

          // A selected amount carries no currency; each row names its own.
          return column.type === "money" &&
            column.currency === undefined &&
            currencyKey !== undefined
            ? { ...chart, currencyKey }
            : chart;
        }),
        rows: result.rows,
        readAt: result.readAt,
        truncated: result.truncated,
      };
    }
  }
}

/**
 * The chart gate (Spec 7 R-15): the one check a chart passes before a save or a show. It parses
 * the panel config, runs every series through the dataset service under the caller's permissions,
 * and checks the configured fields and the chart-type rules against the answered columns. Every
 * refusal throws `chart-invalid` with one fix hint per key and answers no data, so a caller cannot
 * save a refused config. An empty result passes.
 */
export async function checkChart(
  ctx: ModuleRequestContext,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw config of an agent or a screen; the gate is its parser
  input: unknown
): Promise<CheckedChart> {
  const parsed = checkPanelConfig(input);

  if (parsed.config === undefined) refuse(parsed.issues);

  const { config } = parsed;

  const readable = new Map(
    (await listDatasets(ctx)).map((dataset) => [
      dataset.name,
      dataset.currencyField,
    ])
  );

  const issues: AppErrorIssue[] = config.series.flatMap((series, index) =>
    readable.has(series.dataset)
      ? []
      : [{ path: `series.${index}.dataset`, message: hidden(series.dataset) }]
  );

  issues.push(...queryRuleIssues(config));

  if (issues.length > 0) refuse(issues);

  const data = await chartData(ctx, config, readable);

  const answered = dataIssues(config, data);

  if (answered.length > 0) refuse(answered);

  return { config, data };
}
