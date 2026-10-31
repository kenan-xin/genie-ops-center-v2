import {
  type DatasetFilter,
  listDatasets,
  type ModuleRequestContext,
  type PanelConfig,
  type TableSeries,
} from "@genie/core";

import type { DashboardFilters, DateRangeFilter } from "../../contract.ts";

/** What a dashboard filter needs to know of one dataset: where its dates are, and its text fields. */
export type DatasetFacts = {
  readonly timeField: string;
  readonly textFields: ReadonlySet<string>;
};

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

/**
 * The panel with the dashboard filters added to each series' own filters (R-49, D3): the date range
 * on the time field of the series' dataset, and the field filter only where that dataset declares
 * the field as text, so a panel whose dataset lacks the field stays unfiltered (Review Focus 5).
 */
export function effectivePanel(
  panel: PanelConfig,
  filters: DashboardFilters,
  datasets: ReadonlyMap<string, DatasetFacts>,
  reportingDate: string
): PanelConfig {
  const bounds = dateBounds(filters.dateRange, reportingDate);
  const { field } = filters;

  const filtered = <S extends TableSeries>(entry: S): S => {
    const facts = datasets.get(entry.dataset);
    const added: DatasetFilter[] = [];

    if (facts !== undefined && bounds !== null) {
      added.push({ field: facts.timeField, op: "between", ...bounds });
    }

    if (
      field !== null &&
      field.value !== null &&
      facts?.textFields.has(field.field) === true
    ) {
      added.push({ field: field.field, op: "eq", value: field.value });
    }

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

/** The time field and text fields of each dataset the caller can read (DEC-54). */
export async function datasetFacts(
  ctx: ModuleRequestContext
): Promise<ReadonlyMap<string, DatasetFacts>> {
  return new Map(
    (await listDatasets(ctx)).map(({ name, timeField, fields }) => [
      name,
      {
        timeField,
        textFields: new Set(
          Object.entries(fields)
            .filter(([, { type }]) => type === "text")
            .map(([fieldName]) => fieldName)
        ),
      },
    ])
  );
}
