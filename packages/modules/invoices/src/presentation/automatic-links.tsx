"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import { Button } from "@genie/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { invoicesContract } from "../contract.ts";
import { formatMoney, paymentLabel } from "./format.ts";
import type { DocumentReviewView } from "./views.ts";

const DOCUMENTS_QUERY = ["invoices", "documents"] as const;

type AutomaticLink = NonNullable<
  DocumentReviewView["saved"]
>["automaticLinks"][number];

/** A link names its payment the way the payment pages do: by reference, else by day. */
function linkPaymentLabel(link: AutomaticLink): string {
  return paymentLabel({
    reference: link.paymentReference,
    paymentDate: link.paymentDate,
  });
}

/** The links the save made by itself, each with Undo (R-32). The result card names the records. */
export function AutomaticLinks(props: {
  readonly view: DocumentReviewView;
}): ReactNode {
  const { view } = props;
  const saved = view.saved;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const undo = useMutation({
    mutationFn: (link: AutomaticLink) =>
      invoices.unlinkAllocation({ id: link.allocationId }),
    onSuccess: (_answer, link) => {
      setFailure(null);
      setFeedback(
        `Link removed. ${formatMoney(link.amountCents, link.currency)} is unallocated on ${linkPaymentLabel(link)}.`
      );

      return queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY });
    },
    onError: (error) => {
      setFailure(`The link was not removed. ${error.message}`);
    },
  });

  if (saved === null) return null;

  if (
    saved.automaticLinks.length === 0 &&
    feedback === null &&
    failure === null
  )
    return null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {saved.automaticLinks.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Linked automatically</h2>
          {saved.automaticLinks.map((link) => {
            const label = linkPaymentLabel(link);

            return (
              <div
                key={link.allocationId}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {`${label} → ${link.invoiceNumber}, ${formatMoney(link.amountCents, link.currency)}`}
                </span>
                {view.canWrite ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={
                      undo.isPending &&
                      undo.variables?.allocationId === link.allocationId
                    }
                    aria-label={`Undo the link of ${label} to ${link.invoiceNumber}`}
                    onClick={() => undo.mutate(link)}
                  >
                    Undo
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {feedback === null ? null : <p role="status">{feedback}</p>}
      {failure === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}
