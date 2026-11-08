"use client";

import { debounce } from "es-toolkit";
import { Building2Icon, FileTextIcon, SearchIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "../components/combobox.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "../components/input-group.tsx";
import { quickRanges } from "../parts/calendar-day.ts";
import { DateRangePicker } from "../parts/date-range-picker.tsx";
import type { ListFilterDefinition, ListOption } from "./definitions.ts";
import { dayRangeParam, LIST_CLEARED, readDayRange } from "./list-state.ts";

export type ListFilterControlProps = {
  readonly filter: ListFilterDefinition;
  /** The address value, as written. */
  readonly value: string | undefined;
  /** `undefined` clears the filter. */
  readonly onChange: (value: string | undefined) => void;
  /** The bar gives each control a fixed width; the sheet and More filters give the full width. */
  readonly place: "bar" | "sheet";
  /** The ISO day that the quick ranges count from. */
  readonly anchorDay?: string | undefined;
};

export type ListFilterControl = ComponentType<ListFilterControlProps>;

/**
 * The width of a control in the bar, in px, which `FilterBar` sums to fit the controls (LH27). A
 * registered kind takes the option width (`w-60`).
 */
export const barWidthOf = (kind: string) =>
  kind === "search" ? 256 : kind === "date-range" ? 288 : 240;

const ICONS = { building: Building2Icon, file: FileTextIcon } as const;

/** "All customers" names the many as "customers". */
const pluralOf = (filter: ListFilterDefinition) =>
  filter.placeholder.startsWith("All ")
    ? filter.placeholder.slice(4).toLowerCase()
    : filter.label.toLowerCase();

function SearchControl({
  filter,
  value,
  onChange,
  place,
}: ListFilterControlProps) {
  const [text, setText] = useState(value ?? "");
  const latest = useRef(onChange);

  useEffect(() => {
    latest.current = onChange;
  });

  const write = useMemo(
    () => debounce((next: string | undefined) => latest.current(next), 300),
    []
  );

  useEffect(() => () => write.cancel(), [write]);

  // Clear filters wins over a search still waiting for its pause.
  useEffect(() => {
    const drop = () => {
      write.cancel();
      setText("");
    };

    window.addEventListener(LIST_CLEARED, drop);

    return () => window.removeEventListener(LIST_CLEARED, drop);
  }, [write]);

  // Follow a search the address changed, such as Back, Clear filters or a shared link.
  useEffect(() => {
    setText((current) =>
      current.trim() === (value ?? "") ? current : (value ?? "")
    );
  }, [value]);

  return (
    <InputGroup className={place === "sheet" ? "w-full" : "w-64 shrink-0"}>
      <InputGroupInput
        type="search"
        value={text}
        aria-label={filter.label}
        placeholder={filter.placeholder}
        onChange={(event) => {
          setText(event.target.value);
          write(event.target.value.trim() || undefined);
        }}
      />
      <InputGroupAddon>
        <InputGroupText>
          <SearchIcon aria-hidden="true" />
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** The bar's trigger classes: the control border while empty, and its fixed width (czjw.102). */
const triggerOf = (place: "bar" | "sheet", set: boolean) =>
  ({
    variant: set ? "filter-set" : place === "bar" ? "filter" : "default",
    className: place === "sheet" ? "w-full" : "w-60 shrink-0",
  }) as const;

function TriggerText(props: {
  readonly filter: ListFilterDefinition;
  readonly text: string;
  readonly set: boolean;
  readonly place: "bar" | "sheet";
}) {
  const Icon =
    props.filter.icon === undefined ? undefined : ICONS[props.filter.icon];

  return (
    <span className="flex min-w-0 items-center gap-2">
      {Icon === undefined ? null : (
        <Icon aria-hidden="true" className="size-4 shrink-0" />
      )}
      {/* In the bar, the muted label and a semibold value (variant A, czjw.102). */}
      {/* The space keeps the visible text inside the accessible name (axe label-content-name-mismatch). */}
      {props.place === "bar" ? (
        <>
          <span className="shrink-0 font-normal text-muted-foreground">
            {props.filter.label}
          </span>{" "}
        </>
      ) : null}
      {/* Elsewhere the empty text is muted and regular (R-37a, czjw.65). */}
      <span
        className={
          props.place === "bar"
            ? "truncate font-semibold"
            : props.set
              ? "truncate"
              : "truncate font-normal text-muted-foreground"
        }
      >
        {props.text}
      </span>
    </span>
  );
}

function OptionPopup(props: { readonly filter: ListFilterDefinition }) {
  return (
    <ComboboxContent className="min-w-56">
      <div className="p-2">
        <ComboboxInput
          aria-label={`Search ${pluralOf(props.filter)}`}
          placeholder="Search"
        />
      </div>
      <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
      <ComboboxList>
        {(item: ListOption) => (
          <ComboboxItem key={item.value} value={item}>
            {item.label}
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );
}

/** One option of a list, with a search inside its popup. Its placeholder item clears it. */
function OptionControl({
  filter,
  value,
  onChange,
  place,
}: ListFilterControlProps) {
  const items: readonly ListOption[] = [
    { value: "", label: filter.placeholder },
    ...(filter.options ?? []),
  ];

  const selected = items.find((item) => item.value === (value ?? ""));
  const set = selected !== undefined && selected.value !== "";
  const text = selected?.label ?? filter.placeholder;

  return (
    <Combobox<ListOption>
      items={items}
      value={selected ?? null}
      onValueChange={(item) => onChange(item?.value || undefined)}
    >
      <ComboboxTrigger
        aria-label={`${filter.label}: ${text}`}
        {...triggerOf(place, set)}
      >
        <TriggerText filter={filter} text={text} set={set} place={place} />
      </ComboboxTrigger>
      <OptionPopup filter={filter} />
    </Combobox>
  );
}

/** Several options, written `a,b`. The trigger names one, or counts them. */
function MultiOptionControl({
  filter,
  value,
  onChange,
  place,
}: ListFilterControlProps) {
  const items = filter.options ?? [];
  const chosen = new Set(value?.split(",") ?? []);
  const selected = items.filter((item) => chosen.has(item.value));

  const text =
    selected.length === 0
      ? filter.placeholder
      : selected.length === 1
        ? (selected[0]?.label ?? filter.placeholder)
        : `${selected.length} ${pluralOf(filter)}`;

  return (
    <Combobox<ListOption, true>
      multiple
      items={items}
      value={selected}
      onValueChange={(next) =>
        onChange(next.map((item) => item.value).join(",") || undefined)
      }
    >
      <ComboboxTrigger
        aria-label={`${filter.label}: ${text}`}
        {...triggerOf(place, selected.length > 0)}
      >
        <TriggerText
          filter={filter}
          text={text}
          set={selected.length > 0}
          place={place}
        />
      </ComboboxTrigger>
      <OptionPopup filter={filter} />
    </Combobox>
  );
}

/** A date range, written `from..to`, with the quick ranges when the list gives an anchor day. */
function DateRangeControl({
  filter,
  value,
  onChange,
  place,
  anchorDay,
}: ListFilterControlProps) {
  const range = readDayRange(value);
  const set = range.from !== undefined || range.to !== undefined;

  return (
    <DateRangePicker
      label={filter.label}
      placeholder={filter.placeholder}
      value={range}
      onChange={(next) => onChange(dayRangeParam(next))}
      presets={anchorDay === undefined ? undefined : quickRanges(anchorDay)}
      variant={set ? "filter-set" : place === "bar" ? "filter" : "secondary"}
      inlineLabel={place === "bar"}
      className={place === "sheet" ? "w-full" : "w-72 shrink-0"}
    />
  );
}

export const BUILT_IN_CONTROLS: Readonly<
  Record<"search" | "option" | "multi-option" | "date-range", ListFilterControl>
> = {
  "search": SearchControl,
  "option": OptionControl,
  "multi-option": MultiOptionControl,
  "date-range": DateRangeControl,
};
