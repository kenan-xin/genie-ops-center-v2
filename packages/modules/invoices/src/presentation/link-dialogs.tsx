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
} from "@genie/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";

import { invoicesContract } from "../contract.ts";
import { centsOf, centsText } from "../services/reading/quote-check.ts";
import { AllocationTable, labelOf, type LinkedRecord } from "./allocations.tsx";
import { formatMoney } from "./format.ts";
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
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="change-link-amount">Amount</FieldLabel>
        <Input
          id="change-link-amount"
          inputMode="decimal"
          value={amount}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? "change-link-amount-error" : undefined}
          onChange={(event) => {
            setAmount(event.target.value);
            setInvalid(false);
            change.reset();
          }}
        />
        {invalid ? (
          <FieldError id="change-link-amount-error">
            {AMOUNT_MESSAGE}
          </FieldError>
        ) : null}
      </div>
      {refusal === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {refusal}
        </p>
      )}
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
