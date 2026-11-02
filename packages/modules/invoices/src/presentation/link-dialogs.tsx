"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  WarningNote,
} from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";

import {
  invoicesContract,
  type CorrectInvoiceTotalInput,
  type CorrectInvoiceTotalOutput,
} from "../contract.ts";
import { centsOf, centsText } from "../services/reading/quote-check.ts";
import { AllocationTable } from "./allocations.tsx";
import { formatMoney } from "./format.ts";
import { labelOf, type LinkedRecord } from "./history-text.ts";
import { AMOUNT_MESSAGE } from "./review-form.tsx";
import type { AllocationRow } from "./views.ts";

/** Every invoices query, so a change of a link refreshes both record pages and the lists. */
export const INVOICES_QUERY = ["invoices"] as const;

/** A refusal's own words. A rejection that is not an Error at run time has no message, so it gets ours. */
function messageOf(error: Error, fallback: string): string {
  return error instanceof Error && error.message !== ""
    ? error.message
    : fallback;
}

/** The last row given, so a dialog keeps its text while it fades out after the row is cleared. */
function useLastRow(row: AllocationRow | null): AllocationRow | null {
  const [last, setLast] = useState(row);

  // Adjusting state during render, as React documents for a prop change.
  if (row !== null && row !== last) setLast(row);

  return row ?? last;
}

function ChangeLinkForm(props: {
  readonly row: AllocationRow;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactNode {
  const { row, onClose, onSaved } = props;
  const invoices = useModuleClient(invoicesContract);
  const [amount, setAmount] = useState(centsText(row.amountCents));
  const [invalid, setInvalid] = useState(false);

  const change = useMutation({
    mutationFn: (amountCents: number) =>
      invoices.changeAllocation({ id: row.id, amountCents }),
    onSuccess: onSaved,
  });

  // One alert at a time: the amount message blocks the call, and typing clears a refusal.
  const refusal =
    change.error === null
      ? null
      : messageOf(change.error, "The link was not changed.");

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();

        const amountCents = centsOf(amount.trim());

        setInvalid(amountCents === undefined);

        if (amountCents !== undefined) change.mutate(amountCents);
      }}
    >
      <AmountField
        id="change-link-amount"
        label="Amount"
        value={amount}
        invalid={invalid}
        onChange={(value) => {
          setAmount(value);
          setInvalid(false);
          change.reset();
        }}
      />
      <Refusal message={refusal} />
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={change.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Changes the amount of one link; a refusal stays inside the open dialog (R-32). */
export function ChangeLinkDialog(props: {
  readonly row: AllocationRow | null;
  readonly other: LinkedRecord;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactNode {
  const { other, onClose, onSaved } = props;
  const shown = useLastRow(props.row);

  return (
    <Dialog
      open={props.row !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        {shown === null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{`Change the link to ${labelOf(shown, other)}`}</DialogTitle>
            </DialogHeader>
            <ChangeLinkForm
              key={shown.id}
              row={shown}
              onClose={onClose}
              onSaved={onSaved}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One amount field with its own error, which typing clears. */
function AmountField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const { id, label, value, invalid, onChange } = props;

  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {invalid ? (
        <FieldError id={`${id}-error`}>{AMOUNT_MESSAGE}</FieldError>
      ) : null}
    </div>
  );
}

function Refusal(props: { readonly message: string | null }): ReactNode {
  return props.message === null ? null : (
    <p role="alert" className="text-sm text-destructive">
      {props.message}
    </p>
  );
}

type PaymentToLink = {
  readonly id: string;
  readonly customerId: string;
  readonly currency: string;
  readonly label: string;
  readonly unallocatedCents: number;
};

function LinkInvoiceForm(props: {
  readonly payment: PaymentToLink;
  readonly onClose: () => void;
  readonly onLinked: () => void;
}): ReactNode {
  const { payment, onClose, onLinked } = props;
  const { customerId, currency } = payment;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [issue, setIssue] = useState<"invoice" | "amount" | null>(null);

  const open = useQuery({
    queryKey: [...INVOICES_QUERY, "open-invoices", customerId, currency],
    queryFn: () => invoices.listOpenInvoices({ customerId, currency }),
  });

  const link = useMutation({
    mutationFn: (amountCents: number) =>
      invoices.linkPayment({
        invoiceId: invoiceId ?? "",
        paymentId: payment.id,
        amountCents,
      }),
    onSuccess: () => {
      onLinked();

      return queryClient.invalidateQueries({ queryKey: INVOICES_QUERY });
    },
  });

  const cancel = (
    <Button type="button" variant="secondary" onClick={onClose}>
      Cancel
    </Button>
  );

  // A pending or failed read is never shown as "no open invoice" (Task 6 review).
  if (open.isPending) {
    return (
      <>
        <p role="status" className="text-muted-foreground">
          Loading the open invoices.
        </p>
        <DialogFooter>{cancel}</DialogFooter>
      </>
    );
  }

  if (open.isError) {
    return (
      <>
        <Refusal
          message={`The open invoices were not loaded. ${messageOf(open.error, "Try again.")}`}
        />
        <DialogFooter>
          {cancel}
          <Button type="button" onClick={() => void open.refetch()}>
            Load again
          </Button>
        </DialogFooter>
      </>
    );
  }

  const rows = open.data.rows;

  if (rows.length === 0) {
    return (
      <>
        <p>{`No open invoice of this customer in ${currency}.`}</p>
        <DialogFooter>{cancel}</DialogFooter>
      </>
    );
  }

  const items = rows.map((row) => ({
    value: row.invoiceId,
    label: `${row.number} · open ${formatMoney(row.openCents, row.currency)}`,
  }));

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();

        const amountCents = centsOf(amount.trim());

        const next =
          invoiceId === null
            ? "invoice"
            : amountCents === undefined
              ? "amount"
              : null;

        setIssue(next);

        if (next === null && amountCents !== undefined) {
          link.mutate(amountCents);
        }
      }}
    >
      <div className="grid gap-1.5">
        <FieldLabel id="link-invoice-label">Invoice</FieldLabel>
        <Select
          items={items}
          value={invoiceId}
          onValueChange={(next) => {
            const row = rows.find((item) => item.invoiceId === next);

            if (row === undefined) return;

            setInvoiceId(row.invoiceId);
            // The most both balances allow, so the default never asks for a refusal.
            setAmount(
              centsText(Math.min(row.openCents, payment.unallocatedCents))
            );
            setIssue(null);
            link.reset();
          }}
        >
          <SelectTrigger
            aria-labelledby="link-invoice-label"
            aria-invalid={issue === "invoice" ? true : undefined}
            aria-describedby={
              issue === "invoice" ? "link-invoice-error" : undefined
            }
          >
            <SelectValue placeholder="Choose an invoice" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {issue === "invoice" ? (
          <FieldError id="link-invoice-error">Choose an invoice.</FieldError>
        ) : null}
      </div>
      <AmountField
        id="link-invoice-amount"
        label="Amount"
        value={amount}
        invalid={issue === "amount"}
        onChange={(value) => {
          setAmount(value);
          setIssue(null);
          link.reset();
        }}
      />
      <Refusal
        message={
          link.error === null
            ? null
            : messageOf(link.error, "The payment was not linked.")
        }
      />
      <DialogFooter>
        {cancel}
        <Button type="submit" loading={link.isPending}>
          Link
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Links unallocated money of a payment to an open invoice of its customer in its currency
 * (R-31, R-32, decision 10). A refusal stays inside the open dialog.
 */
export function LinkInvoiceDialog(props: {
  readonly open: boolean;
  readonly payment: PaymentToLink;
  readonly onClose: () => void;
  readonly onLinked: () => void;
}): ReactNode {
  const { open, payment, onClose, onLinked } = props;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Link ${payment.label} to an invoice`}</DialogTitle>
        </DialogHeader>
        <LinkInvoiceForm
          payment={payment}
          onClose={onClose}
          onLinked={onLinked}
        />
      </DialogContent>
    </Dialog>
  );
}

type InvoiceToCorrect = {
  readonly id: string;
  readonly number: string;
  readonly currency: string;
  readonly totalCents: number;
};

type LinkChoice = Extract<
  CorrectInvoiceTotalOutput,
  { outcome: "choose-links" }
>;

function CorrectTotalForm(props: {
  readonly invoice: InvoiceToCorrect;
  readonly allocations: readonly AllocationRow[];
  readonly onClose: () => void;
  readonly onCorrected: () => void;
}): ReactNode {
  const { invoice, allocations, onClose, onCorrected } = props;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();
  const [total, setTotal] = useState(centsText(invoice.totalCents));
  const [choice, setChoice] = useState<LinkChoice | null>(null);
  /** The typed new amount of each link of the choice, by allocation id. */
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  /** `total` or the allocation id of each field that does not hold an amount. */
  const [invalid, setInvalid] = useState<readonly string[]>([]);

  const correct = useMutation({
    mutationFn: (input: CorrectInvoiceTotalInput) =>
      invoices.correctInvoiceTotal(input),
    onSuccess: (answer) => {
      if (answer.outcome === "choose-links") {
        setChoice(answer);
        setAmounts(
          Object.fromEntries(
            answer.allocations.map((link) => [
              link.allocationId,
              centsText(link.amountCents),
            ])
          )
        );

        return;
      }

      onCorrected();

      return queryClient.invalidateQueries({ queryKey: INVOICES_QUERY });
    },
  });

  const edited = (key: string) => {
    setInvalid((keys) => keys.filter((item) => item !== key));
    correct.reset();
  };

  // A link of the answer that the page does not list is dated after the reporting date.
  const labelOfLink = (allocationId: string) => {
    const row = allocations.find((item) => item.id === allocationId);

    return row === undefined
      ? "A payment after the reporting date"
      : labelOf(row, "payment");
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();

        const totalCents = centsOf(total.trim());
        const bad = totalCents === undefined ? ["total"] : [];
        const reductions: CorrectInvoiceTotalInput["reductions"] = [];

        for (const link of choice?.allocations ?? []) {
          const cents = centsOf((amounts[link.allocationId] ?? "").trim());

          if (cents === undefined) bad.push(link.allocationId);
          // A changed link only: the server refuses a raised one rather than this form dropping it.
          else if (cents !== link.amountCents) {
            reductions.push({
              allocationId: link.allocationId,
              amountCents: cents,
            });
          }
        }

        setInvalid(bad);

        if (bad.length === 0 && totalCents !== undefined) {
          correct.mutate({ id: invoice.id, totalCents, reductions });
        }
      }}
    >
      <AmountField
        id="correct-total"
        label="Total"
        value={total}
        invalid={invalid.includes("total")}
        onChange={(value) => {
          setTotal(value);
          edited("total");
        }}
      />
      {choice === null ? null : (
        <>
          <WarningNote>
            {`The links add up to ${formatMoney(choice.excessCents, invoice.currency)} more than the new total. Lower one or more links.`}
          </WarningNote>
          {choice.allocations.map((link) => (
            <AmountField
              key={link.allocationId}
              id={`correct-link-${link.allocationId}`}
              label={`New amount for ${labelOfLink(link.allocationId)}`}
              value={amounts[link.allocationId] ?? ""}
              invalid={invalid.includes(link.allocationId)}
              onChange={(value) => {
                setAmounts((current) => ({
                  ...current,
                  [link.allocationId]: value,
                }));
                edited(link.allocationId);
              }}
            />
          ))}
        </>
      )}
      <Refusal
        message={
          correct.error === null
            ? null
            : messageOf(correct.error, "The total was not corrected.")
        }
      />
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={correct.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Corrects an invoice total. Below its links, the answer `choose-links` asks for the new amount
 * of each link, and Save sends the lowered ones; 0 removes a link (R-32, decision 13).
 */
export function CorrectTotalDialog(props: {
  readonly open: boolean;
  readonly invoice: InvoiceToCorrect;
  /** The links on the page, to name a link of the choose-links step. */
  readonly allocations: readonly AllocationRow[];
  readonly onClose: () => void;
  readonly onCorrected: () => void;
}): ReactNode {
  const { open, invoice, allocations, onClose, onCorrected } = props;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Correct the total of ${invoice.number}`}</DialogTitle>
        </DialogHeader>
        <CorrectTotalForm
          invoice={invoice}
          allocations={allocations}
          onClose={onClose}
          onCorrected={onCorrected}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The links of one record. A writer of the record gets Undo on an automatic link, with no
 * confirmation, and Change amount and Remove link on every link (R-32, decision 9).
 */
export function RecordLinks(props: {
  readonly rows: readonly AllocationRow[];
  readonly other: LinkedRecord;
  readonly canWrite: boolean;
}): ReactNode {
  const { rows, other, canWrite } = props;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState<AllocationRow | null>(null);
  const [removing, setRemoving] = useState<AllocationRow | null>(null);
  const removed = useLastRow(removing);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: INVOICES_QUERY });

  const unlink = useMutation({
    mutationFn: (row: AllocationRow) =>
      invoices.unlinkAllocation({ id: row.id }),
    onMutate: () => setFeedback(null),
    onSuccess: (_answer, row) => {
      setFeedback(
        `The link to ${labelOf(row, other)} is removed. ${formatMoney(row.amountCents, row.currency)} returns to the payment as unallocated.`
      );

      return refresh();
    },
  });

  // One unlink at a time: a second click would be refused as not found beside the first success.
  // A ref, because `isPending` re-renders only after the next click of a double click.
  const unlinking = useRef(false);

  const removeLink = (row: AllocationRow) => {
    if (unlinking.current) return;

    unlinking.current = true;
    unlink.mutate(row, {
      onSettled: () => {
        unlinking.current = false;
      },
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 ? (
        <p>{`No ${other} is linked yet.`}</p>
      ) : (
        <AllocationTable
          rows={rows}
          other={other}
          {...(canWrite
            ? {
                actions: {
                  onUndo: removeLink,
                  onChange: setChanging,
                  onRemove: setRemoving,
                },
              }
            : {})}
        />
      )}
      {feedback === null ? null : (
        <p role="status" className="text-sm">
          {feedback}
        </p>
      )}
      {unlink.error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {`The link to ${unlink.variables === undefined ? "" : labelOf(unlink.variables, other)} was not removed. ${messageOf(unlink.error, "Try again.")}`}
        </p>
      )}
      {canWrite ? (
        <>
          <ChangeLinkDialog
            row={changing}
            other={other}
            onClose={() => setChanging(null)}
            onSaved={() => {
              setChanging(null);
              setFeedback(null);

              return refresh();
            }}
          />
          <ConfirmDialog
            open={removing !== null}
            title={`Remove the link to ${removed === null ? "" : labelOf(removed, other)}?`}
            description={`${removed === null ? "" : formatMoney(removed.amountCents, removed.currency)} returns to the payment as unallocated.`}
            confirmLabel="Remove link"
            danger
            onConfirm={() => {
              if (removing !== null) removeLink(removing);
              setRemoving(null);
            }}
            onClose={() => setRemoving(null)}
          />
        </>
      ) : null}
    </div>
  );
}
