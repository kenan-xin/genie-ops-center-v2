"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import { Input, RadioGroup, RadioGroupItem, WarningNote } from "@genie/ui";
import { useForm, useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

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
import { centsOf } from "../services/reading/quote-check.ts";
import {
  customerChoiceOf,
  initialCustomer,
  type CustomerValue,
} from "./customer-field.tsx";
import { formatDay } from "./format.ts";
import { DuplicateNotice, SaveFailure } from "./review-alerts.tsx";
import {
  FIELDS_OF,
  liveTagOf,
  ReviewFieldRow,
  sourcesOf,
  type ReviewFieldKey,
} from "./review-fields.tsx";
import {
  issuesOf,
  optionalText,
  ReviewCustomerRow,
  ReviewSaveBar,
  ReviewTextRow,
} from "./review-form.tsx";
import type { DocumentReviewView } from "./views.ts";

const DOCUMENTS_QUERY = ["invoices", "documents"] as const;

type DueChoice =
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
  const text = (field: ReadingField) => reading?.fields[field]?.value ?? "";

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
    : { kind: "kept", value: dueDate };
}

function dueOf(due: DueChoice): DueInput {
  switch (due.kind) {
    case "kept":
      return { dueDate: due.value, dueDateSource: "document" };
    case "person":
      return {
        dueDate: due.value === "" ? null : due.value,
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

function amountCents(value: string): number | undefined {
  return centsOf(value);
}

function buildInput(
  kind: "invoice" | "paid-receipt",
  view: DocumentReviewView,
  values: FormValues,
  keep: boolean
): SaveDraft {
  const choice = dueOf(values.due);

  const common = {
    documentId: view.document.id,
    customer: customerChoiceOf(values.customer),
    number: values.number,
    currency: values.currency,
    totalCents: amountCents(values.amount),
    description: optionalText(values.description),
    keepPossibleDuplicate: keep,
    ...choice,
  };

  return kind === "invoice"
    ? {
        ...common,
        invoiceDate: values.date,
        paymentTerms: optionalText(values.paymentTerms),
      }
    : {
        ...common,
        date: values.date,
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

/** The form's own validation: the save schema over the values the form holds (R-28, R-33). */
function formValidator(
  kind: "invoice" | "paid-receipt",
  view: DocumentReviewView
): (props: {
  readonly value: FormValues;
}) => { fields: FormIssues } | undefined {
  const schema = kind === "invoice" ? saveInvoiceInput : savePaidReceiptInput;

  return ({ value }) => {
    const parsed = schema.safeParse(buildInput(kind, view, value, false));

    if (parsed.success) return undefined;

    const fields: FormIssues = issuesOf(parsed.error.issues, formFieldOf);

    return { fields };
  };
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

/** The invoice or paid-receipt review: the reading's texts as a save form (R-28, R-33, R-38). */
export function InvoiceReviewForm(props: {
  readonly view: DocumentReviewView;
  readonly kind: "invoice" | "paid-receipt";
  readonly selected: ReviewFieldKey | null;
  readonly onSelect: (field: ReviewFieldKey) => void;
  readonly onSaved: (message: string) => void;
  readonly onDiscard: () => void;
}): ReactNode {
  const { view, kind } = props;
  const reading = view.reading;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();

  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  const form = useForm({
    defaultValues: initialValues(view),
    validators: {
      onMount: formValidator(kind, view),
      onChange: formValidator(kind, view),
    },
    // The Keep choice rides on one submit only, so a refused Keep never reaches the next save.
    onSubmitMeta: { keep: false },
    onSubmitInvalid: () => setAttempted(true),
    onSubmit: ({ value, meta }) => submit(value, meta.keep),
  });

  const values = useSelector(form.store, (state) => state.values);
  const canSubmit = useSelector(form.store, (state) => state.canSubmit);

  async function submit(value: FormValues, keep: boolean) {
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
      props.onSaved(savedMessage(kind, parsed.data));
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

  const dueOk =
    values.due.kind === "unspecified" ||
    ((values.due.kind === "kept" || values.due.kind === "person") &&
      values.due.value.trim() !== "");

  const customerReady = customerChoiceOf(values.customer) !== undefined;

  const canSave = canSubmit && dueOk && customerReady;

  const helper = !dueOk
    ? "Choose a due date or mark it unspecified to save."
    : values.customer.kind === "new" && !values.customer.confirmed
      ? "Confirm the new customer to save."
      : canSave
        ? undefined
        : "Fix the fields marked above to save.";

  const dueRow = (
    due: DueChoice,
    onChange: (due: DueChoice) => void
  ): ReactNode => {
    const readDue = reading?.fields.dueDate;

    if (readDue !== undefined) {
      return (
        <Input
          id="review-due-date"
          type="date"
          aria-label="Due date"
          value={dueText(due) ?? ""}
          onChange={(event) => {
            const value = event.target.value;

            onChange(
              value === readDue.value
                ? { kind: "kept", value }
                : { kind: "person", value }
            );
          }}
        />
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
            <RadioGroupItem value="person" aria-label="Enter a due date" />
            <span>Enter a due date</span>
          </div>
          {due.kind === "person" ? (
            <Input
              id="review-due-date"
              type="date"
              aria-label="Due date"
              value={due.value}
              onChange={(event) =>
                onChange({ kind: "person", value: event.target.value })
              }
            />
          ) : null}
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
  };

  const textRow = (
    field: Exclude<ReadingField, "customer" | "dueDate">,
    label: string
  ): ReactNode => (
    <form.Field key={field} name={field}>
      {(item) => {
        // SAFETY: this form's validator stores one plain message string per field.
        const issue = item.state.meta.errors[0] as string | undefined;

        return (
          <ReviewTextRow
            view={view}
            selected={props.selected}
            onSelect={props.onSelect}
            field={field}
            label={label}
            value={item.state.value}
            message={
              field === "amount" || attempted || item.state.meta.isTouched
                ? issue
                : undefined
            }
            onChange={(next) => item.handleChange(next)}
            onBlur={item.handleBlur}
          />
        );
      }}
    </form.Field>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex flex-col divide-y divide-border">
        {FIELDS_OF[kind].map(({ field, label }) => {
          if (field === "customer") {
            return (
              <form.Field key={field} name="customer">
                {(item) => (
                  <ReviewCustomerRow
                    view={view}
                    selected={props.selected}
                    onSelect={props.onSelect}
                    label={label}
                    value={item.state.value}
                    attempted={attempted}
                    onChange={(next) => item.handleChange(next)}
                  />
                )}
              </form.Field>
            );
          }

          if (field === "dueDate") {
            return (
              <form.Field key={field} name="due">
                {(item) => (
                  <ReviewFieldRow
                    field={field}
                    label={label}
                    tag={liveTagOf(reading, field, dueText(item.state.value))}
                    sources={sourcesOf(reading, field)}
                    unread={reading === null}
                    selected={props.selected === field}
                    onSelect={() => props.onSelect(field)}
                  >
                    {dueRow(item.state.value, (next) =>
                      item.handleChange(next)
                    )}
                  </ReviewFieldRow>
                )}
              </form.Field>
            );
          }

          return textRow(field, label);
        })}
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
        {duplicate === null ? null : (
          <DuplicateNotice
            href={`/m/invoices/invoices/${duplicate}`}
            pending={pending}
            onKeep={() => void form.handleSubmit({ keep: true })}
            onDiscard={() => props.onDiscard()}
          />
        )}
        <SaveFailure message={saveError} />
        <ReviewSaveBar
          helper={helper}
          pending={pending}
          label={kind === "invoice" ? "Save as unpaid" : "Save as paid"}
        />
      </div>
    </form>
  );
}
