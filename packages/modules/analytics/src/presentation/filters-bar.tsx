"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genie/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import {
  analyticsContract,
  DATE_RANGE_PRESETS,
  dateRangeFilter,
  type DateRangeFilter,
} from "../contract.ts";
import { ChangeRefusal } from "./change-refusal.tsx";
import { useDashboardChange } from "./use-dashboard.ts";
import type { DashboardView } from "./views.ts";

const CUSTOM = "custom";

const RANGE_ITEMS = [
  { value: "all", label: "All time" },
  { value: "this-month", label: "This month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-6-months", label: "Last 6 months" },
  { value: "this-year", label: "This year" },
  { value: CUSTOM, label: "Custom range" },
] as const;

export type FiltersBarProps = {
  readonly dashboard: DashboardView;
  /** Reads the dashboard again after a save met a newer version. */
  readonly onReload: () => void;
};

/** The date range and the field filter, each save one `set-filters` change (R-49, D3). */
export function FiltersBar(props: FiltersBarProps) {
  const { dashboard } = props;
  const analytics = useModuleClient(analyticsContract);
  const change = useDashboardChange(dashboard);
  const rangeId = useId();
  const fromId = useId();
  const toId = useId();
  const fieldId = useId();
  const rangeErrorId = useId();

  const range = dashboard.filters.dateRange;
  const storedPreset = "preset" in range ? range.preset : null;
  const storedFrom = "preset" in range ? "" : range.from;
  const storedTo = "preset" in range ? "" : range.to;
  const [customMode, setCustomMode] = useState(false);
  const [from, setFrom] = useState(storedFrom);
  const [to, setTo] = useState(storedTo);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const custom = customMode || !("preset" in range);

  // Follow a stored range that changed under the fields, such as after an Undo.
  useEffect(() => {
    setFrom(storedFrom);
    setTo(storedTo);
    setCustomMode(storedPreset === null);
  }, [storedFrom, storedTo, storedPreset]);

  const field = dashboard.filters.field;

  const values = useQuery({
    // A save may change the field or add a dataset, so each version asks again.
    queryKey: ["analytics", "filter-values", dashboard.id, dashboard.version],
    queryFn: () => analytics.filterValues({ id: dashboard.id }),
    enabled: field !== null,
    placeholderData: keepPreviousData,
  });

  function save(filters: {
    readonly dateRange: DateRangeFilter;
    readonly field: typeof field;
  }) {
    change.mutate([{ op: "set-filters", filters }]);
  }

  function applyCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = dateRangeFilter.safeParse({ from, to });

    if (!parsed.success) {
      setRangeError(
        parsed.error.issues[0]?.message ?? "Choose a start and an end date."
      );

      return;
    }

    setRangeError(null);
    save({ dateRange: parsed.data, field });
  }

  const known: readonly string[] = values.data ?? [];

  const options: readonly string[] =
    field === null || field.value === null || known.includes(field.value)
      ? known
      : [field.value, ...known];

  return (
    <div className="flex flex-wrap items-end gap-4">
      <Field className="w-44">
        <FieldLabel htmlFor={rangeId}>Date range</FieldLabel>
        <Select
          items={RANGE_ITEMS}
          value={custom ? CUSTOM : range.preset}
          disabled={change.isPending}
          onValueChange={(value) => {
            if (value === CUSTOM) {
              setCustomMode(true);

              return;
            }

            const preset = DATE_RANGE_PRESETS.find(
              (candidate) => candidate === value
            );

            if (preset === undefined) return;

            setCustomMode(false);
            setRangeError(null);
            save({ dateRange: { preset }, field });
          }}
        >
          <SelectTrigger id={rangeId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {custom ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={applyCustom}>
          <Field className="w-40">
            <FieldLabel htmlFor={fromId}>From</FieldLabel>
            <Input
              id={fromId}
              type="date"
              value={from}
              aria-invalid={rangeError !== null}
              aria-describedby={rangeError === null ? undefined : rangeErrorId}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field className="w-40">
            <FieldLabel htmlFor={toId}>To</FieldLabel>
            <Input
              id={toId}
              type="date"
              value={to}
              aria-invalid={rangeError !== null}
              aria-describedby={rangeError === null ? undefined : rangeErrorId}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary" loading={change.isPending}>
            Apply
          </Button>
          {rangeError === null ? null : (
            <FieldError id={rangeErrorId} className="basis-full">
              {rangeError}
            </FieldError>
          )}
        </form>
      ) : null}

      {field === null ? null : (
        <Field className="w-44">
          <FieldLabel htmlFor={fieldId}>{field.label}</FieldLabel>
          <Select
            items={[
              { value: "all", label: "All" },
              ...options.map((value) => ({ value, label: value })),
            ]}
            value={field.value ?? "all"}
            disabled={change.isPending}
            onValueChange={(value) => {
              if (value === null) return;

              save({
                dateRange: range,
                field: { ...field, value: value === "all" ? null : value },
              });
            }}
          >
            <SelectTrigger id={fieldId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {options.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {change.error === null ? null : (
        <div className="basis-full">
          <ChangeRefusal
            failure={{ kind: "change", error: change.error }}
            onReload={() => {
              change.reset();
              props.onReload();
            }}
          />
        </div>
      )}
    </div>
  );
}
