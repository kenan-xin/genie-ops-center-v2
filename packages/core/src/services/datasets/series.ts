import { z } from "zod";

import {
  AppError,
  CORE_ERRORS,
  type AppErrorIssue,
} from "../../lib/errors/index.ts";
import type {
  DatasetDeclaration,
  DatasetFieldType,
  ModuleRequestContext,
} from "../../lib/module-contract/module.ts";
import { can } from "../authorization/index.ts";
import { reportingDate } from "../settings/reporting-date.ts";
import type { DatasetColumn, DatasetResult, DatasetValue } from "./index.ts";
import {
  DATASET_ROW_CAP,
  type DatasetQuery,
  type DatasetRange,
  datasetQuerySchema,
  fieldIssues,
  schemaIssues,
} from "./query.ts";
import { findDataset } from "./registry.ts";
import {
  DATASET_TIME_LIMIT_MS,
  datasetSource,
  runDatasetQuery,
} from "./run-query.ts";

export type DatasetSeries = {
  readonly name: string;
  readonly dataset: string;
  readonly query: DatasetQuery;
};

export type DatasetSeriesInput = { readonly series: readonly DatasetSeries[] };

export type DatasetSeriesResult = {
  readonly asOf: string;
  readonly readAt: string;
  /** Named "x". */
  readonly x: DatasetColumn;
  readonly series: readonly {
    readonly name: string;
    readonly dataset: string;
    readonly column: DatasetColumn;
  }[];
  /** `{ x, <series name>: value or null }` for every x value of any series. */
  readonly rows: readonly Readonly<Record<string, DatasetValue>>[];
  readonly truncated: boolean;
};

type SeriesEntry = DatasetSeries & {
  readonly fields: DatasetDeclaration["fields"];
};

const seriesInputSchema = z.strictObject({
  series: z
    .array(
      z.strictObject({
        name: z.string(),
        dataset: z.string(),
        query: datasetQuerySchema,
      })
    )
    .min(1)
    .max(10),
});

type XGrouping =
  | { readonly kind: "field"; readonly type: DatasetFieldType | undefined }
  | { readonly kind: "bucket"; readonly bucket: "month" | "week" }
  | { readonly kind: "ranges"; readonly ranges: readonly DatasetRange[] };

function sameRanges(
  left: readonly DatasetRange[],
  right: readonly DatasetRange[]
): boolean {
  return (
    left.length === right.length &&
    left.every((range, index) => {
      const other = right[index];

      return (
        other !== undefined &&
        range.label === other.label &&
        range.min === other.min &&
        range.max === other.max
      );
    })
  );
}

/** How one series groups x, from the single group its shape rule allows. */
function xGroupingOf(entry: SeriesEntry): XGrouping {
  const group = entry.query.groupBy?.[0];

  if (group !== undefined && "bucket" in group) {
    return { kind: "bucket", bucket: group.bucket };
  }

  if (group !== undefined && "ranges" in group) {
    return { kind: "ranges", ranges: group.ranges };
  }

  return {
    kind: "field",
    type: group === undefined ? undefined : entry.fields[group.field]?.type,
  };
}

function sameX(left: XGrouping, right: XGrouping): boolean {
  if (left.kind === "field") {
    return right.kind === "field" && left.type === right.type;
  }

  if (left.kind === "bucket") {
    return right.kind === "bucket" && left.bucket === right.bucket;
  }

  return right.kind === "ranges" && sameRanges(left.ranges, right.ranges);
}

/**
 * Every way the series do not share one x value and one query shape (Spec 7 R-7), as issues
 * with dotted paths. Empty means the series can be joined.
 */
export function seriesIssues(
  series: readonly SeriesEntry[]
): readonly AppErrorIssue[] {
  if (series.length === 0) {
    return [{ path: "series", message: "A series query needs one series." }];
  }

  const issues: AppErrorIssue[] = [];
  const names = new Set<string>();

  series.forEach((entry, index) => {
    const path = `series.${index}.name`;

    if (entry.name.trim() === "") {
      issues.push({ path, message: "A series needs a name." });
    } else if (entry.name === "x") {
      issues.push({
        path,
        message: 'The series name "x" is reserved for the shared x column.',
      });
    } else if (names.has(entry.name)) {
      issues.push({
        path,
        message: `Series name "${entry.name}" is used twice.`,
      });
    }

    names.add(entry.name);
  });

  const joinable: { readonly entry: SeriesEntry; readonly index: number }[] =
    [];

  series.forEach((entry, index) => {
    const {
      select,
      groupBy = [],
      aggregates = [],
      orderBy,
      limit,
    } = entry.query;

    if (
      groupBy.length !== 1 ||
      aggregates.length !== 1 ||
      select !== undefined ||
      orderBy !== undefined ||
      limit !== undefined
    ) {
      issues.push({
        path: `series.${index}.query`,
        message: `Series "${entry.name}" runs one group and one aggregate, with no select, orderBy or limit.`,
      });
    } else {
      joinable.push({ entry, index });
    }
  });

  const reference = joinable[0];

  if (reference !== undefined) {
    const wanted = xGroupingOf(reference.entry);

    joinable.slice(1).forEach(({ entry, index }) => {
      if (!sameX(wanted, xGroupingOf(entry))) {
        issues.push({
          path: `series.${index}.query.groupBy.0`,
          message: `Series "${entry.name}" must group x the same way as series "${reference.entry.name}".`,
        });
      }
    });
  }

  series.forEach((entry, index) => {
    issues.push(
      ...fieldIssues(entry.fields, entry.query, `series.${index}.query`)
    );
  });

  return issues;
}

export async function queryDatasetSeries(
  ctx: ModuleRequestContext,
  input: DatasetSeriesInput
): Promise<DatasetSeriesResult> {
  const entries = Array.isArray(input.series) ? input.series : [];

  const found = await Promise.all(
    entries.map((entry) => findDataset(ctx, entry?.dataset ?? ""))
  );

  if (found.some((one) => one === undefined)) {
    throw new AppError(CORE_ERRORS["not-found"]);
  }

  const allowed = await Promise.all(
    found.map((one) =>
      one === undefined ? false : can(ctx.caller, one.declaration.permission)
    )
  );

  if (allowed.includes(false)) throw new AppError(CORE_ERRORS.forbidden);

  const parsed = seriesInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new AppError(CORE_ERRORS["dataset-query-invalid"], {
      issues: schemaIssues(parsed.error),
    });
  }

  const resolved = parsed.data.series.map((series, index) => {
    const one = found[index];

    if (one === undefined) throw new AppError(CORE_ERRORS["not-found"]);

    return { series, declaration: one.declaration };
  });

  const issues = seriesIssues(
    resolved.map(({ series, declaration }) => ({
      ...series,
      fields: declaration.fields,
    }))
  );

  if (issues.length > 0) {
    throw new AppError(CORE_ERRORS["dataset-query-invalid"], { issues });
  }

  const asOf = await reportingDate(ctx.tenant);
  const readAt = new Date().toISOString();
  const runs: SeriesRun[] = [];
  // The series share one time limit (R-8): each run gets what remains of it.
  const deadline = performance.now() + DATASET_TIME_LIMIT_MS;

  // oxlint-disable no-await-in-loop -- the series run in order, one read at a time.
  for (const { series, declaration } of resolved) {
    const source = await datasetSource(ctx, declaration, asOf);

    runs.push({
      series,
      result: await runDatasetQuery(
        ctx.tenant,
        declaration,
        source,
        series.query,
        deadline - performance.now()
      ),
    });
  }
  // oxlint-enable no-await-in-loop

  return joinSeries(asOf, readAt, runs);
}

type SeriesRun = {
  readonly series: DatasetSeries;
  readonly result: Pick<DatasetResult, "columns" | "rows" | "truncated">;
};

function columnsOf(run: SeriesRun) {
  const [x, value] = run.result.columns;

  if (x === undefined || value === undefined) {
    throw new Error(
      `Dataset "${run.series.dataset}" did not answer one group and one aggregate.`
    );
  }

  return { x, value };
}

function compareX(
  left: DatasetValue,
  right: DatasetValue,
  x: DatasetColumn,
  rangeOrder: ReadonlyMap<string, number>
): number {
  if (left === null) return right === null ? 0 : 1;

  if (right === null) return -1;

  if (x.bucket === "ranges") {
    return (
      (rangeOrder.get(String(left)) ?? 0) - (rangeOrder.get(String(right)) ?? 0)
    );
  }

  if (x.type === "number" || x.type === "money" || x.type === "boolean") {
    return Number(left) - Number(right);
  }

  const a = String(left);
  const b = String(right);

  return a < b ? -1 : a > b ? 1 : 0;
}

function joinSeries(
  asOf: string,
  readAt: string,
  runs: readonly SeriesRun[]
): DatasetSeriesResult {
  const columns = runs.map((run) => ({ ...run, column: columnsOf(run) }));
  const first = columns[0];

  if (first === undefined) {
    throw new Error("A series query needs one series.");
  }

  const x: DatasetColumn = { ...first.column.x, name: "x" };
  const rangeOrder = new Map<string, number>();

  if (x.bucket === "ranges") {
    const group = first.series.query.groupBy?.[0];

    if (group !== undefined && "ranges" in group) {
      group.ranges.forEach((range, index) =>
        rangeOrder.set(range.label, index)
      );
    }
  }

  const seen = new Set<DatasetValue>();
  const xValues: DatasetValue[] = [];

  for (const { result, column } of columns) {
    for (const row of result.rows) {
      const value = row[column.x.name] ?? null;

      if (!seen.has(value)) {
        seen.add(value);
        xValues.push(value);
      }
    }
  }

  const sorted = xValues.toSorted((left, right) =>
    compareX(left, right, x, rangeOrder)
  );

  const ordered = sorted.slice(0, DATASET_ROW_CAP);

  const points = columns.map(({ series, result, column }) => ({
    name: series.name,
    values: new Map(
      result.rows.map((row): readonly [DatasetValue, DatasetValue] => [
        row[column.x.name] ?? null,
        row[column.value.name] ?? null,
      ])
    ),
  }));

  return {
    asOf,
    readAt,
    x,
    series: columns.map(({ series, column }) => ({
      name: series.name,
      dataset: series.dataset,
      column: column.value,
    })),
    rows: ordered.map((value) =>
      Object.fromEntries([
        ["x", value],
        ...points.map(
          (point) => [point.name, point.values.get(value) ?? null] as const
        ),
      ])
    ),
    truncated:
      sorted.length > ordered.length ||
      runs.some(({ result }) => result.truncated),
  };
}
