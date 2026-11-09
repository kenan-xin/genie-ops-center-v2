"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { ListDefinition, ListParams, ListSort } from "./definitions.ts";
import {
  dayRangeParam,
  type DayRangeValue,
  readDayRange,
  readSort,
  sortParam,
} from "./list-params.ts";

export { dayRangeParam, readDayRange, readSort, sortParam };

export type { DayRangeValue };

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

export type AddressParams = {
  /** Only the named parameters, as written, and set. */
  readonly params: Readonly<Record<string, string>>;
  /** Sets parameters by name. `undefined` or blank text removes one. */
  readonly set: (patch: Readonly<Record<string, string | undefined>>) => void;
};

/** The named parameters of an address string, each present one as written. */
export function addressParams(
  names: readonly string[],
  search: string
): Readonly<Record<string, string>> {
  const address = new URLSearchParams(search);

  return Object.fromEntries(
    names.flatMap((name) => {
      const value = address.get(name);

      return value === null || value === "" ? [] : [[name, value]];
    })
  );
}

/**
 * The named parameters of the page address, which a change replaces in place, so a shared link
 * and a reload give back what it holds. The server and the hydration read no address, so the
 * first paint matches the server page.
 */
export function useAddressParams(names: readonly string[]): AddressParams {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  );

  // A caller that builds the array each render keeps the same memo, because the names are the key.
  const key = names.join("\n");

  return useMemo(
    () => ({ params: addressParams(names, search), set: write }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- a fresh array with the same names is the same key.
    [search, key]
  );
}

/**
 * A list's state in the page address, so a filtered list can be shared and reloaded. The server and
 * the hydration read no address, so the first paint matches the server page. A change replaces the
 * history entry, which Next keeps in step with its router.
 */
export function useListState(definition: ListDefinition): ListState {
  const names = useMemo(() => namesOf(definition), [definition]);
  const { params } = useAddressParams(names);

  return useMemo(() => {
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
  }, [params, definition, names]);
}
