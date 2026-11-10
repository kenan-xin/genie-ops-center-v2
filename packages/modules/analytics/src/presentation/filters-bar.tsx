"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import {
  BUILT_IN_CONTROLS,
  Button,
  buttonVariants,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FilterSheet,
  type ListDefinition,
  type ListFilterControl,
  type ListFilterControlProps,
  type ListFilterDefinition,
  type ListOption,
  type ListState,
  readDayRange,
  Switch,
} from "@genie/ui";
import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import {
  analyticsContract,
  DATE_RANGE_PRESETS,
  type DateRangeFilter,
  FIELD_FILTER_LIMIT,
  type FieldFilter,
} from "../contract.ts";
import { ChangeRefusal } from "./change-refusal.tsx";
import { sameFilters } from "./filter-address.ts";
import { PRESET_LABEL, rangeLabel } from "./range-label.ts";
import {
  type DashboardFilterState,
  useDashboardChange,
} from "./use-dashboard.ts";
import { ViewMenu, ViewNameDialog } from "./view-menu.tsx";
import type { DashboardView } from "./views.ts";

const RANGE = "range";

const CUSTOM = "custom";

const LIMIT_HINT = "Up to 4 filters. Remove one to add another.";

/** The date trigger: the presets of today, then Custom range (D3). "All time" is the empty value. */
const RANGE_FILTER: ListFilterDefinition = {
  id: RANGE,
  kind: "option",
  label: "Date",
  placeholder: PRESET_LABEL.all,
  options: [
    ...DATE_RANGE_PRESETS.filter((preset) => preset !== "all").map(
      (preset) => ({ value: preset, label: PRESET_LABEL[preset] })
    ),
    { value: CUSTOM, label: "Custom range" },
  ],
};

const DATES_FILTER: ListFilterDefinition = {
  id: "dates",
  kind: "date-range",
  label: "Dates",
  placeholder: "Choose the dates",
};

/**
 * The dashboard range as one control: the preset list, and the range calendar beside it once
 * Custom range is picked. Half a range stays here; only a whole one reaches the address.
 */
function DateControl({ value, onChange, place }: ListFilterControlProps) {
  const custom = value?.includes("..") ?? false;
  const [customMode, setCustomMode] = useState(custom);
  const [draft, setDraft] = useState(custom ? value : undefined);

  // Follow a range the address changed, such as a reset after Save as default or a shared link.
  useEffect(() => {
    setCustomMode(custom);
    setDraft(custom ? value : undefined);
  }, [value, custom]);

  const Presets = BUILT_IN_CONTROLS.option;
  const Dates = BUILT_IN_CONTROLS["date-range"];

  return (
    <>
      <Presets
        filter={RANGE_FILTER}
        value={customMode ? CUSTOM : value}
        place={place}
        onChange={(next) => {
          setCustomMode(next === CUSTOM);
          setDraft(undefined);

          if (next !== CUSTOM) onChange(next);
        }}
      />
      {customMode ? (
        <Dates
          filter={DATES_FILTER}
          value={draft}
          place={place}
          onChange={(next) => {
            setDraft(next);

            const { from, to } = readDayRange(next);

            if (from !== undefined && to !== undefined) onChange(next);
          }}
        />
      ) : null}
    </>
  );
}

/** A yes-or-no field as a switch in the filter trigger frame; off applies nothing (P15-4). */
function ToggleControl({
  filter,
  value,
  onChange,
  place,
}: ListFilterControlProps) {
  const on = value === "1";

  return (
    <label
      className={buttonVariants({
        variant: on ? "filter-set" : place === "bar" ? "filter" : "secondary",
        size: "filter",
        className: place === "sheet" ? "w-full justify-start" : "",
      })}
    >
      <Switch
        checked={on}
        onCheckedChange={(checked) => onChange(checked ? "1" : undefined)}
      />
      {filter.label}
    </label>
  );
}

const CONTROLS = {
  ...BUILT_IN_CONTROLS,
  date: DateControl,
  toggle: ToggleControl,
} satisfies Readonly<Record<string, ListFilterControl>>;

const CONTROL_KIND = {
  "select": "option",
  "multi-select": "multi-option",
  "toggle": "toggle",
} as const;

const idOf = (field: string) => `f.${field}`;

/** The range as the date control writes it; All time is no value. */
const rangeParam = (range: DateRangeFilter): string | undefined =>
  "preset" in range
    ? range.preset === "all"
      ? undefined
      : range.preset
    : `${range.from}..${range.to}`;

function rangeOf(value: string | undefined): DateRangeFilter {
  const preset = DATE_RANGE_PRESETS.find((name) => name === value);
  const { from, to } = readDayRange(value);

  return preset === undefined && from !== undefined && to !== undefined
    ? { from, to }
    : { preset: preset ?? "all" };
}

/**
 * A filter as its control writes it. Each multi value is encoded, because the list header joins
 * values with a comma and a customer name can hold one (P15-8).
 */
function paramOf(filter: FieldFilter): string | undefined {
  switch (filter.kind) {
    case "select":
      return filter.value ?? undefined;
    case "multi-select":
      return filter.values.map(encodeURIComponent).join(",") || undefined;
    case "toggle":
      return filter.value ? "1" : undefined;
  }
}

type ShownField = Pick<FieldFilter, "field" | "kind" | "label">;

function filterOf(shown: ShownField, raw: string | undefined): FieldFilter {
  const { field, label } = shown;

  switch (shown.kind) {
    case "select":
      return { kind: "select", field, label, value: raw ?? null };
    case "multi-select":
      return {
        kind: "multi-select",
        field,
        label,
        values: raw === undefined ? [] : raw.split(",").map(decodeURIComponent),
      };
    case "toggle":
      return { kind: "toggle", field, label, value: raw === "1" };
  }
}

/** "Region: North", "Customer: 2 selected", "Overdue only": one applied filter in the summary. */
function summaryOf(filter: FieldFilter): string | undefined {
  switch (filter.kind) {
    case "select":
      return filter.value === null
        ? undefined
        : `${filter.label}: ${filter.value}`;
    case "multi-select":
      return filter.values.length === 0
        ? undefined
        : `${filter.label}: ${filter.values.length === 1 ? filter.values[0] : `${filter.values.length} selected`}`;
    case "toggle":
      return filter.value ? filter.label : undefined;
  }
}

export type FiltersBarProps = {
  readonly dashboard: DashboardView;
  /** The filters the page applies, from `useDashboardFilters`. */
  readonly filters: DashboardFilterState;
  /** Reads the dashboard again after a save met a newer version. */
  readonly onReload: () => void;
};

/**
 * The dashboard filter bar, variant A (R-49, S7-46, S7-47), on the list header controls, after the
 * view menu. A change writes the page address only; Save as default stores the filters and clears
 * the default view in one change, and a changed view offers Update view and Save as new view.
 */
export function FiltersBar(props: FiltersBarProps) {
  const { dashboard, filters } = props;
  const current = filters.filters;
  const analytics = useModuleClient(analyticsContract);
  const change = useDashboardChange(dashboard);
  const addId = useId();
  const hintId = useId();
  // The Name dialog's title while it is open.
  const [naming, setNaming] = useState<string | null>(null);

  // The bar shows every field filter the page applies, with or without a value (S7-46 ruling).
  const shown = current.fields;
  const applied = new Map(shown.map((filter) => [filter.field, filter]));
  const lists = shown.filter((field) => field.kind !== "toggle");

  const values = useQueries({
    queries: lists.map((field) => ({
      // The values answer under every other filter, so each change asks again (P15-6).
      queryKey: [
        "analytics",
        "filter-values",
        dashboard.id,
        dashboard.version,
        field.field,
        current,
      ],
      queryFn: () =>
        analytics.filterValues({
          id: dashboard.id,
          field: field.field,
          ...(filters.fromAddress && { filters: current }),
        }),
      placeholderData: keepPreviousData,
    })),
  });

  /** The values a field offers, with a chosen value the answer no longer holds kept first. */
  function optionsOf(filter: FieldFilter): readonly ListOption[] {
    const index = lists.findIndex((list) => list.field === filter.field);
    const known = values[index]?.data ?? [];

    const chosen =
      filter.kind === "select" && filter.value !== null
        ? [filter.value]
        : filter.kind === "multi-select"
          ? filter.values
          : [];

    return [...new Set([...chosen, ...known])].map((value) => ({
      value: filter.kind === "multi-select" ? encodeURIComponent(value) : value,
      label: value,
    }));
  }

  const fieldFilters = shown.map((field) => ({
    field,
    filter: {
      id: idOf(field.field),
      kind: CONTROL_KIND[field.kind],
      label: field.label,
      placeholder: "All",
      options: optionsOf(field),
    },
  }));

  const definition: ListDefinition = {
    label: "Dashboard filters",
    noun: ["result", "results"],
    filters: [
      { ...RANGE_FILTER, kind: "date" },
      ...fieldFilters.map(({ filter }) => filter),
    ],
    sorts: [],
    defaultSort: { column: "", direction: "asc" },
  };

  const params: Record<string, string> = {};
  const range = rangeParam(current.dateRange);

  if (range !== undefined) params[RANGE] = range;

  for (const filter of current.fields) {
    const value = paramOf(filter);

    if (value !== undefined) params[idOf(filter.field)] = value;
  }

  /** Writes a patch of control values to the address; nothing is saved (S7-46). */
  function apply(patch: Readonly<Record<string, string | undefined>>) {
    const read = (id: string) => (id in patch ? patch[id] : params[id]);

    filters.set({
      dateRange: rangeOf(read(RANGE)),
      fields: shown.map((field) => filterOf(field, read(idOf(field.field)))),
    });
  }

  const clear = () =>
    apply(
      Object.fromEntries(shown.map((field) => [idOf(field.field), undefined]))
    );

  const state: ListState = {
    params,
    tab: "",
    sort: definition.defaultSort,
    set: apply,
    clear,
  };

  /** Adds a field with nothing chosen; the address keeps it in the bar (S7-46 ruling). */
  function add(field: ShownField) {
    filters.set({
      ...current,
      fields: [...current.fields, filterOf(field, undefined)],
    });
  }

  function remove(field: string) {
    filters.set({
      ...current,
      fields: current.fields.filter((filter) => filter.field !== field),
    });
  }

  /** The control's "Remove filter"; the date range is always there. */
  const onRemove = (id: string) =>
    id === RANGE ? undefined : () => remove(id.slice(2));

  /** One change, one Undo: these filters stored, and the default view cleared (P15-21). */
  function saveAsDefault() {
    change.mutate(
      [
        { op: "set-filters", filters: current },
        { op: "set-default-view", id: null },
      ],
      // The page then reads the stored filters, which are now these.
      { onSuccess: () => filters.reset() }
    );
  }

  const selected = dashboard.views.find((view) => view.id === filters.viewId);

  function updateView() {
    if (selected === undefined) return;

    change.mutate(
      [
        {
          op: "save-view",
          id: selected.id,
          name: selected.name,
          filters: current,
        },
      ],
      // The address keeps the view and drops the filters, so the page reads the saved view.
      { onSuccess: () => filters.reset(selected.id) }
    );
  }

  function saveAsView(name: string) {
    change.mutate([{ op: "save-view", name, filters: current }], {
      onSuccess: (saved) => {
        const added = saved.views.find(
          (view) => !dashboard.views.some((old) => old.id === view.id)
        );

        setNaming(null);
        filters.reset(added?.id);
      },
    });
  }

  function makeDefault() {
    if (selected === undefined) return;

    change.mutate([{ op: "set-default-view", id: selected.id }]);
  }

  function removeView() {
    if (selected === undefined) return;

    change.mutate([{ op: "remove-view", id: selected.id }], {
      // As in the prototype: back to the dashboard filters, not to another default view.
      onSuccess: () => filters.selectView(null),
    });
  }

  function openNaming(title: string) {
    change.reset();
    setNaming(title);
  }

  const available = dashboard.filterFields.filter(
    (field) => !applied.has(field.field)
  );

  const full = shown.length >= FIELD_FILTER_LIMIT;
  const canAdd = full || available.length > 0;
  const anySet = Object.keys(params).some((id) => id !== RANGE);

  // The prototype's `statusKind()`: with a view selected the bar speaks about the view only.
  const status =
    selected === undefined
      ? sameFilters(current, dashboard.filters)
        ? null
        : "unsaved"
      : sameFilters(current, selected.filters)
        ? null
        : "changed";

  const summary = [
    rangeLabel(current.dateRange),
    ...current.fields.flatMap((filter) => summaryOf(filter) ?? []),
  ].join(" · ");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border pb-4">
        <ViewMenu
          views={dashboard.views}
          defaultViewId={dashboard.defaultViewId}
          viewId={filters.viewId}
          onSelect={filters.selectView}
          onMakeDefault={makeDefault}
          onRemove={removeView}
          onSaveAsView={() => openNaming("Save as view")}
          onSaveAsDefault={saveAsDefault}
        />
        <div className="hidden md:contents">
          <DateControl
            filter={RANGE_FILTER}
            value={params[RANGE]}
            onChange={(value) => apply({ [RANGE]: value })}
            place="bar"
          />
          {fieldFilters.map(({ field, filter }) => {
            const Control = CONTROLS[CONTROL_KIND[field.kind]];

            return (
              <Control
                key={filter.id}
                filter={filter}
                value={params[filter.id]}
                onChange={(value) => apply({ [filter.id]: value })}
                place="bar"
                onRemove={() => remove(field.field)}
              />
            );
          })}
          {canAdd ? (
            // One unit, so the hint wraps with the button it explains.
            <span className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={full}
                  aria-describedby={full ? hintId : undefined}
                  render={<Button variant="ghost" size="filter" />}
                >
                  <span aria-hidden="true">+</span>
                  Add filter
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {available.map((field) => (
                    <DropdownMenuItem
                      key={field.field}
                      onClick={() => add(field)}
                    >
                      {field.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {full ? (
                <span id={hintId} className="text-sm text-muted-foreground">
                  {LIMIT_HINT}
                </span>
              ) : null}
            </span>
          ) : null}
          {anySet ? (
            <Button variant="link" size="filter" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="contents md:hidden">
          <FilterSheet
            definition={definition}
            state={state}
            controls={CONTROLS}
            resultCount={undefined}
            onRemove={(id) => onRemove(id)?.()}
          >
            {canAdd ? (
              <div className="grid gap-1.5">
                <span id={addId} className="text-sm font-medium">
                  Add filter
                </span>
                {full ? (
                  <p className="text-sm text-muted-foreground">{LIMIT_HINT}</p>
                ) : (
                  <div
                    role="group"
                    aria-labelledby={addId}
                    className="flex flex-wrap gap-2"
                  >
                    {available.map((field) => (
                      <Button
                        key={field.field}
                        variant="secondary"
                        size="md"
                        onClick={() => add(field)}
                      >
                        <span aria-hidden="true">+</span>
                        {field.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </FilterSheet>
          <p className="basis-full text-sm text-muted-foreground">{summary}</p>
        </div>

        {status === null ? null : (
          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {/* DESIGN.md: an unsaved change carries a small blue dot. */}
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-primary"
              />
              {status === "changed" ? "Changed" : "Not saved as default"}
            </span>
            {status === "changed" ? (
              <>
                <Button
                  size="sm"
                  loading={change.isPending}
                  onClick={updateView}
                >
                  Update view
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openNaming("Save as new view")}
                >
                  Save as new view
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={change.isPending}
                onClick={saveAsDefault}
              >
                Save as default
              </Button>
            )}
          </div>
        )}
      </div>

      {naming === null ? null : (
        <ViewNameDialog
          title={naming}
          views={dashboard.views}
          saving={change.isPending}
          refusal={
            change.error === null ? null : (
              <ChangeRefusal
                failure={{ kind: "change", error: change.error }}
                onReload={() => {
                  change.reset();
                  props.onReload();
                }}
              />
            )
          }
          onSave={saveAsView}
          onClose={() => setNaming(null)}
        />
      )}

      {change.error === null || naming !== null ? null : (
        <ChangeRefusal
          failure={{ kind: "change", error: change.error }}
          focus
          onReload={() => {
            change.reset();
            props.onReload();
          }}
        />
      )}
    </div>
  );
}
