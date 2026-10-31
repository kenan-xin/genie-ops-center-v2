import {
  AppError,
  checkChart,
  CORE_ERRORS,
  type ModuleRequestContext,
  queryDataset,
  reportingDate,
} from "@genie/core";
import type { ChartData } from "@genie/ui";

import { datasetFacts, effectivePanel } from "./filters.ts";
import { readOwnDashboard } from "./store.ts";

/** The most values the field filter offers. */
const FILTER_VALUE_LIMIT = 1000;

/**
 * One panel of the caller's own dashboard drawn under the dashboard filters. The show path runs
 * the chart gate, so a panel whose dataset the caller can no longer read answers its refusal
 * (R-15, R-49, D2).
 */
export async function panelData(
  ctx: ModuleRequestContext,
  input: { readonly id: string; readonly panelId: string }
): Promise<ChartData> {
  const record = await readOwnDashboard(ctx, input.id);
  const panel = record.config.panels.find(({ id }) => id === input.panelId);

  if (panel === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  const [datasets, date] = await Promise.all([
    datasetFacts(ctx),
    reportingDate(ctx.tenant),
  ]);

  const effective = effectivePanel(
    panel.config,
    record.config.filters,
    datasets,
    date
  );

  return (await checkChart(ctx, effective)).data;
}

/**
 * The values the field filter offers: the distinct non-null values of the field in each panel
 * dataset that declares it as text, sorted, at most 1,000 (D3).
 */
export async function filterValues(
  ctx: ModuleRequestContext,
  input: { readonly id: string }
): Promise<readonly string[]> {
  const record = await readOwnDashboard(ctx, input.id);
  const { field } = record.config.filters;

  if (field === null) return [];

  const facts = await datasetFacts(ctx);

  const datasets = new Set(
    record.config.panels
      .flatMap(({ config }) => config.series.map((series) => series.dataset))
      .filter((name) => facts.get(name)?.textFields.has(field.field) === true)
  );

  const results = await Promise.all(
    [...datasets].map((dataset) =>
      queryDataset(ctx, {
        dataset,
        query: {
          groupBy: [{ field: field.field }],
          aggregates: [{ fn: "count", as: "rows" }],
          limit: FILTER_VALUE_LIMIT,
        },
      })
    )
  );

  const values = new Set(
    results
      // A text field answers a string or null.
      .flatMap(({ rows }) => rows.map((row) => row[field.field] ?? null))
      .filter((value) => value !== null)
      .map(String)
  );

  return [...values]
    .toSorted((left, right) => left.localeCompare(right))
    .slice(0, FILTER_VALUE_LIMIT);
}
