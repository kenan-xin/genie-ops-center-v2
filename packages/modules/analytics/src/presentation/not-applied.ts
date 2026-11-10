import type { DashboardFilters, FilterField } from "../contract.ts";
import { filterApplies } from "./filter-address.ts";
import type { PanelView } from "./views.ts";

/**
 * Each set field filter that reaches none of the panel's datasets, so the header can say the
 * filter skips this panel (P15-5). An empty filter in the bar excuses nothing (P15-4). The field,
 * not the label, keys the notice: two datasets may label different fields alike.
 *
 * A sibling of `panel-card.tsx`, not a part of it, so the rule reads in node with no React.
 */
export function notApplied(
  panel: PanelView,
  filters: DashboardFilters,
  filterFields: readonly FilterField[]
): readonly { readonly field: string; readonly label: string }[] {
  const datasets = new Set(panel.config.series.map((series) => series.dataset));

  return filters.fields.flatMap((filter) => {
    const field = filterFields.find(
      (candidate) => candidate.field === filter.field
    );

    return field !== undefined &&
      filterApplies(filter) &&
      !field.datasets.some((dataset) => datasets.has(dataset))
      ? [{ field: filter.field, label: filter.label }]
      : [];
  });
}
