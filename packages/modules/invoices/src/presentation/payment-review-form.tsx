"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import { useForm, useSelector } from "@tanstack/react-form";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import {
  currencyCode,
  invoicesContract,
  MAX_PAYMENT_LINKS,
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
import { FIELDS_OF, type ReviewFieldKey } from "./review-fields.tsx";
import {
  inputTextOf,
  issuesOf,
  optionalText,
  readingTextOf,
  ReviewCustomerRow,
  ReviewSaveBar,
  ReviewTextRow,
} from "./review-form.tsx";
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

/** The payment review: its fields, then the links the person confirms (R-30, R-31, R-33). */
export function PaymentReviewForm(props: {
  readonly view: DocumentReviewView;
  readonly selected: ReviewFieldKey | null;
  readonly onSelect: (field: ReviewFieldKey) => void;
  readonly onSaved: (message: string) => void;
  readonly onDiscard: () => void;
  readonly discarding: boolean;
}): ReactNode {
  const { view } = props;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();

  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [duplicate, setDuplicate] = useState<string | null>(
    view.payment?.possibleDuplicateOf ?? null
  );

  const form = useForm({
    defaultValues: initialValues(view),
    validators: {
      // Links are checked by `checkLinks`, so the schema checks the payment's own fields.
      onMount: ({ value }) => validate(value),
      onChange: ({ value }) => validate(value),
    },
    // The Keep choice rides on one submit only, so a refused Keep never reaches the next save.
    onSubmitMeta: { keep: false },
    onSubmitInvalid: () => setAttempted(true),
    onSubmit: ({ value, meta }) => submit(value, meta.keep),
  });

  function validate(value: FormValues) {
    const parsed = savePaymentInput.safeParse(
      buildInput(view, value, [], false)
    );

    return parsed.success
      ? undefined
      : { fields: issuesOf(parsed.error.issues, formFieldOf) };
  }

  const values = useSelector(form.store, (state) => state.values);
  const canSubmit = useSelector(form.store, (state) => state.canSubmit);

  const customerId =
    values.customer.kind === "existing" ? values.customer.id : null;

  const currency = values.currency.trim();

  // The review read answered the matched customer's open invoices in the read currency.
  const asRead =
    customerId !== null &&
    customerId === view.customerMatch?.id &&
    currency === view.reading?.fields.currency?.value;

  const asked =
    customerId !== null && !asRead && currencyCode.safeParse(currency).success;

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

  const tooManyLinks = links.length > MAX_PAYMENT_LINKS;

  const linksOk =
    !tooManyLinks &&
    !check.abovePayment &&
    check.aboveOpen.length === 0 &&
    check.unreadable.length === 0;

  const canSave =
    canSubmit &&
    linksOk &&
    status.kind === "ready" &&
    customerChoiceOf(values.customer) !== undefined;

  const helper =
    values.customer.kind === "new" && !values.customer.confirmed
      ? "Confirm the new customer to save."
      : status.kind === "loading"
        ? "Wait for the open invoices to load to save."
        : status.kind === "failed"
          ? "Load the open invoices again to save."
          : tooManyLinks
            ? `Link at most ${MAX_PAYMENT_LINKS} invoices in one save.`
            : canSave
              ? undefined
              : "Fix the fields marked above to save.";

  async function submit(value: FormValues, keep: boolean) {
    const parsed = savePaymentInput.safeParse(
      buildInput(view, value, links, keep)
    );

    if (!parsed.success || !linksOk || status.kind !== "ready") {
      setAttempted(true);

      return;
    }

    setPending(true);
    setSaveError(null);

    try {
      const answer = await invoices.savePayment(parsed.data);

      if (answer.outcome === "possible-duplicate") {
        setDuplicate(answer.duplicateOf);

        return;
      }

      setDuplicate(null);

      const linked = check.allocatedCents;

      props.onSaved(
        `Payment saved: ${formatMoney(linked, parsed.data.currency)} linked, ${formatMoney(parsed.data.amountCents - linked, parsed.data.currency)} unallocated.`
      );
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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex flex-col divide-y divide-border">
        {FIELDS_OF.payment.map(({ field, label }) =>
          field === "customer" ? (
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
          ) : (
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
                    {...(field === "invoiceNumbers"
                      ? { tagValue: numbersOf(item.state.value) }
                      : {})}
                    message={
                      field === "amount" ||
                      attempted ||
                      item.state.meta.isTouched
                        ? issue
                        : undefined
                    }
                    currency={values.currency}
                    onChange={(next) => item.handleChange(next)}
                    onBlur={item.handleBlur}
                  />
                );
              }}
            </form.Field>
          )
        )}
      </div>
      <div className="border-t border-border">
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
      </div>
      {duplicate === null && saveError === null ? null : (
        <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
          {duplicate === null ? null : (
            <DuplicateNotice
              href={`/m/invoices/payments/${duplicate}`}
              pending={pending}
              onKeep={() => void form.handleSubmit({ keep: true })}
              onDiscard={() => props.onDiscard()}
            />
          )}
          <SaveFailure message={saveError} />
        </div>
      )}
      <ReviewSaveBar
        helper={helper}
        pending={pending}
        label={links.length > 0 ? "Save the payment" : "Save as unallocated"}
        discarding={props.discarding}
        onDiscard={props.onDiscard}
      />
    </form>
  );
}
