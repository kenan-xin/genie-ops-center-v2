/*
 * The address readers and writers that hold no state (LH14, LH5). No "use client": core and a
 * module loader read the same address on the server (`@genie/ui/list-params`).
 */

import { dayFromText } from "../parts/calendar-day.ts";
import type { ListDefinition, ListSort } from "./definitions.ts";

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
