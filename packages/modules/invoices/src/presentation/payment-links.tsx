"use client";

import {
  Badge,
  Button,
  Checkbox,
  FieldError,
  FieldLabel,
  Input,
} from "@genie/ui";
import type { ReactNode } from "react";

import {
  currencyCode,
  type OpenInvoiceRow,
  type PaymentMatch,
} from "../contract.ts";
import { formatMoney } from "./format.ts";
import { checkLinks, fillOf, type LinkDraft } from "./payment-links.ts";
import { SaveFailure } from "./review-alerts.tsx";
import { AMOUNT_MESSAGE } from "./review-form.tsx";

/** Where the open invoices stand: shown, still loading, refused, or not asked for without a customer. */
export type OpenStatus =
  | { readonly kind: "ready" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "no-customer" };

type LinksCopy = { readonly headline: string; readonly sentence: string };

/** The headline and the sentence above the links, by the kind of the proposal (R-30). */
function copyOf(
  proposal: PaymentMatch,
  open: readonly OpenInvoiceRow[]
): LinksCopy {
  const numberOf = (invoiceId: string) =>
    open.find((row) => row.invoiceId === invoiceId)?.number ?? "an invoice";

  switch (proposal.kind) {
    case "split":
      return {
        headline: "Confirm the split",
        sentence: `The payment names ${proposal.parts.length} invoices. Check the amounts, then save.`,
      };
    case "automatic":
    case "confirm":
      return {
        headline: "Confirm the link",
        sentence: `The payment names ${numberOf(proposal.invoiceId)}. Check the amount, then save.`,
      };
    case "overpayment": {
      const currency =
        open.find((row) => row.invoiceId === proposal.invoiceId)?.currency ??
        "";

      return {
        headline: "More than the open balance",
        sentence: `${formatMoney(proposal.amountCents, currency)} goes to ${numberOf(proposal.invoiceId)}, and ${formatMoney(proposal.unallocatedCents, currency)} stays unallocated.`,
      };
    }

    case "suggestions":
      return {
        headline: "Possible matches",
        sentence:
          "These invoices have an open balance equal to the payment. Choose one, or save the payment unallocated.",
      };
    case "no-match":
      return {
        headline: "No matching invoice",
        sentence:
          "Save the payment unallocated, or link it to an invoice below.",
      };
  }
}

/** The person's links of a payment to the open invoices of its customer; nothing links by itself (R-30, R-31). */
export function LinksEditor(props: {
  readonly proposal: PaymentMatch;
  readonly status: OpenStatus;
  readonly onRetry: () => void;
  readonly open: readonly OpenInvoiceRow[];
  readonly drafts: readonly LinkDraft[];
  /** The payment amount in cents, undefined while it does not parse. */
  readonly amountCents: number | undefined;
  readonly currency: string;
  readonly onChange: (drafts: readonly LinkDraft[]) => void;
}): ReactNode {
  const { proposal, status, open, drafts, amountCents, onChange } = props;
  const { headline, sentence } = copyOf(proposal, open);
  const check = checkLinks(amountCents ?? 0, drafts, open);

  const suggested = (invoiceId: string) =>
    proposal.kind === "suggestions" && proposal.invoiceIds.includes(invoiceId);

  const others = (invoiceId: string) =>
    drafts.filter((draft) => draft.invoiceId !== invoiceId);

  return (
    <section
      aria-labelledby="payment-links-headline"
      className="flex flex-col gap-3 px-4 py-3 text-sm"
    >
      <h2 id="payment-links-headline" className="font-semibold">
        {headline}
      </h2>
      <p>{sentence}</p>
      {status.kind === "no-customer" ? (
        <p className="text-muted-foreground">
          Choose a customer to see its open invoices.
        </p>
      ) : status.kind === "loading" ? (
        <p role="status" className="text-muted-foreground">
          Loading the open invoices.
        </p>
      ) : status.kind === "failed" ? (
        <div className="flex flex-col items-start gap-2">
          <SaveFailure
            message={`The open invoices were not loaded. ${status.message}`}
          />
          <Button variant="secondary" size="sm" onClick={props.onRetry}>
            Load again
          </Button>
        </div>
      ) : open.length === 0 ? (
        <p className="text-muted-foreground">
          This customer has no open invoice in this currency.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {open.map((row) => {
            const draft = drafts.find(
              (item) => item.invoiceId === row.invoiceId
            );

            const id = `link-${row.invoiceId}`;

            const message = check.unreadable.includes(row.invoiceId)
              ? AMOUNT_MESSAGE
              : check.aboveOpen.includes(row.invoiceId)
                ? `More than the open balance of ${row.number}.`
                : undefined;

            return (
              <li key={row.invoiceId} className="flex flex-col gap-1.5 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <FieldLabel className="items-center">
                    <Checkbox
                      checked={draft !== undefined}
                      onCheckedChange={(checked) =>
                        onChange(
                          checked
                            ? [
                                ...others(row.invoiceId),
                                {
                                  invoiceId: row.invoiceId,
                                  amountText: fillOf(
                                    amountCents,
                                    others(row.invoiceId),
                                    row
                                  ),
                                },
                              ]
                            : others(row.invoiceId)
                        )
                      }
                    />
                    <span className="ml-2">{`Link to ${row.number}`}</span>
                  </FieldLabel>
                  {suggested(row.invoiceId) ? (
                    <Badge variant="neutral">Same amount</Badge>
                  ) : null}
                  <span className="text-muted-foreground">
                    {`Open ${formatMoney(row.openCents, row.currency)}`}
                  </span>
                </div>
                <Input
                  id={id}
                  aria-label={`Amount for ${row.number}`}
                  inputMode="decimal"
                  className="w-40"
                  disabled={draft === undefined}
                  value={draft?.amountText ?? ""}
                  aria-invalid={message === undefined ? undefined : true}
                  aria-describedby={
                    message === undefined ? undefined : `${id}-error`
                  }
                  onChange={(event) =>
                    onChange(
                      drafts.map((item) =>
                        item.invoiceId === row.invoiceId
                          ? {
                              invoiceId: row.invoiceId,
                              amountText: event.target.value,
                            }
                          : item
                      )
                    )
                  }
                />
                {message === undefined ? null : (
                  <FieldError id={`${id}-error`}>{message}</FieldError>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {amountCents === undefined ||
      !currencyCode.safeParse(props.currency).success ? null : (
        <p aria-live="polite">
          {`Linked ${formatMoney(check.allocatedCents, props.currency)}. Unallocated ${formatMoney(check.unallocatedCents, props.currency)}.`}
        </p>
      )}
      {amountCents !== undefined && check.abovePayment ? (
        <FieldError>The links add up to more than the payment.</FieldError>
      ) : null}
    </section>
  );
}
