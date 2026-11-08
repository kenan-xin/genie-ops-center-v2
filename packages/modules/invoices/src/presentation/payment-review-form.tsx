"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import { useForm, useSelector } from "@tanstack/react-form";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type RefObject } from "react";

import {
  currencyCode,
  invoicesContract,
  type PaymentMatch,
  type ReadingField,
  savePaymentInput,
} from "../contract.ts";
import {
  customerChoiceOf,
  initialCustomer,
  type CustomerValue,
} from "./customer-field.tsx";
import { centsOfText, formatMoney } from "./format.ts";
import {
  checkLinks,
  draftsOfProposal,
  type LinkDraft,
} from "./payment-links.ts";
import { LinksEditor, type OpenStatus } from "./payment-links.tsx";
import { DuplicateNotice, SaveFailure } from "./review-alerts.tsx";
import {
  type Blocker,
  FALLBACK_REASON,
  type FieldCheck,
  firstFieldBlocker,
  splitBlocker,
} from "./review-blocker.ts";
import { FIELDS_OF } from "./review-fields.tsx";
import {
  customerItemOf,
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

const NO_MATCH: PaymentMatch = { kind: "no-match" };

type FormValues = {
  readonly customer: CustomerValue;
  readonly date: string;
  readonly amount: string;
  readonly currency: string;
  readonly reference: string;
  readonly method: string;
  /** The invoice numbers the payment names, comma-separated. */
  readonly invoiceNumbers: string;
  /** The checked links; an unchecked invoice has no draft. */
  readonly links: readonly LinkDraft[];
};

const TEXT_FIELDS = [
  "date",
  "amount",
  "currency",
  "reference",
  "method",
  "invoiceNumbers",
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

function initialValues(view: DocumentReviewView): FormValues {
  const reading = view.reading;

  const text = (field: ReadingField) =>
    inputTextOf(field, reading?.fields[field]?.value ?? "");

  return {
    customer: initialCustomer(view),
    date: text("date"),
    amount: text("amount"),
    currency: text("currency"),
    reference: text("reference"),
    method: text("method"),
    invoiceNumbers: (reading?.invoiceNumbers ?? [])
      .map(({ value }) => value)
      .join(", "),
    links: view.payment === null ? [] : draftsOfProposal(view.payment.proposal),
  };
}

function numbersOf(text: string): readonly string[] {
  return text
    .split(",")
    .map((number) => number.trim())
    .filter((number) => number !== "");
}

function formFieldOf(key: string): TextField | undefined {
  if (key === "paymentDate") return "date";

  if (key === "amountCents") return "amount";

  if (key === "namedInvoiceNumbers") return "invoiceNumbers";

  return TEXT_FIELDS.find((field) => field === key);
}

/** The save's values before the schema checks them; an unreadable amount stays undefined. */
function buildInput(
  view: DocumentReviewView,
  values: FormValues,
  links: readonly LinkDraft[],
  keep: boolean
) {
  return {
    documentId: view.document.id,
    customer: customerChoiceOf(values.customer),
    paymentDate: readingTextOf("date", values.date),
    currency: values.currency,
    amountCents: centsOfText(values.amount),
    reference: optionalText(values.reference),
    method: optionalText(values.method),
    namedInvoiceNumbers: numbersOf(values.invoiceNumbers),
    allocations: links.map((link) => ({
      invoiceId: link.invoiceId,
      amountCents: centsOfText(link.amountText),
    })),
    keepPossibleDuplicate: keep,
  };
}

/**
 * The payment review as a model of cards, the split and Save (R-30, R-31, R-33, R-38, czjw.98).
 * The form keeps values and touched state only; each render parses the values and checks the links.
 */
export function usePaymentReview(input: {
  readonly view: DocumentReviewView;
  /** False: the document is not a payment, so no open-invoice request runs. */
  readonly active: boolean;
  readonly revealRef: RefObject<((blocker: Blocker) => void) | null>;
  readonly onSaved: (message: string) => void;
  readonly onDiscard: () => void;
}): ReviewModel {
  const { view } = input;
  const reading = view.reading;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();

  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Undefined until a save answers, so a type change to payment still shows the stored duplicate.
  const [answered, setAnswered] = useState<string | null>();

  const duplicate =
    answered === undefined
      ? (view.payment?.possibleDuplicateOf ?? null)
      : answered;

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

  const customerId =
    values.customer.kind === "existing" ? values.customer.id : null;

  const currency = values.currency.trim();

  // The review read answered the matched customer's open invoices in the read currency.
  const asRead =
    customerId !== null &&
    customerId === view.customerMatch?.id &&
    currency === reading?.fields.currency?.value;

  const asked =
    input.active &&
    customerId !== null &&
    !asRead &&
    currencyCode.safeParse(currency).success;

  const openQuery = useQuery({
    queryKey: ["invoices", "open-invoices", customerId, currency],
    queryFn:
      customerId === null || !asked
        ? skipToken
        : () => invoices.listOpenInvoices({ customerId, currency }),
  });

  // A load that is pending or refused is never shown as "no open invoice".
  const status: OpenStatus =
    values.customer.kind === "none"
      ? { kind: "no-customer" }
      : !asked
        ? { kind: "ready" }
        : openQuery.isError
          ? { kind: "failed", message: openQuery.error.message }
          : openQuery.isPending
            ? { kind: "loading" }
            : { kind: "ready" };

  const open = asRead
    ? (view.payment?.openInvoices ?? [])
    : asked
      ? (openQuery.data?.rows ?? [])
      : [];

  // Only the links to the invoices shown now: another customer's drafts are never sent (Review Focus 4).
  const links = values.links.filter((link) =>
    open.some((row) => row.invoiceId === link.invoiceId)
  );

  const proposal = asRead ? (view.payment?.proposal ?? NO_MATCH) : NO_MATCH;
  const amountCents = centsOfText(values.amount);
  const check = checkLinks(amountCents ?? 0, links, open);

  // Links are checked by `splitBlocker`, so the schema checks the payment's own fields.
  const parsed = savePaymentInput.safeParse(
    buildInput(view, values, [], false)
  );

  const issues = parsed.success
    ? {}
    : issuesOf(parsed.error.issues, formFieldOf);

  async function send(value: FormValues, keep: boolean) {
    const sent = savePaymentInput.safeParse(
      buildInput(view, value, links, keep)
    );

    if (!sent.success) {
      setAttempted(true);

      return;
    }

    setPending(true);
    setSaveError(null);

    try {
      const answer = await invoices.savePayment(sent.data);

      if (answer.outcome === "possible-duplicate") {
        setAnswered(answer.duplicateOf);

        return;
      }

      setAnswered(null);
      setSavedValues(value);

      const linked = check.allocatedCents;

      input.onSaved(
        `Payment saved: ${formatMoney(linked, sent.data.currency)} linked, ${formatMoney(sent.data.amountCents - linked, sent.data.currency)} unallocated.`
      );
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY });
    } catch (error) {
      setAnswered(null);

      const message =
        error instanceof Error ? error.message : "The save failed.";

      setSaveError(`${view.document.label} was not saved. ${message}`);
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY });
    } finally {
      setPending(false);
    }
  }

  const first = initialValues(view);

  const customer = customerItemOf({
    reading,
    label: FIELDS_OF.payment[0].label,
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

  const textItem = (field: TextField, label: string): ReviewItem => {
    const read =
      field === "invoiceNumbers"
        ? reading?.invoiceNumbers.length
          ? reading.invoiceNumbers.map(({ value }) => value).join(", ")
          : undefined
        : reading?.fields[field]?.value;

    return textItemOf({
      reading,
      field,
      label,
      value: values[field],
      tagValue:
        field === "invoiceNumbers"
          ? numbersOf(values[field])
          : readingTextOf(field, values[field]),
      readText:
        read === undefined || field === "invoiceNumbers"
          ? read
          : inputTextOf(field, read),
      control: (placeholder) => (
        <form.Field name={field}>
          {(item) => (
            <ReviewTextInput
              field={field}
              label={label}
              value={item.state.value}
              message={
                field === "amount" || attempted || item.state.meta.isTouched
                  ? issues[field]
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

  const items = FIELDS_OF.payment.map(({ field, label }) =>
    field === "customer" ? customer.item : textItem(field, label)
  );

  const checks: FieldCheck[] = FIELDS_OF.payment.map(({ field, label }) =>
    field === "customer"
      ? customer.check
      : {
          key: field,
          label,
          issue: issues[field],
          empty: values[field].trim() === "",
        }
  );

  const blocker =
    firstFieldBlocker(checks) ??
    splitBlocker({
      status,
      drafts: links,
      open,
      amountCents: amountCents ?? 0,
      currency,
    }) ??
    (parsed.success
      ? null
      : { key: "customer" as const, reason: FALLBACK_REASON, focusId: null });

  return {
    items,
    split: (
      <LinksEditor
        proposal={proposal}
        status={status}
        onRetry={() => void openQuery.refetch()}
        open={open}
        drafts={links}
        amountCents={amountCents}
        currency={currency}
        namedNumbers={numbersOf(values.invoiceNumbers)}
        customerName={
          values.customer.kind === "none" ? "" : values.customer.name
        }
        onChange={(next) => form.setFieldValue("links", next)}
      />
    ),
    blocker,
    notices:
      duplicate === null && saveError === null ? null : (
        <div className="flex flex-col gap-2">
          {duplicate === null ? null : (
            <DuplicateNotice
              href={`/m/invoices/payments/${duplicate}`}
              pending={pending}
              onKeep={() => void form.handleSubmit({ keep: true })}
              onDiscard={input.onDiscard}
            />
          )}
          <SaveFailure message={saveError} />
        </div>
      ),
    saveLabel: links.length > 0 ? "Save the payment" : "Save as unallocated",
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
