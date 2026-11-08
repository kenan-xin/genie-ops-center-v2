"use client";

import { CalendarIcon } from "lucide-react";
import { useRef, useState, type ComponentProps } from "react";

import { Calendar } from "../components/calendar.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../components/input-group.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/popover.tsx";
import {
  dateOfDay,
  dayFromText,
  dayOfDate,
  formatDay,
} from "./calendar-day.ts";

export type DatePickerProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "size"
> & {
  /** The field's text: a day in the app format, an ISO day, or what the person typed. */
  readonly value: string;
  readonly onValueChange: (text: string) => void;
  /** The calendar button's name, for example "Choose the due date". */
  readonly pickLabel: string;
};

/**
 * One date field (owner I8, the shadcn picker-with-input pattern): a text field with a calendar
 * button. Leaving the field rewrites a readable day in the app format, and text that does not read
 * stays, so the form can refuse it. ArrowDown or the button opens the calendar on the field's
 * month. A pick writes the day, closes the calendar and returns focus to the field. `id`,
 * `placeholder` and every `aria-*` prop land on the input, where a label finds the field.
 */
export function DatePicker({
  value,
  onValueChange,
  pickLabel,
  onBlur,
  onKeyDown,
  disabled,
  className,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const day = dayFromText(value);
  const selected = day === null ? undefined : dateOfDay(day);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <InputGroup ref={group} className={className}>
        <InputGroupInput
          ref={field}
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          onBlur={(event) => {
            if (day !== null && formatDay(day) !== value)
              onValueChange(formatDay(day));

            onBlur?.(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }

            onKeyDown?.(event);
          }}
          {...props}
        />
        <InputGroupAddon align="inline-end">
          <PopoverTrigger
            disabled={disabled}
            render={<InputGroupButton aria-label={pickLabel} />}
          >
            <CalendarIcon aria-hidden="true" />
          </PopoverTrigger>
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent
        // Under the whole field, not the icon button (czjw.101).
        anchor={group}
        align="start"
        collisionPadding={8}
        className="w-auto"
        aria-label={pickLabel}
        // The calendar focuses its own day; the field takes focus back on close.
        initialFocus={false}
        finalFocus={field}
      >
        <Calendar
          mode="single"
          autoFocus
          {...(selected && { selected, defaultMonth: selected })}
          onSelect={(date) => {
            if (date === undefined) return;

            onValueChange(formatDay(dayOfDate(date)));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
