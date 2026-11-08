"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import { DatePicker, RadioGroup, RadioGroupItem, WarningNote } from "@genie/ui";
import { useForm, useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode, type RefObject } from "react";

import {
  invoicesContract,
  type DueDateSource,
  type ReadingField,
  type SaveInvoiceInput,
  type SaveInvoiceOutput,
  saveInvoiceInput,
  type SavePaidReceiptInput,
  type SavePaidReceiptOutput,
  savePaidReceiptInput,
  type StoredReading,
} from "../contract.ts";
import {
  customerChoiceOf,
  initialCustomer,
  type CustomerValue,
} from "./customer-field.tsx";
import { centsOfText, dayFromText, dayText, formatDay } from "./format.ts";
import { DuplicateNotice, SaveFailure } from "./review-alerts.tsx";
import {
  type Blocker,
  FALLBACK_REASON,
  type FieldCheck,
  firstFieldBlocker,
} from "./review-blocker.ts";
import {
  FIELDS_OF,
  liveTagOf,
  type OriginTagKind,
  sourcesOf,
} from "./review-fields.tsx";
import {
  customerItemOf,
  focusSoon,
  inputTextOf,
  issuesOf,
  optionalText,
  readingTextOf,
  ReviewCustomerInput,
  ReviewTextInput,
  textItemOf,
} from "./review-form.tsx";
import type { ReviewItem, ReviewModel } from "./review-model.ts";
import type { DocumentReviewView } from "./views.ts";

const DOCUMENTS_QUERY = ["invoices", "documents"] as const;

export type DueChoice =
  | { readonly kind: "kept"; readonly value: string }
  | { readonly kind: "person"; readonly value: string }
  | { readonly kind: "unspecified" }
  | { readonly kind: "none" };

type FormValues = {
  readonly customer: CustomerValue;
  readonly due: DueChoice;
  readonly number: string;
  readonly date: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentTerms: string;
  readonly description: string;
  readonly reference: string;
  readonly method: string;
};

type DueInput = {
  readonly dueDate: string | null;
  readonly dueDateSource: DueDateSource;
};

type FormIssues = Partial<Record<keyof FormValues, string>>;

/** The values of a save before it is checked; an invalid draft still parses and reports its issue. */
type SaveDraft = {
  readonly documentId: string;
  readonly customer: SaveInvoiceInput["customer"] | undefined;
  readonly number: string;
  readonly currency: string;
  readonly totalCents: number | undefined;
  readonly description: string | null;
  readonly keepPossibleDuplicate: boolean;
  readonly dueDate: string | null;
  readonly dueDateSource: DueDateSource;
  readonly invoiceDate?: string;
  readonly paymentTerms?: string | null;
  readonly date?: string;
  readonly reference?: string | null;
  readonly method?: string | null;
};

type SendAnswer = SaveInvoiceOutput | SavePaidReceiptOutput;

function initialValues(view: DocumentReviewView): FormValues {
  const reading = view.reading;

  const text = (field: ReadingField) =>
    inputTextOf(field, reading?.fields[field]?.value ?? "");

  return {
    customer: initialCustomer(view),
    due: initialDue(reading),
    number: text("number"),
    date: text("date"),
    amount: text("amount"),
    currency: text("currency"),
    paymentTerms: text("paymentTerms"),
    description: text("description"),
    reference: text("reference"),
    method: text("method"),
  };
}

function initialDue(reading: StoredReading | null): DueChoice {
  const dueDate = reading?.fields.dueDate?.value;

  return dueDate === undefined
    ? { kind: "none" }
    : { kind: "kept", value: dayText(dueDate) };
}

/**
 * A paid receipt is paid in full at once, so its review asks no due date (R-28, czjw.72): a read
 * due date stays the document's, and a missing one saves as unspecified. It is derived, never held
 * in the form, so a switch of the type to Invoice brings back the person's own choice.
 */
function receiptDue(reading: StoredReading | null): DueChoice {
  const dueDate = reading?.fields.dueDate?.value;

  return dueDate === undefined
    ? { kind: "unspecified" }
    : { kind: "kept", value: dayText(dueDate) };
}

/** The due choice that a save of this kind sends. */
function dueChoiceOf(
  kind: "invoice" | "paid-receipt",
  reading: StoredReading | null,
  due: DueChoice
): DueChoice {
  return kind === "paid-receipt" ? receiptDue(reading) : due;
}

function dueOf(due: DueChoice): DueInput {
  switch (due.kind) {
    case "kept":
      return {
        dueDate: readingTextOf("dueDate", due.value),
        dueDateSource: "document",
      };
    case "person":
      return {
        dueDate:
          due.value.trim() === "" ? null : readingTextOf("dueDate", due.value),
        dueDateSource: "person",
      };
    case "unspecified":
      return { dueDate: null, dueDateSource: "unspecified" };
    case "none":
      return { dueDate: null, dueDateSource: "person" };
  }
}

function dueText(due: DueChoice): string | null {
  return due.kind === "kept" || due.kind === "person" ? due.value : null;
}

/** The due date picker; a day that reads takes the app's format when the person leaves it (4.4, I8). */
function dueDateInput(value: string, set: (value: string) => void): ReactNode {
  return (
    <DatePicker
      id="review-due-date"
      aria-label="Due date"
      placeholder="DD Mon YYYY"
      pickLabel="Choose the due date"
      value={value}
      onValueChange={set}
    />
  );
}

function buildInput(
  kind: "invoice" | "paid-receipt",
  view: DocumentReviewView,
  values: FormValues,
  keep: boolean
): SaveDraft {
  const choice = dueOf(dueChoiceOf(kind, view.reading, values.due));

  const common = {
    documentId: view.document.id,
    customer: customerChoiceOf(values.customer),
    number: values.number,
    currency: values.currency,
    totalCents: centsOfText(values.amount),
    description: optionalText(values.description),
    keepPossibleDuplicate: keep,
    ...choice,
  };

  return kind === "invoice"
    ? {
        ...common,
        invoiceDate: readingTextOf("date", values.date),
        paymentTerms: optionalText(values.paymentTerms),
      }
    : {
        ...common,
        date: readingTextOf("date", values.date),
        reference: optionalText(values.reference),
        method: optionalText(values.method),
      };
}

const FORM_FIELDS = [
  "number",
  "date",
  "amount",
  "currency",
  "paymentTerms",
  "description",
  "reference",
  "method",
] as const satisfies readonly (keyof FormValues)[];

function isFormField(value: string): value is (typeof FORM_FIELDS)[number] {
  return FORM_FIELDS.some((field) => field === value);
}

function formFieldOf(key: string): (typeof FORM_FIELDS)[number] | undefined {
  if (key === "totalCents") return "amount";

  if (key === "invoiceDate") return "date";

  return isFormField(key) ? key : undefined;
}

/** One message per field from the save schema over the current values (R-28, R-33). */
function formIssues(
  kind: "invoice" | "paid-receipt",
  view: DocumentReviewView,
  values: FormValues
): { readonly ok: boolean; readonly fields: FormIssues } {
  const schema = kind === "invoice" ? saveInvoiceInput : savePaidReceiptInput;
  const parsed = schema.safeParse(buildInput(kind, view, values, false));

  return parsed.success
    ? { ok: true, fields: {} }
    : { ok: false, fields: issuesOf(parsed.error.issues, formFieldOf) };
}

function savedMessage(
  kind: "invoice" | "paid-receipt",
  saved: { readonly number: string; readonly dueDate: string | null }
): string {
  if (kind === "paid-receipt") {
    return `${saved.number} saved as a paid receipt: one invoice, one payment and one link.`;
  }

  return saved.dueDate === null
    ? `${saved.number} saved as unpaid, with no due date.`
    : `${saved.number} saved as unpaid, due ${formatDay(saved.dueDate)}.`;
}

/** The due date's origin tag: a paid receipt's own, or the person's choice of an invoice (czjw.98). */
export function dueTagOf(
  kind: "invoice" | "paid-receipt",
  reading: StoredReading | null,
  due: DueChoice
): OriginTagKind {
  if (kind === "paid-receipt") {
    const read = reading?.fields.dueDate;

    return read === undefined
      ? "paid-in-full"
      : liveTagOf(reading, "dueDate", read.value);
  }

  if (due.kind === "unspecified") return "unspecified";

  const day = dayFromText(dueText(due)?.trim() ?? "");

  return day === null ? "needs-input" : liveTagOf(reading, "dueDate", day);
}

function dueDisplay(kind: "invoice" | "paid-receipt", due: DueChoice): string {
  if (due.kind === "unspecified")
    return kind === "paid-receipt" ? "None, paid in full" : "Unspecified";

  const day = dayFromText(dueText(due)?.trim() ?? "");

  return day === null ? "Not set" : formatDay(day);
}

/** What blocks the due date of an invoice, and the control Save focuses (czjw.65, P09-11). */
function dueCheck(reading: StoredReading | null, due: DueChoice): FieldCheck {
  const typed = dueText(due)?.trim() ?? "";
  const base = { key: "dueDate", label: "Due date", empty: false } as const;

  if (due.kind === "unspecified" || dayFromText(typed) !== null)
    return { ...base, issue: undefined };

  if (typed !== "")
    return {
      ...base,
      issue: "Write the due date as 25 Nov 2026 to save.",
      focusId: "review-due-date",
    };

  if (reading?.fields.dueDate === undefined)
    return {
      ...base,
      issue: "Choose a due date or mark it unspecified to save.",
      focusId: due.kind === "person" ? "review-due-date" : "review-due-person",
    };

  return {
    ...base,
    issue: "Enter a due date to save.",
    focusId: "review-due-date",
  };
}

/**
 * The invoice or paid-receipt review as a model of cards, Save and what blocks it (R-28, R-33,
 * R-38, czjw.98). The form keeps values and touched state only; each render parses the values, so
 * a reading that lands later fills the fields and no message goes stale.
 */
export function useInvoiceReview(input: {
  readonly view: DocumentReviewView;
  readonly kind: "invoice" | "paid-receipt";
  readonly revealRef: RefObject<((blocker: Blocker) => void) | null>;
  readonly onSaved: (message: string) => void;
  readonly onDiscard: () => void;
}): ReviewModel {
  const { view, kind } = input;
  const reading = view.reading;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();

  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  const form = useForm({
    defaultValues: initialValues(view),
    // The Keep choice rides on one submit only, so a refused Keep never reaches the next save.
    onSubmitMeta: { keep: false },
    onSubmit: ({ value, meta }) => send(value, meta.keep),
  });

  const live = useSelector(form.store, (state) => state.values);

  // Once saved, the cards show what was sent, not a field typed while the save was pending.
  const [savedValues, setSavedValues] = useState<FormValues | null>(null);

  const values = savedValues ?? live;

  async function send(value: FormValues, keep: boolean) {
    const parsed =
      kind === "invoice"
        ? saveInvoiceInput.safeParse(buildInput(kind, view, value, keep))
        : savePaidReceiptInput.safeParse(buildInput(kind, view, value, keep));

    if (!parsed.success) {
      setAttempted(true);

      return;
    }

    setPending(true);
    setSaveError(null);

    try {
      // SAFETY: the schema parsed above is chosen by `kind`, so its data matches that procedure's input.
      const answer: SendAnswer =
        kind === "invoice"
          ? await invoices.saveInvoice(parsed.data as SaveInvoiceInput)
          : await invoices.savePaidReceipt(parsed.data as SavePaidReceiptInput);

      if (answer.outcome === "possible-duplicate") {
        setDuplicate(answer.duplicateOf);

        return;
      }

      setDuplicate(null);
      setSavedValues(value);
      input.onSaved(savedMessage(kind, parsed.data));
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY });
    } catch (error) {
      setDuplicate(null);

      const message =
        error instanceof Error ? error.message : "The save failed.";

      setSaveError(`${view.document.label} was not saved. ${message}`);
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY });
    } finally {
      setPending(false);
    }
  }

  const issues = formIssues(kind, view, values);
  const first = initialValues(view);

  const customer = customerItemOf({
    reading,
    label: FIELDS_OF[kind][0].label,
    value: values.customer,
    control: (
      <form.Field name="customer">
        {(field) => (
          <ReviewCustomerInput
            view={view}
            value={field.state.value}
            attempted={attempted}
            onChange={(next) => field.handleChange(next)}
          />
        )}
      </form.Field>
    ),
    onUndo: () => form.setFieldValue("customer", first.customer),
  });

  const dueItem = (label: string): ReviewItem => {
    const readDue = reading?.fields.dueDate;
    const sent = dueChoiceOf(kind, reading, values.due);
    const tag = dueTagOf(kind, reading, sent);

    let control: ReactNode;

    // A receipt paid in full says so once, in its tag; a due date it states shows read-only.
    if (kind === "paid-receipt") {
      control =
        readDue === undefined ? null : (
          <p className="text-sm text-foreground">{formatDay(readDue.value)}</p>
        );
    } else {
      control = (
        <form.Field name="due">
          {(field) => (
            <DueControl
              reading={reading}
              due={field.state.value}
              onChange={(next) => field.handleChange(next)}
            />
          )}
        </form.Field>
      );
    }

    return {
      key: "dueDate",
      label,
      tag,
      sources: sourcesOf(reading, "dueDate"),
      control,
      controlId:
        kind === "invoice" && readDue !== undefined ? "review-due-date" : null,
      display: dueDisplay(kind, sent),
      readAs:
        tag === "corrected" && readDue !== undefined
          ? dayText(readDue.value)
          : null,
      onUndo: () => {
        form.setFieldValue("due", first.due);
        focusSoon("review-due-date");
      },
      note: null,
    };
  };

  const textItem = (field: TextField, label: string): ReviewItem => {
    const read = reading?.fields[field]?.value;

    return textItemOf({
      reading,
      field,
      label,
      value: values[field],
      tagValue: readingTextOf(field, values[field]),
      readText: read === undefined ? undefined : inputTextOf(field, read),
      control: (placeholder) => (
        <form.Field name={field}>
          {(item) => (
            <ReviewTextInput
              field={field}
              label={label}
              value={item.state.value}
              message={
                field === "amount" || attempted || item.state.meta.isTouched
                  ? issues.fields[field]
                  : undefined
              }
              currency={values.currency}
              {...(placeholder === undefined ? {} : { placeholder })}
              onChange={(next) => item.handleChange(next)}
              onBlur={item.handleBlur}
            />
          )}
        </form.Field>
      ),
      onUndo: () => form.setFieldValue(field, first[field]),
    });
  };

  const items = FIELDS_OF[kind].map(({ field, label }) =>
    field === "customer"
      ? customer.item
      : field === "dueDate"
        ? dueItem(label)
        : textItem(field, label)
  );

  const checks: FieldCheck[] = FIELDS_OF[kind].flatMap(
    ({ field, label }): FieldCheck[] => {
      if (field === "customer") return [customer.check];

      if (field === "dueDate")
        return kind === "invoice" ? [dueCheck(reading, values.due)] : [];

      return [
        {
          key: field,
          label,
          issue: issues.fields[field],
          empty: values[field].trim() === "",
        },
      ];
    }
  );

  const blocker =
    firstFieldBlocker(checks) ??
    (issues.ok
      ? null
      : { key: "customer" as const, reason: FALLBACK_REASON, focusId: null });

  return {
    items,
    split: null,
    blocker,
    notices:
      duplicate === null && saveError === null ? null : (
        <div className="flex flex-col gap-2">
          {duplicate === null ? null : (
            <DuplicateNotice
              href={`/m/invoices/invoices/${duplicate}`}
              pending={pending}
              onKeep={() => void form.handleSubmit({ keep: true })}
              onDiscard={input.onDiscard}
            />
          )}
          <SaveFailure message={saveError} />
        </div>
      ),
    saveLabel: kind === "invoice" ? "Save as unpaid" : "Save as paid",
    pending,
    submit: () => {
      if (blocker === null) {
        void form.handleSubmit();

        return;
      }

      setAttempted(true);
      input.revealRef.current?.(blocker);
    },
  };
}

type TextField = Exclude<ReadingField, "customer" | "dueDate">;

/** The due choice of an invoice: the read day, or the person's day or unspecified (R-28). */
function DueControl(props: {
  readonly reading: StoredReading | null;
  readonly due: DueChoice;
  readonly onChange: (due: DueChoice) => void;
}): ReactNode {
  const { reading, due, onChange } = props;
  const readDue = reading?.fields.dueDate;

  // The read day typed back stays the document's.
  if (readDue !== undefined) {
    return dueDateInput(dueText(due) ?? "", (value) =>
      onChange(
        dayFromText(value) === readDue.value
          ? { kind: "kept", value }
          : { kind: "person", value }
      )
    );
  }

  const warning =
    reading === null
      ? "Choose one:"
      : reading.fields.paymentTerms === undefined
        ? "The document states no due date and no payment terms. Choose one:"
        : "The document states no due date. Choose one:";

  return (
    <div className="flex flex-col gap-2">
      <WarningNote>{warning}</WarningNote>
      <RadioGroup
        aria-label="Due date choice"
        value={
          due.kind === "person"
            ? "person"
            : due.kind === "unspecified"
              ? "unspecified"
              : null
        }
        onValueChange={(next) =>
          onChange(
            next === "person"
              ? {
                  kind: "person",
                  value: due.kind === "person" ? due.value : "",
                }
              : { kind: "unspecified" }
          )
        }
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem
            id="review-due-person"
            value="person"
            aria-label="Enter a due date"
          />
          <span>Enter a due date</span>
        </div>
        {due.kind === "person"
          ? dueDateInput(due.value, (value) =>
              onChange({ kind: "person", value })
            )
          : null}
        <div className="flex items-start gap-2">
          <RadioGroupItem
            value="unspecified"
            aria-label="Mark as unspecified"
          />
          <span>
            Mark as unspecified{" "}
            <span className="text-muted-foreground">
              (counts in outstanding, never overdue)
            </span>
          </span>
        </div>
      </RadioGroup>
    </div>
  );
}
