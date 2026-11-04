import type {
  ListDefinition,
  ListFilterDefinition,
  ListParams,
  ListSortKind,
  ListTabDefinition,
  ListTabsDefinition,
} from "@genie/ui";
import { readDayRange, readSort } from "@genie/ui/list-params";

import type { DatasetFilter, DatasetOrder } from "./query.ts";

/**
 * A list header (module contract, "List header") over one dataset: each filter names the field it
 * narrows, each tab the statuses of one status field, each sort the field it orders on. A search
 * names no field, and a filter of a kind that a module registers maps to no dataset filter here.
 */
export type DatasetListDefinition = Omit<
  ListDefinition,
  "filters" | "tabs" | "sorts"
> & {
  readonly filters: readonly (ListFilterDefinition & {
    readonly field?: string;
  })[];
  readonly tabs?: Omit<ListTabsDefinition, "items"> & {
    readonly field: string;
    readonly items: readonly (ListTabDefinition & {
      readonly statuses: readonly string[];
    })[];
  };
  readonly sorts: readonly {
    readonly column: string;
    readonly kind: ListSortKind;
    readonly field: string;
  }[];
};

export type ListQuery = {
  /** Every filter but the tab, so a loader can count the tabs. */
  readonly filters: readonly DatasetFilter[];
  /** The active tab's statuses, or none. */
  readonly tab: readonly DatasetFilter[];
  readonly search?: string;
  /** The allowed sort. Core adds the row key. */
  readonly orderBy: readonly DatasetOrder[];
};

function filtersOf(
  filter: DatasetListDefinition["filters"][number],
  value: string
): DatasetFilter[] {
  const { field } = filter;

  if (field === undefined) return [];

  switch (filter.kind) {
    case "option":
      return [{ field, op: "eq", value }];
    case "multi-option": {
      const values = value.split(",").filter((entry) => entry !== "");

      return values.length === 0 ? [] : [{ field, op: "in", values }];
    }

    case "date-range": {
      const { from, to } = readDayRange(value);

      return [
        ...(from === undefined
          ? []
          : [{ field, op: "gte" as const, value: from }]),
        ...(to === undefined ? [] : [{ field, op: "lte" as const, value: to }]),
      ];
    }

    default:
      return [];
  }
}

/**
 * The `queryDataset` parts of the address state (LH15). The address is read as the client reads
 * it: an unknown tab gives no tab filter, and an unlisted sort gives the default.
 */
export function listQueryOf(
  definition: DatasetListDefinition,
  params: ListParams
): ListQuery {
  const filters: DatasetFilter[] = [];
  let search: string | undefined;

  for (const filter of definition.filters) {
    const value = params[filter.id];

    if (value === undefined) continue;

    if (filter.kind === "search") {
      const term = value.trim();

      if (term !== "") search = term;
    } else {
      filters.push(...filtersOf(filter, value));
    }
  }

  const { tabs } = definition;

  const active =
    tabs === undefined
      ? undefined
      : tabs.items.find(
          (item) => item.value === (params[tabs.param] ?? tabs.items[0]?.value)
        );

  const tab: DatasetFilter[] =
    tabs === undefined || active === undefined || active.statuses.length === 0
      ? []
      : [{ field: tabs.field, op: "in", values: active.statuses }];

  const sort = readSort(definition, params["sort"]);

  const orderBy = definition.sorts
    .filter((entry) => entry.column === sort.column)
    .map((entry) => ({ column: entry.field, direction: sort.direction }));

  return search === undefined
    ? { filters, tab, orderBy }
    : { filters, tab, search, orderBy };
}
