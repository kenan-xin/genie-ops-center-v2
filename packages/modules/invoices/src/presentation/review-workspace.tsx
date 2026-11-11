"use client";

import { PageHeader, PageSkeleton } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import { useHydrated } from "@genie/ui";
import { useRef, useState, type ReactNode } from "react";

import { invoicesContract } from "../contract.ts";
import { DESK_FROM, DESK_PINS_FROM, useWidth } from "./desk-width.ts";
import { useInvoiceReview } from "./invoice-review-form.tsx";
import { usePaymentReview } from "./payment-review-form.tsx";
import type { Blocker } from "./review-blocker.ts";
import { ReviewDesk } from "./review-desk.tsx";
import type {
  ReviewFrame,
  ReviewLayoutProps,
  ReviewModel,
} from "./review-model.ts";
import { ReviewPager } from "./review-pager.tsx";
import type { DocumentReviewView } from "./views.ts";

/**
 * The model after a save on this page (P09-9): each card shows its value as text and keeps "Read
 * as" without Undo; the result card states the split, so the split and its summary row go: the
 * refetched open invoices no longer hold the linked ones, so a row computed again reads 0.00.
 */
function savedModel(model: ReviewModel): ReviewModel {
  return {
    ...model,
    items: model.items.map((item) => ({
      ...item,
      control: (
        <p className="text-sm font-semibold break-words">{item.display}</p>
      ),
      controlId: null,
      onUndo: null,
    })),
    split: null,
    splitSummary: null,
    blocker: null,
    notices: null,
    submit: () => {},
  };
}

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
  // The desk from its own width, not the viewport's, so the docked agent panel narrows it (P16g-4).
  const form = useRef<HTMLFormElement>(null);
  const width = useWidth(form);
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
    active: !reading && kind === "payment" && frame.saved === null,
    revealRef,
    onSaved: props.onSaved,
    onDiscard: () => onDiscard?.(),
  });

  const active = reading ? null : kind === "payment" ? payment : invoice;

  const model =
    active === null || frame.saved === null ? active : savedModel(active);

  const refreshUrl = async () =>
    (await invoices.getDocumentReview({ id: view.document.id })).document
      .fileUrl;

  const layout: ReviewLayoutProps = {
    frame,
    model,
    fileUrl,
    refreshUrl,
    revealRef,
    label: view.document.label,
    unread: view.reading === null,
    discarding: props.discarding,
    onDiscard,
  };

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();

        // The panel says to wait until the sweep shows the cards; a saved review has no Save.
        if (!frame.sweep && frame.saved === null) model?.submit();
      }}
    >
      {!hydrated || width === undefined ? (
        <>
          <PageHeader title={frame.title} breadcrumb={frame.breadcrumb} />
          <PageSkeleton label={frame.title} />
        </>
      ) : width >= DESK_FROM ? (
        <ReviewDesk {...layout} wide={width >= DESK_PINS_FROM} />
      ) : (
        <ReviewPager {...layout} />
      )}
    </form>
  );
}
