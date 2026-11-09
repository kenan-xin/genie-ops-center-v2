import {
  AppError,
  checkChart,
  CORE_ERRORS,
  type ModuleRequestContext,
  queryDataset,
  reportingDate,
} from "@genie/core";
import type { ChartData } from "@genie/ui";

import type { DashboardFilters } from "../../contract.ts";
import {
  assertFiltersFit,
  datasetFacts,
  datasetFilters,
  dateBounds,
  effectivePanel,
  priorBounds,
} from "./filters.ts";
import { readOwnDashboard } from "./store.ts";

/** The most values the field filter offers. */
const FILTER_VALUE_LIMIT = 1000;

/**
 * One panel of the caller's own dashboard drawn under the dashboard filters: the given ones for
 * this read only, else the stored ones. The show path runs the chart gate as the caller, so a
 * panel whose dataset the caller can no longer read answers its refusal (R-15, R-49, D2).
 */
export async function panelData(
  ctx: ModuleRequestContext,
  input: {
    readonly id: string;
    readonly panelId: string;
    readonly filters?: DashboardFilters | undefined;
  }
): Promise<ChartData> {
  const record = await readOwnDashboard(ctx, input.id);
  const panel = record.config.panels.find(({ id }) => id === input.panelId);

  if (panel === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  const [datasets, date] = await Promise.all([
    datasetFacts(ctx),
    reportingDate(ctx.tenant),
  ]);

  if (input.filters !== undefined) assertFiltersFit(input.filters, datasets);

  const filters = input.filters ?? record.config.filters;
  const { ownRange } = panel;

  const data = (
    await checkChart(
      ctx,
      effectivePanel(panel.config, filters, datasets, date, ownRange)
    )
  ).data;

  const prior =
    panel.config.type === "kpi"
      ? priorBounds(ownRange ?? filters.dateRange, date)
      : null;

  if (prior === null) return data;

  const { label, ...range } = prior;

  // The change line is extra: a refused or empty prior read drops it, never the panel.
  const previous = await checkChart(
    ctx,
    effectivePanel(panel.config, filters, datasets, date, range)
  ).then(
    ({ data: before }) => priorKpiValue(data, before),
    (cause: unknown) => {
      if (cause instanceof AppError && cause.code === "chart-invalid") {
        return null;
      }

      throw cause;
    }
  );

  return previous === null ? data : { ...data, change: { previous, label } };
}

/**
 * The prior period's KPI figure, or null when it cannot be compared: an empty period, or money
 * in another currency than the current figure (one figure set per currency).
 */
export function priorKpiValue(
  current: ChartData,
  before: ChartData
): number | null {
  const [column] = before.columns;

  if (column?.currency !== current.columns[0]?.currency) return null;

  // A KPI value is a number or money; a sum over no rows answers null.
  const value = column === undefined ? null : before.rows[0]?.[column.key];

  return value === null || value === undefined ? null : Number(value);
}

/**
 * The values a filter on `field` offers: the distinct non-null values of the field in each panel
 * dataset that declares it as text, under the date range and every other field filter (P15-6),
 * sorted, at most 1,000 (D3). A boolean field offers none.
 */
export async function filterValues(
  ctx: ModuleRequestContext,
  input: {
    readonly id: string;
    readonly field: string;
    readonly filters?: DashboardFilters | undefined;
  }
): Promise<readonly string[]> {
  const record = await readOwnDashboard(ctx, input.id);

  const [facts, date] = await Promise.all([
    datasetFacts(ctx),
    reportingDate(ctx.tenant),
  ]);

  if (input.filters !== undefined) assertFiltersFit(input.filters, facts);

  const { field } = input;
  const filters = input.filters ?? record.config.filters;
  const bounds = dateBounds(filters.dateRange, date);
  const others = filters.fields.filter((filter) => filter.field !== field);

  const datasets = new Set(
    record.config.panels
      .flatMap(({ config }) => config.series.map((series) => series.dataset))
      .filter((name) => facts.get(name)?.fields.get(field)?.type === "text")
  );

  const results = await Promise.all(
    [...datasets].map((dataset) =>
      queryDataset(ctx, {
        dataset,
        query: {
          filters: datasetFilters(facts.get(dataset), others, bounds),
          groupBy: [{ field }],
          aggregates: [{ fn: "count", as: "rows" }],
          limit: FILTER_VALUE_LIMIT,
        },
      })
    )
  );

  const values = new Set(
    results
      // A text field answers a string or null.
      .flatMap(({ rows }) => rows.map((row) => row[field] ?? null))
      .filter((value) => value !== null)
      .map(String)
  );

  return [...values]
    .toSorted((left, right) => left.localeCompare(right))
    .slice(0, FILTER_VALUE_LIMIT);
}
