import {
  AppError,
  type DatasetFieldType,
  type DatasetFilter,
  type DatasetSummary,
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

/**
 * What a dashboard filter needs to know of one dataset: where its dates are, its record key and
 * row key, and its fields.
 */
export type DatasetFacts = {
  readonly timeField: string;
  readonly keys: ReadonlySet<string>;
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

/** A field named as an id: `id`, or a name that ends in `Id` (czjw.178). */
const namedAsId = (field: string) => field === "id" || field.endsWith("Id");

/** A label as filters compare it: trimmed and case-folded (czjw.178). */
const labelKey = (label: string) => label.trim().toLowerCase();

/**
 * The field of `facts` that a filter of `kind` on `field` reads, merged by label (czjw.178): the
 * field itself when the dataset declares it with a type that takes the kind, else the one field
 * with the same label (from the first dataset of `all` that declares `field`) and such a type,
 * never a record key, a row key or a field named as an id. Two such fields resolve to none.
 */
export function resolveField(
  facts: DatasetFacts | undefined,
  field: string,
  kind: FieldFilterKind,
  all: ReadonlyMap<string, DatasetFacts>
): string | undefined {
  if (facts === undefined) return undefined;

  const takes = (name: string) => {
    const type = facts.fields.get(name)?.type;

    return type !== undefined && filterKindsOf(type).includes(kind);
  };

  if (takes(field)) return field;

  const label = [...all.values()]
    .map((dataset) => dataset.fields.get(field)?.label)
    .find((found) => found !== undefined);

  if (label === undefined) return undefined;

  const matches = [...facts.fields].flatMap(([name, own]) =>
    labelKey(own.label) === labelKey(label) &&
    !facts.keys.has(name) &&
    !namedAsId(name) &&
    takes(name)
      ? [name]
      : []
  );

  return matches.length === 1 ? matches[0] : undefined;
}

/** The query filter of one field filter on `field`; one with no value, or a toggle off, filters nothing (P15-4). */
function clauseOf(
  filter: FieldFilter,
  field: string
): DatasetFilter | undefined {
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
 * each field filter on the field `resolveField` finds in the dataset: the filter's own field, or
 * the one field with its label. A dataset with neither stays unfiltered (Review Focus 5, czjw.178).
 */
export function datasetFilters(
  facts: DatasetFacts | undefined,
  fields: readonly FieldFilter[],
  bounds: { readonly from: string; readonly to: string } | null,
  all: ReadonlyMap<string, DatasetFacts>
): DatasetFilter[] {
  if (facts === undefined) return [];

  const added: DatasetFilter[] =
    bounds === null
      ? []
      : [{ field: facts.timeField, op: "between", ...bounds }];

  for (const filter of fields) {
    const field = resolveField(facts, filter.field, filter.kind, all);
    const clause = field === undefined ? undefined : clauseOf(filter, field);

    if (clause !== undefined) added.push(clause);
  }

  return added;
}

/**
 * Refuses filters from the browser that resolve in no dataset the caller reads (P15-5,
 * `resolveField`). Runs before any read of those filters.
 */
export function assertFiltersFit(
  filters: DashboardFilters,
  datasets: ReadonlyMap<string, DatasetFacts>
): void {
  const issues = filters.fields.flatMap((filter, index) =>
    [...datasets.values()].some(
      (facts) =>
        resolveField(facts, filter.field, filter.kind, datasets) !== undefined
    )
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
      bounds,
      datasets
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

/** The facts of each dataset by name. */
function factsOf(
  datasets: readonly DatasetSummary[]
): ReadonlyMap<string, DatasetFacts> {
  return new Map(
    datasets.map(({ name, timeField, recordKey, rowKeyField, fields }) => [
      name,
      {
        timeField,
        keys: new Set(
          rowKeyField === undefined
            ? [recordKey.field]
            : [recordKey.field, rowKeyField]
        ),
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

/** The time field, the keys and the fields of each dataset the caller can read (DEC-54). */
export async function datasetFacts(
  ctx: ModuleRequestContext
): Promise<ReadonlyMap<string, DatasetFacts>> {
  return factsOf(await listDatasets(ctx));
}

/** Every text and boolean field of the panel datasets the caller can read (R-49). */
export async function filterFieldsOf(
  ctx: ModuleRequestContext,
  panels: readonly StoredPanel[]
): Promise<FilterField[]> {
  const names = new Set(
    panels.flatMap(({ config }) => config.series.map(({ dataset }) => dataset))
  );

  return filterFieldsFrom(await listDatasets(ctx), [...names]);
}

/**
 * Every text and boolean field of the panel datasets, sorted by label, with every panel dataset
 * the field resolves in (R-49, `resolveField`). Add filter offers only a field a person filters by
 * (czjw.178): no record key or row key of a panel dataset, no field named as an id, and one field
 * per label (trimmed, case-folded), the first that the panels name. A field that is not offered
 * stays here, so a stored filter on it still reads.
 */
export function filterFieldsFrom(
  datasets: readonly DatasetSummary[],
  names: readonly string[]
): FilterField[] {
  const panelDatasets = names.flatMap((name) =>
    datasets.filter((dataset) => dataset.name === name)
  );

  const keys = new Set(
    panelDatasets.flatMap(({ recordKey, rowKeyField }) =>
      rowKeyField === undefined
        ? [recordKey.field]
        : [recordKey.field, rowKeyField]
    )
  );

  const facts = factsOf(datasets);
  const found = new Map<string, FilterField>();
  // The labels that an offered field holds, so each shows once in Add filter.
  const labels = new Set<string>();

  for (const { fields } of panelDatasets) {
    for (const [field, { type, label: declared }] of Object.entries(fields)) {
      // A field one dataset declares as text and another as boolean keeps its first kind.
      const [kind] = filterKindsOf(type);

      if (kind === undefined || found.has(field)) continue;

      const label = declared ?? field;

      const offered =
        !keys.has(field) && !namedAsId(field) && !labels.has(labelKey(label));

      if (offered) labels.add(labelKey(label));

      const reached = panelDatasets.flatMap(({ name }) =>
        resolveField(facts.get(name), field, kind, facts) === undefined
          ? []
          : [name]
      );

      found.set(field, { field, label, kind, datasets: reached, offered });
    }
  }

  return [...found.values()].toSorted((left, right) =>
    left.label.localeCompare(right.label)
  );
}
