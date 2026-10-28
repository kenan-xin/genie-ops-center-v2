import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type {
  DatasetDeclaration,
  DatasetFieldType,
  ModuleRequestContext,
} from "../../lib/module-contract/module.ts";
import { can } from "../authorization/index.ts";
import { reportingDate } from "../settings/reporting-date.ts";
import { type DatasetQuery, checkDatasetQuery } from "./query.ts";
import { findDataset } from "./registry.ts";
import { datasetSource, runDatasetQuery } from "./run-query.ts";

export { DATASET_TIME_LIMIT_MS } from "./run-query.ts";

export { findDataset } from "./registry.ts";

export type DatasetValue = string | number | boolean | null;

export type DatasetColumn = {
  readonly name: string;
  readonly type: DatasetFieldType;
  readonly bucket?: "month" | "week" | "ranges";
  /** Set on a money aggregate when every row that it covers holds one currency. */
  readonly currency?: string;
};

export type DatasetResult = {
  readonly dataset: string;
  readonly asOf: string;
  /** The ISO instant of the read, for a chart caption (R-16). */
  readonly readAt: string;
  readonly columns: readonly DatasetColumn[];
  readonly rows: readonly Readonly<Record<string, DatasetValue>>[];
  /** More rows matched than the result holds. */
  readonly truncated: boolean;
};

export type DatasetSummary = Omit<DatasetDeclaration, "source">;

export { type RecordRoute, recordRoute } from "./record-route.ts";

export {
  type DatasetSeries,
  type DatasetSeriesInput,
  type DatasetSeriesResult,
  queryDatasetSeries,
  seriesIssues,
} from "./series.ts";

/** The datasets of enabled modules whose permission the caller holds, sorted by name (R-5). */
export async function listDatasets(
  ctx: ModuleRequestContext
): Promise<readonly DatasetSummary[]> {
  const visible = await Promise.all(
    ctx.tenant.datasets
      .all()
      .map(async ({ moduleId, declaration }) =>
        (await ctx.tenant.entitlements.isEnabled(moduleId)) &&
        (await can(ctx.caller, declaration.permission))
          ? declaration
          : undefined
      )
  );

  return visible
    .filter((declaration) => declaration !== undefined)
    .map(({ source: _source, ...summary }) => summary)
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

/**
 * One generic query over a dataset (DEC-54, R-6 to R-9): the permission first, then the shape
 * and the declared fields, then the module's `source()` as of the reporting date.
 */
export async function queryDataset(
  ctx: ModuleRequestContext,
  input: { readonly dataset: string; readonly query: DatasetQuery }
): Promise<DatasetResult> {
  const found = await findDataset(ctx, input.dataset);

  if (found === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  const { declaration } = found;

  if (!(await can(ctx.caller, declaration.permission))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  const { query, issues } = checkDatasetQuery(declaration.fields, input.query);

  if (query === undefined || issues.length > 0) {
    throw new AppError(CORE_ERRORS["dataset-query-invalid"], { issues });
  }

  const asOf = await reportingDate(ctx.tenant);
  const readAt = new Date().toISOString();
  const source = await datasetSource(ctx, declaration, asOf);

  return {
    dataset: declaration.name,
    asOf,
    readAt,
    ...(await runDatasetQuery(ctx.tenant, declaration, source, query)),
  };
}
