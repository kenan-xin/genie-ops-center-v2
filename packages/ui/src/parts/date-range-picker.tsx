"use client";

import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { differenceInCalendarDays } from "date-fns";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "../components/button.tsx";
import { Calendar } from "../components/calendar.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/popover.tsx";
import {
  dateOfDay,
  dayOfDate,
  formatDay,
  formatDayRange,
  type QuickRange,
} from "./calendar-day.ts";

/** ISO days. Either end can be missing. */
export type DayRange = {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
};

export type DateRangePickerProps = {
  readonly "id"?: string;
  /** The field's name, for example "Invoice date". */
  readonly "label": string;
  /** The trigger text with no range, for example "Any invoice date". */
  readonly "placeholder": string;
  readonly "value": DayRange;
  readonly "onChange": (range: DayRange) => void;
  readonly "disabled"?: boolean | undefined;
  readonly "aria-invalid"?: boolean | undefined;
  readonly "aria-describedby"?: string | undefined;
  /** Ranges one click sets, for example `quickRanges(today)` (LH25). */
  readonly "presets"?: readonly QuickRange[] | undefined;
  /** Classes of the trigger, for its width. Its height is the field height. */
  readonly "className"?: string | undefined;
  /** `filter-set` tints a list filter that holds a range (R-37a). */
  readonly "variant"?: "secondary" | "filter-set" | undefined;
};

/**
 * The first pick starts a range; the second ends it, in day order. A range with only one end, such
 * as an end day from a list address, is completed by the next pick.
 */
function nextRange(range: DayRange, day: string): DayRange {
  const end = range.from === undefined ? range.to : range.from;

  if (end === undefined || (range.from !== undefined && range.to !== undefined))
    return { from: day };

  return day < end ? { from: day, to: end } : { from: end, to: day };
}

/**
 * One date range filter (owner I8, list filter prototype C): a button with the range or the
 * placeholder, named "<label>: <range>". Its popover holds a range calendar (two months from `md`),
 * a footer line with the day count, Clear and Done. Each pick calls `onChange`, and Done closes and
 * returns focus to the button.
 */
export function DateRangePicker({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  presets,
  className,
  variant = "secondary",
  ...aria
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 768px)", { noSsr: true });
  const { from, to } = value;

  const text =
    from === undefined
      ? to === undefined
        ? placeholder
        : `Until ${formatDay(to)}`
      : to === undefined
        ? `From ${formatDay(from)}`
        : formatDayRange(from, to);

  const footer =
    from === undefined
      ? "pick the start date"
      : to === undefined
        ? "pick the end date"
        : `${differenceInCalendarDays(dateOfDay(to), dateOfDay(from)) + 1} days`;

  // An end-only range marks its one day, so the calendar opens on it.
  const start = dateOfDay(from ?? to ?? "");
  const known = from !== undefined || to !== undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        {...(id === undefined ? {} : { id })}
        {...aria}
        disabled={disabled}
        aria-label={`${label}: ${text}`}
        render={
          <Button
            variant={variant}
            // The field height, as every field beside it (6wz1.94).
            size="filter"
            className={`w-full ${className ?? ""}`}
          />
        }
      >
        <CalendarIcon aria-hidden="true" />
        {/* A placeholder is muted and regular, a range set (R-37a). */}
        <span
          className={
            known
              ? "flex-1 truncate text-left"
              : "flex-1 truncate text-left font-normal text-muted-foreground"
          }
        >
          {text}
        </span>
        <ChevronDownIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        className="w-auto"
        aria-label={label}
        initialFocus={false}
      >
        {presets === undefined ? null : (
          <div
            role="group"
            aria-label="Quick ranges"
            className="flex flex-wrap gap-1.5 border-b border-border pb-2.5"
          >
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant={
                  from === preset.from && to === preset.to
                    ? "filter-set"
                    : "secondary"
                }
                size="sm"
                aria-pressed={from === preset.from && to === preset.to}
                onClick={() => onChange({ from: preset.from, to: preset.to })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        )}
        <Calendar
          mode="range"
          autoFocus
          numberOfMonths={wide ? 2 : 1}
          {...(known && {
            selected: {
              from: start,
              to: to === undefined ? undefined : dateOfDay(to),
            },
            defaultMonth: start,
          })}
          onSelect={(_, picked) =>
            onChange(nextRange(value, dayOfDate(picked)))
          }
        />
        <div className="flex items-center gap-2 border-t border-border pt-2.5">
          <p
            className="flex-1 text-sm text-muted-foreground"
            aria-live="polite"
          >
            {known ? (
              <>
                <span className="font-semibold text-foreground">{text}</span>
                {` · ${footer}`}
              </>
            ) : (
              placeholder
            )}
          </p>
          <Button variant="link" size="sm" onClick={() => onChange({})}>
            Clear
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
