"use client";

import {
  Button,
  DatePicker,
  FieldError,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@genie/ui";
import { CheckIcon, InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import { currencyCode, type ReadingField } from "../contract.ts";
import { centsText } from "../services/reading/quote-check.ts";
import { CustomerField, type CustomerValue } from "./customer-field.tsx";
import { centsOfText, dayFromText, dayText, moneyText } from "./format.ts";
import {
  liveTagOf,
  ReviewFieldRow,
  type ReviewFieldKey,
  sourcesOf,
} from "./review-fields.tsx";
import type { DocumentReviewView } from "./views.ts";

/** The parts both review forms share: messages, the text and customer rows, the save bar. */

export const AMOUNT_MESSAGE =
  "Enter the amount as digits with up to two decimals, for example 5,000.00.";

export const DATE_MESSAGE = "Write the date as 26 Oct 2026.";

const SAVE_HELPER_ID = "review-save-helper";

/**
 * A typed value as the reading stores it, so the origin tag and the save compare like with like:
 * an amount as "5000.00", a day as ISO. Text that does not read stays as typed, so the save
 * schema reports it.
 */
export function readingTextOf(field: ReadingField, text: string): string {
  if (field === "amount") {
    const cents = centsOfText(text);

    return cents === undefined ? text : centsText(cents);
  }

  if (field === "date" || field === "dueDate") return dayFromText(text) ?? text;

  return text;
}

/** The read value as the review's input shows it: days and amounts in the app's format. */
export function inputTextOf(field: ReadingField, text: string): string {
  if (field === "amount") return moneyText(text);

  if (field === "date" || field === "dueDate") return dayText(text);

  return text;
}

/** The currency beside an amount input, once the currency field holds a code. */
export function CurrencyAddon(props: { readonly currency: string }): ReactNode {
  const code = props.currency.trim().toUpperCase();

  return currencyCode.safeParse(code).success ? (
    <InputGroupAddon>{code}</InputGroupAddon>
  ) : null;
}

export function optionalText(value: string): string | null {
  const text = value.trim();

  return text === "" ? null : text;
}

/** One message per form field from a save schema's issues; an amount gets the amount sentence. */
export function issuesOf<F extends string>(
  issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[],
  fieldOf: (key: string) => F | undefined
): Partial<Record<F, string>> {
  const messages: Partial<Record<F, string>> = {};

  for (const issue of issues) {
    const field = fieldOf(String(issue.path[0] ?? ""));

    if (field === undefined || messages[field] !== undefined) continue;

    messages[field] =
      field === "amount"
        ? AMOUNT_MESSAGE
        : field === "date"
          ? DATE_MESSAGE
          : issue.message;
  }

  return messages;
}

type RowSelection = {
  readonly view: DocumentReviewView;
  readonly selected: ReviewFieldKey | null;
  readonly onSelect: (field: ReviewFieldKey) => void;
};

type TextField =
  | Exclude<ReadingField, "customer" | "dueDate">
  | "invoiceNumbers";

type TextInputProps = {
  readonly field: TextField;
  readonly label: string;
  readonly value: string;
  readonly message: string | undefined;
  /** The currency the amount input shows beside its figure. */
  readonly currency?: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
};

/** The control of one text field and its error: a date picker, an amount with its currency, or text. */
export function ReviewTextInput(props: TextInputProps): ReactNode {
  const { field, label, message } = props;
  const id = `review-${field}`;

  const control = {
    id,
    "aria-label": label,
    "type": "text",
    "inputMode": field === "amount" ? ("decimal" as const) : ("text" as const),
    "value": props.value,
    "placeholder": props.placeholder,
    "aria-invalid": message === undefined ? undefined : true,
    "aria-describedby": message === undefined ? undefined : `${id}-error`,
    "onChange": (event: { readonly target: { readonly value: string } }) =>
      props.onChange(event.target.value),
    // A day or an amount that reads takes the app's format when the person leaves it (4.4, 4.5).
    "onBlur": () => {
      if (field !== "invoiceNumbers") {
        const shown = inputTextOf(field, props.value);

        if (shown !== props.value) props.onChange(shown);
      }

      props.onBlur();
    },
  };

  return (
    <div className="flex flex-col gap-1.5">
      {field === "amount" ? (
        <InputGroup>
          <CurrencyAddon currency={props.currency ?? ""} />
          <InputGroupInput {...control} />
        </InputGroup>
      ) : field === "date" ? (
        <DatePicker
          id={id}
          aria-label={label}
          placeholder="DD Mon YYYY"
          pickLabel={`Choose the ${label.toLowerCase()}`}
          value={props.value}
          aria-invalid={control["aria-invalid"]}
          aria-describedby={control["aria-describedby"]}
          onValueChange={props.onChange}
          onBlur={props.onBlur}
        />
      ) : (
        <Input {...control} />
      )}
      {message === undefined ? null : (
        <FieldError id={`${id}-error`}>{message}</FieldError>
      )}
    </div>
  );
}

/** One editable text field with its live origin tag and its error (R-38, czjw.27). */
export function ReviewTextRow(
  props: RowSelection &
    TextInputProps & {
      /** The value the tag compares with the reading, when it differs from the text. */
      readonly tagValue?: string | readonly string[];
    }
): ReactNode {
  const { field, label } = props;
  const reading = props.view.reading;

  return (
    <ReviewFieldRow
      field={field}
      label={label}
      tag={liveTagOf(
        reading,
        field,
        props.tagValue ??
          (field === "invoiceNumbers"
            ? props.value
            : readingTextOf(field, props.value))
      )}
      sources={sourcesOf(reading, field)}
      unread={reading === null}
      selected={props.selected === field}
      onSelect={() => props.onSelect(field)}
    >
      <ReviewTextInput {...props} />
    </ReviewFieldRow>
  );
}

type CustomerInputProps = {
  readonly view: DocumentReviewView;
  readonly value: CustomerValue;
  readonly attempted: boolean;
  readonly onChange: (value: CustomerValue) => void;
};

/** The customer control and its error: a stored customer or a confirmed new one (R-33). */
export function ReviewCustomerInput(props: CustomerInputProps): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <CustomerField
        customers={props.view.customers}
        value={props.value}
        onChange={props.onChange}
      />
      {props.attempted && props.value.kind === "none" ? (
        <FieldError>Choose a customer to save.</FieldError>
      ) : null}
    </div>
  );
}

/** The customer field with its live origin tag (R-33). */
export function ReviewCustomerRow(
  props: RowSelection & CustomerInputProps & { readonly label: string }
): ReactNode {
  const { view, value } = props;

  return (
    <ReviewFieldRow
      field="customer"
      label={props.label}
      tag={liveTagOf(
        view.reading,
        "customer",
        value.kind === "none" ? null : value.name
      )}
      sources={sourcesOf(view.reading, "customer")}
      unread={view.reading === null}
      selected={props.selected === "customer"}
      onSelect={() => props.onSelect("customer")}
    >
      <ReviewCustomerInput {...props} />
    </ReviewFieldRow>
  );
}

/**
 * The reason Save waits for, or "Ready to save", on its own line right above Discard and Save, in
 * one bar that stays on screen (design review 4.6, czjw.98): fixed at the bottom below `md`, where
 * the shell keeps the page clear of it, and sticky from `md`. The shell's scroll area pads its
 * bottom by 2 rem (`pb-8`), and a sticky box stops at that padding edge, so the bar sticks 2 rem
 * lower to meet the window bottom. Save is `aria-disabled` with its reason, never `disabled`
 * (DESIGN.md), and the reason reads at Save's own size and color (czjw.65).
 */
export function ReviewSaveBar(props: {
  /** Null shows "Ready to save". */
  readonly reason: string | null;
  readonly pending: boolean;
  readonly label: string;
  readonly discarding: boolean;
  /** Null hides Discard. */
  readonly onDiscard: (() => void) | null;
}): ReactNode {
  const { reason } = props;

  return (
    <div
      data-shell-bottom-bar=""
      className="z-10 flex flex-col gap-2 border-t border-border bg-card px-4 py-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 md:sticky md:-bottom-8"
    >
      {reason === null ? (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CheckIcon aria-hidden className="size-4 shrink-0" />
          Ready to save
        </p>
      ) : (
        <p
          id={SAVE_HELPER_ID}
          className="flex min-w-0 items-start gap-1.5 text-sm text-foreground"
        >
          <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{reason}</span>
        </p>
      )}
      <div className="flex items-center gap-2">
        {props.onDiscard === null ? null : (
          <Button
            type="button"
            variant="secondary"
            loading={props.discarding}
            onClick={props.onDiscard}
          >
            Discard
          </Button>
        )}
        <Button
          type="submit"
          className="ml-auto"
          aria-disabled={reason === null ? undefined : true}
          aria-describedby={reason === null ? undefined : SAVE_HELPER_ID}
          loading={props.pending}
        >
          {props.label}
        </Button>
      </div>
    </div>
  );
}
