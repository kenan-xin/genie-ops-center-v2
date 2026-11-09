import {
  AppError,
  type DatasetFieldType,
  type DatasetFilter,
  listDatasets,
  type ModuleRequestContext,
  type PanelConfig,
  type TableSeries,
} from "@genie/core";

import type { StoredPanel } from "../../config.ts";
import type {
  DashboardFilters,
  DateRangeFilter,
  FieldFilter,
  FilterField,
} from "../../contract.ts";
import { ANALYTICS_ERRORS } from "../../errors.ts";

/** What a dashboard filter needs to know of one dataset: where its dates are, and its fields. */
export type DatasetFacts = {
  readonly timeField: string;
  readonly fields: ReadonlyMap<
    string,
    { readonly type: DatasetFieldType; readonly label: string }
  >;
};

export type FieldFilterKind = FieldFilter["kind"];

/** The filter kinds a field of this type takes, the default first (R-49, D3). */
export function filterKindsOf(
  type: DatasetFieldType
): readonly FieldFilterKind[] {
  switch (type) {
    case "text":
      return ["multi-select", "select"];
    case "boolean":
      return ["toggle"];
    default:
      return [];
  }
}

/** Whether the dataset declares the filter's field with a type that takes its kind. */
function fits(facts: DatasetFacts | undefined, filter: FieldFilter): boolean {
  const type = facts?.fields.get(filter.field)?.type;

  return type !== undefined && filterKindsOf(type).includes(filter.kind);
}

/** The query filter of one field filter; one with no value, or a toggle off, filters nothing (P15-4). */
function clauseOf(filter: FieldFilter): DatasetFilter | undefined {
  const { field } = filter;

  switch (filter.kind) {
    case "select":
      return filter.value === null
        ? undefined
        : { field, op: "eq", value: filter.value };
    case "multi-select":
      return filter.values.length === 0
        ? undefined
        : { field, op: "in", values: filter.values };
    case "toggle":
      return filter.value ? { field, op: "eq", value: true } : undefined;
  }
}

/**
 * The filters a dashboard adds to a read of one dataset: the date bounds on its time field, and
 * each field filter whose field the dataset declares with a fitting type, so a dataset that lacks
 * the field stays unfiltered (Review Focus 5).
 */
export function datasetFilters(
  facts: DatasetFacts | undefined,
  fields: readonly FieldFilter[],
  bounds: { readonly from: string; readonly to: string } | null
): DatasetFilter[] {
  if (facts === undefined) return [];

  const added: DatasetFilter[] =
    bounds === null
      ? []
      : [{ field: facts.timeField, op: "between", ...bounds }];

  for (const filter of fields) {
    const clause = fits(facts, filter) ? clauseOf(filter) : undefined;

    if (clause !== undefined) added.push(clause);
  }

  return added;
}

/**
 * Refuses filters from the browser whose field no dataset the caller reads declares with a type
 * that takes the filter's kind (P15-5). Runs before any read of those filters.
 */
export function assertFiltersFit(
  filters: DashboardFilters,
  datasets: ReadonlyMap<string, DatasetFacts>
): void {
  const issues = filters.fields.flatMap((filter, index) =>
    [...datasets.values()].some((facts) => fits(facts, filter))
      ? []
      : [
          {
            path: `filters.fields.${index}.field`,
            message: `No data you can read has the field ${filter.field} for this filter.`,
          },
        ]
  );

  if (issues.length > 0) {
    throw new AppError(ANALYTICS_ERRORS["change-invalid"], { issues });
  }
}

/** The months each preset starts before the reporting month; `this-year` starts in January. */
const MONTHS_BACK = {
  "this-month": 0,
  "last-3-months": 2,
  "last-6-months": 5,
} as const;

/** The first day of the month `back` months before the month of `date`, as `YYYY-MM-DD`. */
function monthStart(date: string, back: number): string {
  const [year = 0, month = 1] = date.split("-").map(Number);
  const index = year * 12 + (month - 1) - back;
  const startMonth = String((index % 12) + 1).padStart(2, "0");

  return `${Math.floor(index / 12)}-${startMonth}-01`;
}

/**
 * The inclusive dates a range covers, relative to the reporting date (R-9, D3). `all` covers every
 * date, so it answers null and adds no filter.
 */
export function dateBounds(
  range: DateRangeFilter,
  reportingDate: string
): { readonly from: string; readonly to: string } | null {
  if (!("preset" in range)) return { from: range.from, to: range.to };

  switch (range.preset) {
    case "all":
      return null;
    case "this-year":
      return { from: `${reportingDate.slice(0, 4)}-01-01`, to: reportingDate };
    default:
      return {
        from: monthStart(reportingDate, MONTHS_BACK[range.preset]),
        to: reportingDate,
      };
  }
}

const DAY_MS = 86_400_000;

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

const timeOf = (date: string) => Date.parse(`${date}T00:00:00Z`);

const monthName = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: "UTC",
});

/** The same day `back` months earlier, clamped to that month's last day (31 May -> 30 Apr). */
function monthsBefore(date: string, back: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  // Day 0 of the next month is the last day of the target month.
  const lastDay = new Date(Date.UTC(year, month - back, 0)).getUTCDate();

  return isoDay(Date.UTC(year, month - 1 - back, Math.min(day, lastDay)));
}

/**
 * The period a KPI compares with (prototype `deltaLine`): the same days of the prior month, the
 * months or the year before a preset, or the same day count before a custom range. `all` has no
 * prior period, so it answers null.
 */
export function priorBounds(
  range: DateRangeFilter,
  reportingDate: string
): {
  readonly from: string;
  readonly to: string;
  readonly label: string;
} | null {
  if (!("preset" in range)) {
    const days = (timeOf(range.to) - timeOf(range.from)) / DAY_MS + 1;
    const end = timeOf(range.from) - DAY_MS;

    return {
      from: isoDay(end - (days - 1) * DAY_MS),
      to: isoDay(end),
      label: days === 1 ? "the day before" : `the ${days} days before`,
    };
  }

  switch (range.preset) {
    case "all":
      return null;

    case "this-year": {
      const year = Number(reportingDate.slice(0, 4)) - 1;

      return {
        from: `${year}-01-01`,
        to: monthsBefore(reportingDate, 12),
        label: String(year),
      };
    }

    case "this-month": {
      const from = monthStart(reportingDate, 1);

      return {
        from,
        to: monthsBefore(reportingDate, 1),
        label: monthName.format(timeOf(from)),
      };
    }

    default: {
      const months = MONTHS_BACK[range.preset] + 1;

      return {
        from: monthStart(reportingDate, 2 * months - 1),
        to: monthsBefore(reportingDate, months),
        label: `the ${months} months before`,
      };
    }
  }
}

/**
 * The panel with the dashboard filters added to each series' own filters (R-49, D3), through
 * `datasetFilters`. A panel's own range replaces the dashboard range (P15-10).
 */
export function effectivePanel(
  panel: PanelConfig,
  filters: DashboardFilters,
  datasets: ReadonlyMap<string, DatasetFacts>,
  reportingDate: string,
  ownRange?: DateRangeFilter
): PanelConfig {
  const bounds = dateBounds(ownRange ?? filters.dateRange, reportingDate);

  const filtered = <S extends TableSeries>(entry: S): S => {
    const added = datasetFilters(
      datasets.get(entry.dataset),
      filters.fields,
      bounds
    );

    if (added.length === 0) return entry;

    const { query } = entry;

    return {
      ...entry,
      query: { ...query, filters: [...(query.filters ?? []), ...added] },
    };
  };

  // One case per type, so each keeps its own series tuple.
  switch (panel.type) {
    case "kpi":
      return { ...panel, series: [filtered(panel.series[0])] };
    case "donut":
      return { ...panel, series: [filtered(panel.series[0])] };
    case "table":
      return { ...panel, series: [filtered(panel.series[0])] };
    default:
      return { ...panel, series: panel.series.map(filtered) };
  }
}

/** The time field and the fields of each dataset the caller can read (DEC-54). */
export async function datasetFacts(
  ctx: ModuleRequestContext
): Promise<ReadonlyMap<string, DatasetFacts>> {
  return new Map(
    (await listDatasets(ctx)).map(({ name, timeField, fields }) => [
      name,
      {
        timeField,
        fields: new Map(
          Object.entries(fields).map(([field, { type, label }]) => [
            field,
            { type, label: label ?? field },
          ])
        ),
      },
    ])
  );
}

/**
 * Every text and boolean field of the panel datasets the caller can read, sorted by label, with
 * the datasets that declare it. A field one dataset declares as text and another as boolean keeps
 * the kind of the first panel that names it.
 */
export async function filterFieldsOf(
  ctx: ModuleRequestContext,
  panels: readonly StoredPanel[]
): Promise<FilterField[]> {
  const facts = await datasetFacts(ctx);
  const found = new Map<string, FilterField>();

  const names = new Set(
    panels.flatMap(({ config }) => config.series.map(({ dataset }) => dataset))
  );

  for (const dataset of names) {
    for (const [field, { type, label }] of facts.get(dataset)?.fields ?? []) {
      const [kind] = filterKindsOf(type);
      const entry = found.get(field);

      if (kind === undefined) continue;

      if (entry === undefined) {
        found.set(field, { field, label, kind, datasets: [dataset] });
      } else if (entry.kind === kind) {
        entry.datasets.push(dataset);
      }
    }
  }

  return [...found.values()].toSorted((left, right) =>
    left.label.localeCompare(right.label)
  );
}
