"use client";

import { PageHeader, PageSkeleton } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import { useHydrated } from "@genie/ui";
import { useRef, useState, type ReactNode } from "react";

import { invoicesContract } from "../contract.ts";
import { useInvoiceReview } from "./invoice-review-form.tsx";
import { usePaymentReview } from "./payment-review-form.tsx";
import type { Blocker } from "./review-blocker.ts";
import { ReviewDesk } from "./review-desk.tsx";
import type { ReviewFrame } from "./review-model.ts";
import type { DocumentReviewView } from "./views.ts";

/**
 * One review state from the reading to the save and across a type change (czjw.98, P09-10): it
 * stays mounted, so the PDF draws once, and it owns the form that Save and Enter submit.
 */
export function ReviewWorkspace(props: {
  readonly view: DocumentReviewView;
  readonly frame: ReviewFrame;
  readonly discarding: boolean;
  /** Null hides Discard: while the job reads. */
  readonly onDiscard: (() => void) | null;
  readonly onSaved: (message: string) => void;
}): ReactNode {
  const { view, frame, onDiscard } = props;
  const invoices = useModuleClient(invoicesContract);
  const revealRef = useRef<((blocker: Blocker) => void) | null>(null);
  // The first link lasts the page's life, so a refetch never loads the PDF again.
  const [fileUrl] = useState(view.document.fileUrl);
  const hydrated = useHydrated();
  const kind = view.document.kind;

  const invoice = useInvoiceReview({
    view,
    kind: kind === "paid-receipt" ? "paid-receipt" : "invoice",
    revealRef,
    onSaved: props.onSaved,
    onDiscard: () => onDiscard?.(),
  });

  const reading = view.document.status === "reading";

  // Both hooks run on every render, so a type change keeps the workspace and its PDF (T5.4).
  const payment = usePaymentReview({
    view,
    active: !reading && kind === "payment",
    revealRef,
    onSaved: props.onSaved,
    onDiscard: () => onDiscard?.(),
  });

  const model = reading ? null : kind === "payment" ? payment : invoice;

  const refreshUrl = async () =>
    (await invoices.getDocumentReview({ id: view.document.id })).document
      .fileUrl;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        model?.submit();
      }}
    >
      {hydrated ? (
        <ReviewDesk
          frame={frame}
          model={model}
          fileUrl={fileUrl}
          refreshUrl={refreshUrl}
          revealRef={revealRef}
          label={view.document.label}
          discarding={props.discarding}
          onDiscard={onDiscard}
        />
      ) : (
        <>
          <PageHeader title={frame.title} breadcrumb={frame.breadcrumb} />
          <PageSkeleton label={frame.title} />
        </>
      )}
    </form>
  );
}
