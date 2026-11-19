"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import {
  BUILT_IN_CONTROLS,
  Button,
  ButtonGroup,
  buttonVariants,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type FilterChip,
  FilterChips,
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
import { useEffect, useId, useRef, useState } from "react";

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
import { sameViewName, ViewMenu, ViewNameDialog } from "./view-menu.tsx";
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
  icon: "calendar",
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

  // Follow a range the address changed, such as Clear filters, Reset or a shared link.
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

/** "North", "Customer: 2 selected", "Overdue only": one applied filter as a chip (P16f-6). */
function chipLabelOf(filter: FieldFilter): string | undefined {
  switch (filter.kind) {
    case "select":
      return filter.value ?? undefined;
    case "multi-select":
      return filter.values.length > 1
        ? `${filter.label}: ${filter.values.length} selected`
        : filter.values[0];
    case "toggle":
      return filter.value ? filter.label : undefined;
  }
}

/**
 * "Unsaved changes" with Save view and Reset: at the end of the bar, or on a phone a quiet row
 * with text buttons (`czjw.159`, `czjw.192`).
 */
function StatusRow(props: {
  readonly place: "bar" | "phone";
  readonly onSaveView: () => void;
  readonly onReset: () => void;
}) {
  const bar = props.place === "bar";

  return (
    <div
      className={
        bar
          ? "flex flex-wrap items-center gap-3 md:ml-auto"
          : "flex min-h-11 items-center justify-between gap-2 border-t border-border text-sm text-muted-foreground"
      }
    >
      <span
        className={`flex items-center gap-2 ${bar ? "text-sm text-muted-foreground" : ""}`}
      >
        {/* DESIGN.md: an unsaved change carries a small blue dot. */}
        <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
        Unsaved changes
      </span>
      <span className={bar ? "contents" : "flex items-center gap-3"}>
        <Button
          variant={bar ? "primary" : "link"}
          // C06-1: the field height of the filters (R-37a), on the bar and the phone row alike.
          size="filter"
          onClick={props.onSaveView}
        >
          Save view
        </Button>
        <Button
          variant={bar ? "secondary" : "link"}
          size="filter"
          onClick={props.onReset}
        >
          Reset
        </Button>
      </span>
    </div>
  );
}

export type FiltersBarProps = {
  readonly dashboard: DashboardView;
  /** The filters the page applies, from `useDashboardFilters`. */
  readonly filters: DashboardFilterState;
  /** Edit mode, where the owner's Save as original shows (czjw.192). */
  readonly editing: boolean;
  /** Reads the dashboard again after a save met a newer version. */
  readonly onReload: () => void;
};

/**
 * The dashboard filter bar, variant A (R-49, S7-46, S7-47, czjw.192), on the list header controls,
 * after the view menu. A change writes the page address only. When the filters differ from the
 * selected row, Original or a saved view, the bar says Unsaved changes with Save view and Reset.
 */
export function FiltersBar(props: FiltersBarProps) {
  const { dashboard, filters } = props;
  const current = filters.filters;
  const analytics = useModuleClient(analyticsContract);
  const change = useDashboardChange(dashboard);
  const addId = useId();
  const hintId = useId();
  const controls = useRef<HTMLDivElement>(null);
  // Whether the Name dialog of Save view is open.
  const [naming, setNaming] = useState(false);

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
      // czjw.207: the prototype's icon for a field with none of its own; a toggle shows its switch.
      ...(field.kind === "toggle"
        ? { labelInControl: true as const }
        : { icon: "filter" as const }),
    },
  }));

  const definition: ListDefinition = {
    label: "Filters",
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

  // Clear filters removes every set filter, the date range too (LH26, G18, P17-11).
  const clear = () =>
    apply({
      [RANGE]: undefined,
      ...Object.fromEntries(
        shown.map((field) => [idOf(field.field), undefined])
      ),
    });

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

  const selected = dashboard.views.find((view) => view.id === filters.viewId);

  /**
   * Save view (czjw.192): under the selected view's own name it updates that view, else it adds
   * one. The same name and filters save nothing, so no Undo entry is spent.
   */
  function saveView(name: string) {
    const target =
      selected !== undefined && sameViewName(name, selected.name)
        ? selected
        : undefined;

    if (
      target !== undefined &&
      target.name === name &&
      sameFilters(current, target.filters)
    ) {
      setNaming(false);

      return;
    }

    change.mutate(
      [
        {
          op: "save-view",
          ...(target && { id: target.id }),
          name,
          filters: current,
        },
      ],
      {
        onSuccess: (saved) => {
          setNaming(false);
          // The address keeps the view and drops the filters, so the page reads the saved view.
          filters.reset(
            target?.id ??
              saved.views.find(
                (view) => !dashboard.views.some((old) => old.id === view.id)
              )?.id
          );
        },
      }
    );
  }

  /** Reset: the selected row's saved filters, never an empty address, which opens the default (P19-9). */
  const resetView = () => filters.selectView(filters.viewId);

  /** Make default on the selected row; on Original it clears the default view (czjw.192). */
  function makeDefault() {
    change.mutate([{ op: "set-default-view", id: selected?.id ?? null }]);
  }

  /** Save as original: one `set-filters` step, so the person's default stays (P19-10). */
  function saveAsOriginal() {
    change.mutate([{ op: "set-filters", filters: current }]);
  }

  function removeView() {
    if (selected === undefined) return;

    change.mutate([{ op: "remove-view", id: selected.id }], {
      // As in the prototype: back to Original, not to another default view.
      onSuccess: () => filters.selectView(null),
    });
  }

  function openNaming() {
    change.reset();
    setNaming(true);
  }

  // Add filter lists only the fields a person filters by, and no label an applied filter holds; a
  // stored filter on another field still reads (czjw.178).
  const appliedLabels = new Set(
    shown.map(({ label }) => label.trim().toLowerCase())
  );

  const available = dashboard.filterFields.filter(
    (field) =>
      field.offered &&
      !applied.has(field.field) &&
      !appliedLabels.has(field.label.trim().toLowerCase())
  );

  const full = shown.length >= FIELD_FILTER_LIMIT;
  const canAdd = full || available.length > 0;
  const anySet = Object.keys(params).some((id) => id !== RANGE);

  // One unsaved state for Original and a view alike (czjw.192).
  const unsaved = !sameFilters(current, selected?.filters ?? dashboard.filters);

  // The date range first, with no remove: the dashboard always has one.
  const chips: readonly FilterChip[] = [
    {
      id: RANGE,
      label: rangeLabel(current.dateRange),
      set: range !== undefined,
    },
    ...current.fields.flatMap((filter) => {
      const label = chipLabelOf(filter);

      return label === undefined
        ? []
        : [
            {
              id: idOf(filter.field),
              label,
              set: true,
              remove: {
                name: `Remove ${filter.label} filter`,
                onRemove: () => remove(filter.field),
              },
            },
          ];
    }),
  ];

  const viewMenu = {
    views: dashboard.views,
    defaultViewId: dashboard.defaultViewId,
    viewId: filters.viewId,
    onSelect: filters.selectView,
    onMakeDefault: makeDefault,
    onRemove: removeView,
    onSaveView: openNaming,
    onSaveAsOriginal:
      props.editing && !sameFilters(current, dashboard.filters)
        ? saveAsOriginal
        : undefined,
  };

  const statusRow = (place: "bar" | "phone") =>
    unsaved ? (
      <StatusRow place={place} onSaveView={openNaming} onReset={resetView} />
    ) : null;

  return (
    <div className="grid gap-3">
      <div className="hidden flex-wrap items-center gap-2.5 border-b border-border pb-4 md:flex">
        <ViewMenu place="bar" {...viewMenu} />
        <div ref={controls} className="contents">
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
            <Button
              variant="link"
              size="filter"
              onClick={() => {
                clear();
                // Clear filters unmounts itself, so focus goes to the first control (WCAG 2.4.3).
                controls.current?.querySelector<HTMLElement>("button")?.focus();
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        {statusRow("bar")}
      </div>

      <div className="grid gap-3 md:hidden">
        <ButtonGroup aria-label="View and filters" className="w-full">
          <ViewMenu place="sheet" {...viewMenu} />
          <FilterSheet
            definition={definition}
            state={state}
            controls={CONTROLS}
            resultCount={undefined}
            onRemove={(id) => onRemove(id)?.()}
          >
            {canAdd ? (
              <div className="grid gap-1.5">
                <span id={addId} className="text-sm font-semibold">
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
        </ButtonGroup>
        <FilterChips label="Applied filters" chips={chips} />
        {statusRow("phone")}
      </div>

      {naming ? (
        <ViewNameDialog
          views={dashboard.views}
          current={selected}
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
          onSave={saveView}
          onClose={() => setNaming(false)}
        />
      ) : null}

      {change.error === null || naming ? null : (
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
