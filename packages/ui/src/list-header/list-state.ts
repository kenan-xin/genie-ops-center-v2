"use client";

import { useMemo, useSyncExternalStore } from "react";

import { dayFromText } from "../parts/calendar-day.ts";
import type { ListDefinition, ListParams, ListSort } from "./definitions.ts";

export type DayRangeValue = {
  readonly from?: string;
  readonly to?: string;
};

/** An ISO day that exists in the calendar, else `undefined`. */
const isoDay = (text: string) =>
  /^\d{4}-\d{2}-\d{2}$/u.test(text) && dayFromText(text) === text
    ? text
    : undefined;

/**
 * A range from the address, `from..to`, where either end can be empty. A range with an end that is
 * not a calendar day reads as no range, so a hand-edited address never reaches the server.
 */
export function readDayRange(value: string | undefined): DayRangeValue {
  const [from = "", to = "", ...rest] = value?.split("..") ?? [];

  if (value === undefined || !value.includes("..") || rest.length > 0)
    return {};

  const start = from === "" ? undefined : isoDay(from);
  const end = to === "" ? undefined : isoDay(to);

  if ((from !== "" && start === undefined) || (to !== "" && end === undefined))
    return {};

  if (start === undefined) return end === undefined ? {} : { to: end };

  return end === undefined ? { from: start } : { from: start, to: end };
}

/** The address value of a range, `undefined` with no end. */
export function dayRangeParam(range: {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}): string | undefined {
  return range.from === undefined && range.to === undefined
    ? undefined
    : `${range.from ?? ""}..${range.to ?? ""}`;
}

/** The sort of `column.direction`. A column outside `sorts` or another direction reads as the default. */
export function readSort(
  definition: ListDefinition,
  value: string | undefined
): ListSort {
  const [column, direction, ...rest] = value?.split(".") ?? [];

  return rest.length === 0 &&
    (direction === "asc" || direction === "desc") &&
    definition.sorts.some((sort) => sort.column === column) &&
    column !== undefined
    ? { column, direction }
    : definition.defaultSort;
}

/** The address value of a sort, `undefined` at the default. */
export function sortParam(
  definition: ListDefinition,
  sort: ListSort
): string | undefined {
  const { column, direction } = definition.defaultSort;

  return sort.column === column && sort.direction === direction
    ? undefined
    : `${sort.column}.${sort.direction}`;
}

const restingTab = (definition: ListDefinition) =>
  definition.tabs?.items[0]?.value;

/**
 * The count on the Filters button (LH26): each set filter once, a range too, and one more when the
 * tab is not the resting tab. The search does not count.
 */
export function setFilterCount(
  definition: ListDefinition,
  params: ListParams
): number {
  const filters = definition.filters.filter(
    (filter) => filter.kind !== "search" && params[filter.id] !== undefined
  ).length;

  const tab = definition.tabs?.param;
  const value = tab === undefined ? undefined : params[tab];

  return (
    filters + (value !== undefined && value !== restingTab(definition) ? 1 : 0)
  );
}

/** Fired after a write, which `replaceState` itself does not announce. */
const ADDRESS_CHANGE = "genie:list-state";

/** Fired by `clear`, so a control drops an edit that has not reached the address yet. */
export const LIST_CLEARED = "genie:list-cleared";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(ADDRESS_CHANGE, onChange);

  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(ADDRESS_CHANGE, onChange);
  };
}

export type ListState = {
  /** Only the parameters that the definition names, as written. */
  readonly params: ListParams;
  readonly tab: string;
  readonly sort: ListSort;
  /** Sets parameters by name. `undefined` or blank text removes one. */
  readonly set: (patch: Readonly<Record<string, string | undefined>>) => void;
  /** Removes every filter, the search and the tab. The sort stays. */
  readonly clear: () => void;
};

/** The parameter names of a definition: each filter, the tab and `sort`. */
const namesOf = (definition: ListDefinition) => [
  ...definition.filters.map((filter) => filter.id),
  ...(definition.tabs === undefined ? [] : [definition.tabs.param]),
  "sort",
];

function write(patch: Readonly<Record<string, string | undefined>>) {
  const params = new URLSearchParams(window.location.search);

  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined || value.trim() === "") params.delete(name);
    else params.set(name, value);
  }

  const query = params.toString();

  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query === "" ? "" : `?${query}`}`
  );
  window.dispatchEvent(new Event(ADDRESS_CHANGE));
}

/**
 * A list's state in the page address, so a filtered list can be shared and reloaded. The server and
 * the hydration read no address, so the first paint matches the server page. A change replaces the
 * history entry, which Next keeps in step with its router.
 */
export function useListState(definition: ListDefinition): ListState {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  );

  return useMemo(() => {
    const address = new URLSearchParams(search);
    const names = namesOf(definition);

    const params: ListParams = Object.fromEntries(
      names.flatMap((name) => {
        const value = address.get(name);

        return value === null || value === "" ? [] : [[name, value]];
      })
    );

    const tabs = definition.tabs;
    const asked = tabs === undefined ? undefined : params[tabs.param];

    const tab =
      tabs?.items.find((item) => item.value === asked)?.value ??
      restingTab(definition) ??
      "";

    return {
      params,
      tab,
      sort: readSort(definition, params["sort"]),
      set: write,
      clear: () => {
        window.dispatchEvent(new Event(LIST_CLEARED));
        write(
          Object.fromEntries(
            names
              .filter((name) => name !== "sort")
              .map((name) => [name, undefined])
          )
        );
      },
    };
  }, [search, definition]);
}
