/*
 * A dashboard's filters in the page address, so a change that is not saved survives a reload and
 * a shared link (S7-46). Pure: no React, no read of `window`; Task 4 composes it with the list
 * header's `useAddressParams`.
 */

import { readDayRange } from "@genie/ui/list-params";

import {
  DATE_RANGE_PRESETS,
  type DashboardFilters,
  type DateRangeFilter,
  FIELD_FILTER_LIMIT,
  fieldFilter,
  type FieldFilter,
  type FilterField,
} from "../contract.ts";

/** The two dashboard parameters, beside one `f.<field>` per field filter. */
export const ADDRESS = { range: "range", fields: "fields" } as const;

/** The patch `useAddressParams().set` takes. */
export type FilterPatch = Record<string, string | undefined>;

const KINDS = ["select", "multi-select", "toggle"] as const;

const isKind = (value: string): value is FieldFilter["kind"] =>
  KINDS.some((kind) => kind === value);

const nameOf = (field: string) => `f.${field}`;

/** The kinds a field allows, from the one kind the page uses for it (R-49, D3). */
const kindsOf = (field: FilterField): readonly FieldFilter["kind"][] =>
  field.kind === "toggle" ? ["toggle"] : ["select", "multi-select"];

/** Whether a filter applies anything: a value-less select, an empty list and a toggle off do not (P15-4). */
const applies = (filter: FieldFilter): boolean =>
  filter.kind === "select"
    ? filter.value !== null
    : filter.kind === "multi-select"
      ? filter.values.length > 0
      : filter.value;

/** The field names a `fields` parameter lists, each once and in its order. */
export function fieldNamesOf(fields: string | undefined): readonly string[] {
  const seen = new Set<string>();

  for (const item of (fields ?? "").split(",")) {
    const [field] = item.split(":");

    if (field !== undefined && field !== "") seen.add(field);
  }

  return [...seen];
}

/** The parameters this address can hold: the range, the field names, and a value per field. */
export function addressNames(
  params: Readonly<Record<string, string>>
): readonly string[] {
  return [
    ADDRESS.range,
    ADDRESS.fields,
    ...fieldNamesOf(params[ADDRESS.fields]).map(nameOf),
  ];
}

/** A range from the address: a preset, or both ends of a day range. Anything else is All time. */
function readRange(value: string | undefined): DateRangeFilter {
  const preset = DATE_RANGE_PRESETS.find((name) => name === value);

  if (preset !== undefined) return { preset };

  const { from, to } = readDayRange(value);

  return from !== undefined && to !== undefined && from <= to
    ? { from, to }
    : { preset: "all" };
}

/** One decoded multi-select value, or nothing when the address holds a broken escape. */
function decode(part: string): readonly string[] {
  try {
    return [decodeURIComponent(part)];
  } catch {
    return [];
  }
}

/**
 * One filter of the address. A listed field with no value is in the bar with nothing chosen (S7-46
 * ruling); a value it cannot hold gives `undefined`.
 */
function readFilter(
  known: FilterField,
  kind: FieldFilter["kind"],
  value: string | undefined
): FieldFilter | undefined {
  const { field, label } = known;

  switch (kind) {
    case "select":
      return { kind, field, label, value: value ?? null };
    case "multi-select":
      return {
        kind,
        field,
        label,
        values: value === undefined ? [] : value.split(",").flatMap(decode),
      };
    case "toggle":
      return value === undefined || value === "0"
        ? { kind, field, label, value: false }
        : value === "1"
          ? { kind, field, label, value: true }
          : undefined;
  }
}

/**
 * The field filters the address names, in its order, at most four (R-49). A field the page does
 * not offer, a kind it does not allow and a value it cannot hold are dropped (Review Focus 1).
 */
function readFields(
  value: string | undefined,
  fields: readonly FilterField[],
  params: Readonly<Record<string, string | undefined>>
): FieldFilter[] {
  const known = new Map(fields.map((field) => [field.field, field]));
  const read: FieldFilter[] = [];
  const seen = new Set<string>();

  for (const item of (value ?? "").split(",")) {
    const [field, kind, ...rest] = item.split(":");
    const offered = field === undefined ? undefined : known.get(field);

    if (
      read.length === FIELD_FILTER_LIMIT ||
      offered === undefined ||
      kind === undefined ||
      rest.length > 0 ||
      seen.has(offered.field) ||
      !isKind(kind) ||
      !kindsOf(offered).includes(kind)
    ) {
      continue;
    }

    const filter = readFilter(offered, kind, params[nameOf(offered.field)]);

    // Structure is not enough: a hand-edited value can be empty or too long, and the server
    // refuses it (Review Focus 1). The contract's own schema is the one check to trust.
    if (filter === undefined || !fieldFilter.safeParse(filter).success)
      continue;

    seen.add(filter.field);
    read.push(filter);
  }

  return read;
}

/**
 * The filters the address holds, or `null` when it holds neither parameter, so the page opens the
 * stored filters. Once any parameter is set, `range` always reads, `all` included (P15-7).
 */
export function readFilterAddress(
  params: Readonly<Record<string, string | undefined>>,
  fields: readonly FilterField[]
): DashboardFilters | null {
  const range = params[ADDRESS.range];
  const named = params[ADDRESS.fields];

  if (range === undefined && named === undefined) return null;

  return {
    dateRange: readRange(range),
    fields: readFields(named, fields, params),
  };
}

/** The address value of a range: the preset, or both ends of a day range. */
function writeRange(range: DateRangeFilter): string {
  return "preset" in range ? range.preset : `${range.from}..${range.to}`;
}

/** The address value of a filter: each multi value encoded, so a comma inside one survives (P15-8). */
function writeValue(filter: FieldFilter): string {
  switch (filter.kind) {
    case "select":
      return filter.value ?? "";
    case "multi-select":
      return filter.values.map(encodeURIComponent).join(",");
    case "toggle":
      return filter.value ? "1" : "0";
  }
}

/**
 * The patch that writes `filters` to the address. It always writes `range`, `all` included
 * (P15-7), lists every field filter, also one that applies nothing, so it stays in the bar after
 * a reload (S7-46 ruling), writes a value only for a filter that applies, and removes every other
 * value of the filters and of `previous`.
 */
export function writeFilterAddress(
  filters: DashboardFilters,
  previous: readonly string[] = []
): FilterPatch {
  const written = [
    [ADDRESS.range, writeRange(filters.dateRange)],
    [
      ADDRESS.fields,
      filters.fields.map(({ field, kind }) => `${field}:${kind}`).join(","),
    ],
    ...[...previous, ...filters.fields.map(({ field }) => field)].map(
      (field) => [nameOf(field), undefined]
    ),
    ...filters.fields
      .filter(applies)
      .map((filter) => [nameOf(filter.field), writeValue(filter)]),
  ];

  return Object.fromEntries(written);
}

const sameRange = (a: DateRangeFilter, b: DateRangeFilter): boolean => {
  if ("preset" in a || "preset" in b) {
    return "preset" in a && "preset" in b && a.preset === b.preset;
  }

  return a.from === b.from && a.to === b.to;
};

/** A filter's kind and value, with a multi-select's values in one order. */
const canonical = (filter: FieldFilter): string => {
  switch (filter.kind) {
    case "select":
      return `${filter.kind}:${filter.value ?? ""}`;
    case "multi-select":
      return `${filter.kind}:${[...filter.values].toSorted().join(",")}`;
    case "toggle":
      return `${filter.kind}:${filter.value ? 1 : 0}`;
  }
};

/**
 * Whether two sets of filters are the same: the same fields in the bar, each of one kind and
 * value. A multi-select's value order, the labels and the filter order do not count; a field in
 * the bar with no value does (S7-46 ruling). "Not saved as default" waits on this.
 */
export function sameFilters(a: DashboardFilters, b: DashboardFilters): boolean {
  if (!sameRange(a.dateRange, b.dateRange)) return false;

  const mine = new Map(
    a.fields.map((filter) => [filter.field, canonical(filter)])
  );

  // The count catches a filter `a` holds and `b` does not; `every` only looks from `b`'s side.
  return (
    b.fields.length === mine.size &&
    b.fields.every((filter) => mine.get(filter.field) === canonical(filter))
  );
}
