"use client";

import { Button, FieldError, Input } from "@genie/ui";
import type { ReactNode } from "react";

import type { ReadingField } from "../contract.ts";
import { CustomerField, type CustomerValue } from "./customer-field.tsx";
import {
  liveTagOf,
  ReviewFieldRow,
  type ReviewFieldKey,
  sourcesOf,
} from "./review-fields.tsx";
import type { DocumentReviewView } from "./views.ts";

/** The parts both review forms share: messages, the text and customer rows, the save bar. */

export const AMOUNT_MESSAGE =
  "Enter the amount as digits with up to two decimals, for example 5000.00.";

const SAVE_HELPER_ID = "review-save-helper";

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

    messages[field] = field === "amount" ? AMOUNT_MESSAGE : issue.message;
  }

  return messages;
}

type RowSelection = {
  readonly view: DocumentReviewView;
  readonly selected: ReviewFieldKey | null;
  readonly onSelect: (field: ReviewFieldKey) => void;
};

/** One editable text field with its live origin tag and its error (R-38, czjw.27). */
export function ReviewTextRow(
  props: RowSelection & {
    readonly field:
      | Exclude<ReadingField, "customer" | "dueDate">
      | "invoiceNumbers";
    readonly label: string;
    readonly value: string;
    /** The value the tag compares with the reading, when it differs from the text. */
    readonly tagValue?: string | readonly string[];
    readonly message: string | undefined;
    readonly onChange: (value: string) => void;
    readonly onBlur: () => void;
  }
): ReactNode {
  const { field, label, message } = props;
  const reading = props.view.reading;
  const id = `review-${field}`;

  return (
    <ReviewFieldRow
      field={field}
      label={label}
      tag={liveTagOf(reading, field, props.tagValue ?? props.value)}
      sources={sourcesOf(reading, field)}
      unread={reading === null}
      selected={props.selected === field}
      onSelect={() => props.onSelect(field)}
    >
      <div className="flex flex-col gap-1.5">
        <Input
          id={id}
          aria-label={label}
          type={field === "date" ? "date" : "text"}
          inputMode={field === "amount" ? "decimal" : "text"}
          value={props.value}
          aria-invalid={message === undefined ? undefined : true}
          aria-describedby={message === undefined ? undefined : `${id}-error`}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={props.onBlur}
        />
        {message === undefined ? null : (
          <FieldError id={`${id}-error`}>{message}</FieldError>
        )}
      </div>
    </ReviewFieldRow>
  );
}

/** The customer field: a stored customer or a confirmed new one (R-33). */
export function ReviewCustomerRow(
  props: RowSelection & {
    readonly label: string;
    readonly value: CustomerValue;
    readonly attempted: boolean;
    readonly onChange: (value: CustomerValue) => void;
  }
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
      <div className="flex flex-col gap-1.5">
        <CustomerField
          customers={view.customers}
          value={value}
          onChange={props.onChange}
        />
        {props.attempted && value.kind === "none" ? (
          <FieldError>Choose a customer to save.</FieldError>
        ) : null}
      </div>
    </ReviewFieldRow>
  );
}

/** The save button, `aria-disabled` with the reason it waits for, never `disabled` (DESIGN.md). */
export function ReviewSaveBar(props: {
  readonly helper: string | undefined;
  readonly pending: boolean;
  readonly label: string;
}): ReactNode {
  const { helper } = props;

  return (
    <>
      {helper === undefined ? null : (
        <p id={SAVE_HELPER_ID} className="text-xs text-muted-foreground">
          {helper}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          aria-disabled={helper === undefined ? undefined : true}
          aria-describedby={helper === undefined ? undefined : SAVE_HELPER_ID}
          loading={props.pending}
        >
          {props.label}
        </Button>
      </div>
    </>
  );
}
