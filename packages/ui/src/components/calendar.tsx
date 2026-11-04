"use client";

import { cn } from "cn";
import { format } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";
import {
  DayButton,
  DayPicker,
  type DayButtonProps,
  type Modifiers,
} from "react-day-picker";

import { focusRing } from "../theme/tokens.ts";
import { buttonVariants } from "./button-variants.ts";

/*
 * The shadcn Calendar (`@shadcn/calendar`, base-nova), fitted to this repository: Monday first and
 * no days of the next or last month, as the list filter prototype draws it. A day is 44 px under
 * `lg` and 36 px from `lg` (DESIGN.md, Do's), and it keeps the one focus ring. Below `sm` a day is
 * 40 px wide and 44 px high, so a month fits a 320 px phone. The day buttons are
 * the library's own, so its focus handling and day names stay, and `data-day` holds the ISO day,
 * which the e2e helpers find. The month dropdowns and the right-to-left rules are left out until a
 * screen needs them.
 */

const navButton = cn(
  buttonVariants({ variant: "secondary", size: "icon" }),
  focusRing,
  "aria-disabled:opacity-50"
);

/**
 * The library's day name reads "Sunday, November 1st, 2026", which does not hold the "1" the
 * button shows (WCAG 2.5.3, axe `label-content-name-mismatch`). Day first, as the app writes a day.
 */
function labelDayButton(date: Date, modifiers: Modifiers) {
  const name = format(date, "EEEE d MMMM yyyy");

  return `${modifiers.today ? "Today, " : ""}${name}${modifiers.selected ? ", selected" : ""}`;
}

function Calendar({
  className,
  classNames,
  labels,
  showOutsideDays = false,
  weekStartsOn = 1,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      data-slot="calendar"
      labels={{ labelDayButton, ...labels }}
      showOutsideDays={showOutsideDays}
      weekStartsOn={weekStartsOn}
      className={cn("w-fit", className)}
      classNames={{
        months: "relative flex flex-col gap-4 md:flex-row",
        month: "flex flex-col gap-2",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: navButton,
        button_next: navButton,
        month_caption: "flex h-11 items-center justify-center px-12 lg:h-10",
        caption_label: "text-sm font-medium select-none",
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday:
          "w-10 text-xs font-normal text-muted-foreground select-none sm:w-11 lg:w-9",
        week: "mt-1 flex",
        day: "p-0 text-center",
        range_start: "rounded-l-lg bg-primary/10",
        range_middle: "bg-primary/10",
        range_end: "rounded-r-lg bg-primary/10",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeftIcon aria-hidden="true" />
          ) : (
            <ChevronRightIcon aria-hidden="true" />
          ),
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  day,
  modifiers,
  className: _libraryClass,
  ...props
}: DayButtonProps) {
  const single =
    modifiers.selected === true &&
    modifiers.range_start !== true &&
    modifiers.range_end !== true &&
    modifiers.range_middle !== true;

  return (
    <DayButton
      {...props}
      day={day}
      modifiers={modifiers}
      data-day={format(day.date, "yyyy-MM-dd")}
      data-today={modifiers.today === true || undefined}
      data-selected-single={single || undefined}
      data-range-start={modifiers.range_start === true || undefined}
      data-range-end={modifiers.range_end === true || undefined}
      data-range-middle={modifiers.range_middle === true || undefined}
      className={cn(
        focusRing,
        "inline-flex h-11 w-10 items-center justify-center rounded-lg text-sm text-foreground select-none hover:bg-muted disabled:opacity-50 data-range-end:bg-primary data-range-end:text-primary-foreground data-range-middle:rounded-none data-range-middle:text-primary data-range-middle:hover:bg-transparent dark:data-range-middle:text-brand-on-dark data-range-start:bg-primary data-range-start:text-primary-foreground data-selected-single:bg-primary data-selected-single:text-primary-foreground data-today:font-semibold data-today:underline data-today:underline-offset-4 motion-safe:transition-colors sm:w-11 lg:size-9"
      )}
    />
  );
}

export { Calendar };
