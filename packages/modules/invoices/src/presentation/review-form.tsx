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

import {
  currencyCode,
  type ReadingField,
  type StoredReading,
} from "../contract.ts";
import { centsText } from "../services/reading/quote-check.ts";
import { CustomerField, type CustomerValue } from "./customer-field.tsx";
import { centsOfText, dayFromText, dayText, moneyText } from "./format.ts";
import type { FieldCheck } from "./review-blocker.ts";
import { liveTagOf, sourcesOf } from "./review-fields.tsx";
import type { ReviewItem } from "./review-model.ts";
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

export type TextField =
  | Exclude<ReadingField, "customer" | "dueDate">
  | "invoiceNumbers";

export const CHECK_NOTE =
  "The quote read for this field is not in the page text, so its value was dropped. Enter it from the page.";

const BLANK_NOTE = "Not on the document. It stays blank unless you add it.";

const BLANK_PLACEHOLDER = "Not stated. Leave blank or add it.";

const OPTIONAL_FIELDS: ReadonlySet<TextField> = new Set([
  "paymentTerms",
  "description",
  "reference",
  "method",
]);

/** Moves the focus to a control once the change that draws it has rendered. */
export function focusSoon(id: string): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

/** One text field as a review card: its tag, its value read before an edit, Undo and its note (czjw.98). */
export function textItemOf(input: {
  readonly reading: StoredReading | null;
  readonly field: TextField;
  readonly label: string;
  readonly value: string;
  /** The value the tag compares with the reading. */
  readonly tagValue: string | readonly string[];
  /** The read value as the input shows it; undefined when nothing was read. */
  readonly readText: string | undefined;
  /** The control, with the placeholder of a blank optional field. */
  readonly control: (placeholder: string | undefined) => ReactNode;
  readonly onUndo: () => void;
}): ReviewItem {
  const { reading, field, value } = input;
  const tag = liveTagOf(reading, field, input.tagValue);

  const blank =
    tag === "not-on-document" &&
    value.trim() === "" &&
    OPTIONAL_FIELDS.has(field);

  return {
    key: field,
    label: input.label,
    tag,
    sources: sourcesOf(reading, field),
    control: input.control(blank ? BLANK_PLACEHOLDER : undefined),
    controlId: `review-${field}`,
    display: value.trim() === "" ? "None" : value,
    readAs:
      tag === "corrected" && input.readText !== undefined
        ? input.readText
        : null,
    onUndo: () => {
      input.onUndo();
      focusSoon(`review-${field}`);
    },
    note: tag === "check-this" ? CHECK_NOTE : blank ? BLANK_NOTE : null,
  };
}

/** The customer's card, and what blocks its save. */
export type CustomerReview = {
  readonly item: ReviewItem;
  readonly check: FieldCheck;
};

/** The customer as a review card, and what blocks its save (R-33, czjw.98). */
export function customerItemOf(input: {
  readonly reading: StoredReading | null;
  readonly label: string;
  readonly value: CustomerValue;
  readonly control: ReactNode;
  readonly onUndo: () => void;
}): CustomerReview {
  const { reading, label, value } = input;

  const tag = liveTagOf(
    reading,
    "customer",
    value.kind === "none" ? null : value.name
  );

  return {
    item: {
      key: "customer",
      label,
      tag,
      sources: sourcesOf(reading, "customer"),
      control: input.control,
      controlId: "review-customer",
      display: value.kind === "none" ? "None" : value.name,
      readAs:
        tag === "corrected" ? (reading?.fields.customer?.value ?? null) : null,
      onUndo: () => {
        input.onUndo();
        focusSoon("review-customer");
      },
      note: tag === "check-this" ? CHECK_NOTE : null,
    },
    check: {
      key: "customer",
      label,
      empty: false,
      issue:
        value.kind === "none"
          ? "Choose a customer to save."
          : value.kind === "new" && !value.confirmed
            ? "Confirm the new customer to save."
            : undefined,
    },
  };
}

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
