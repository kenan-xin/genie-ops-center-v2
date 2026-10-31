"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  Card,
  ConfirmDialog,
  InfoNote,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  WarningNote,
} from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  lazy,
  Suspense,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { invoicesContract } from "../contract.ts";
import { type DocumentKind, kindText } from "./document-kind.ts";
import { InvoiceReviewForm } from "./invoice-review-form.tsx";
import { PaymentReviewForm } from "./payment-review-form.tsx";
import {
  ReviewFieldList,
  type ReviewFieldKey,
  sourcesOf,
} from "./review-fields.tsx";
import { ReviewSaved } from "./review-saved.tsx";
import type { DocumentReviewView } from "./views.ts";

const DOCUMENTS_QUERY = ["invoices", "documents"] as const;

const POLL_MS = 3_000;

// react-pdf stays out of the module client's main bundle (decision 1).
const LazyDocumentViewer = lazy(() =>
  import("./document-viewer.tsx").then((module) => ({
    default: module.DocumentViewer,
  }))
);

const KIND_ITEMS: readonly {
  readonly value: DocumentKind;
  readonly label: string;
}[] = [
  { value: "invoice", label: kindText("invoice") },
  { value: "payment", label: kindText("payment") },
  { value: "paid-receipt", label: kindText("paid-receipt") },
  { value: "purchase-order", label: kindText("purchase-order") },
];

const subscribeToNothing = () => () => {};

const inBrowser = () => true;

const onServer = () => false;

function titleOf(kind: DocumentKind | null): string {
  switch (kind) {
    case "invoice":
      return "Review the invoice";
    case "payment":
      return "Review the payment";
    case "paid-receipt":
      return "Review the paid receipt";
    case "purchase-order":
      return "Review the purchase order";
    case null:
      return "Review the document";
  }
}

/** The inbox's sentence for a document that a person fills in by hand. */
function reasonSentence(reason: "ai-off" | "no-text-layer" | null): string {
  if (reason === "ai-off") return "AI was off. Fill in the fields by hand.";

  if (reason === "no-text-layer")
    return "The PDF has no text. Fill in the fields by hand.";

  return "";
}

/** One document's full-page review: the document on the left, its fields on the right (R-38). */
export function DocumentReview(props: {
  readonly view: DocumentReviewView;
}): ReactNode {
  const { view } = props;
  const id = view.document.id;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReviewFieldKey | null>(null);
  // The first link lasts the page's life, so a refetch never loads the PDF again.
  const [firstFileUrl] = useState(view.document.fileUrl);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const browser = useSyncExternalStore(subscribeToNothing, inBrowser, onServer);

  const review = useQuery({
    queryKey: [...DOCUMENTS_QUERY, id],
    queryFn: () => invoices.getDocumentReview({ id }),
    initialData: view,
    refetchInterval: (query) =>
      query.state.data?.document.status === "reading" ? POLL_MS : false,
  });

  const data = review.data;
  const kind = data.document.kind;
  const label = data.document.label;

  // Memoised: DocumentViewer recomputes its quote ranges on a new array.
  const highlights = useMemo(
    () => (selected === null ? [] : sourcesOf(data.reading, selected)),
    [data.reading, selected]
  );

  const changeKind = useMutation({
    mutationFn: (next: DocumentKind) =>
      invoices.setDocumentKind({ id, kind: next }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY }),
  });

  const discard = useMutation({
    mutationFn: () => invoices.discardDocument({ id }),
  });

  const title = titleOf(kind);

  const subtitle =
    kind === null
      ? `${label} · not classified${data.document.reason === null ? "" : `. ${reasonSentence(data.document.reason)}`}`
      : `${label} · classified as ${kindText(kind)} · click a field to see where it came from`;

  if (discard.isSuccess) {
    return (
      <main>
        <PageHeader title={title} />
        <p className="mt-6">Discarded. Nothing was added.</p>
        <PageLink href="/m/invoices/documents">Back to Documents</PageLink>
      </main>
    );
  }

  const showType =
    data.canWrite &&
    data.saved === null &&
    data.document.status !== "reading" &&
    data.document.status !== "could-not-read";

  const showDiscard =
    data.canWrite && data.saved === null && data.document.status !== "reading";

  let body: ReactNode;

  if (data.document.status === "reading") {
    body = (
      <p className="px-4 py-3 text-sm">
        Reading the document. The fields show when it is read.
      </p>
    );
  } else if (data.document.status === "could-not-read") {
    body = (
      <div className="flex flex-col gap-3 px-4 py-3">
        <WarningNote>
          The document could not be read. Retry it from Documents.
        </WarningNote>
        <PageLink href="/m/invoices/documents">Back to Documents</PageLink>
      </div>
    );
  } else if (kind === null) {
    body = (
      <p className="px-4 py-3 text-sm">
        Choose the type of this document to fill in its fields.
      </p>
    );
  } else if (data.saved !== null) {
    body = <ReviewSaved view={data} message={savedMessage} />;
  } else if (kind === "purchase-order") {
    body = (
      <div className="flex flex-col gap-3 py-3">
        <div className="px-4">
          <InfoNote>
            Kept as a reference. A purchase order changes no figure.
          </InfoNote>
        </div>
        <ReviewFieldList
          view={data}
          kind={kind}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    );
  } else if (data.canWrite && (kind === "invoice" || kind === "paid-receipt")) {
    body = (
      <InvoiceReviewForm
        view={data}
        kind={kind}
        selected={selected}
        onSelect={setSelected}
        onSaved={setSavedMessage}
        onDiscard={() => setDiscardOpen(true)}
      />
    );
  } else if (data.canWrite && kind === "payment") {
    body = (
      <PaymentReviewForm
        view={data}
        selected={selected}
        onSelect={setSelected}
        onSaved={setSavedMessage}
        onDiscard={() => setDiscardOpen(true)}
      />
    );
  } else {
    body = (
      <ReviewFieldList
        view={data}
        kind={kind}
        selected={selected}
        onSelect={setSelected}
      />
    );
  }

  return (
    <main>
      <PageHeader title={title} />
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          {browser ? (
            <Suspense
              fallback={<Skeleton aria-hidden className="aspect-3/4 w-full" />}
            >
              <LazyDocumentViewer
                url={firstFileUrl}
                label={label}
                highlights={highlights}
              />
            </Suspense>
          ) : (
            <Skeleton aria-hidden className="aspect-3/4 w-full" />
          )}
        </div>
        <Card>
          <div className="flex flex-col">
            {showType ? (
              <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
                <span
                  id="document-kind-label"
                  className="text-sm text-muted-foreground"
                >
                  Type
                </span>
                <Select
                  items={KIND_ITEMS}
                  value={kind}
                  disabled={changeKind.isPending}
                  onValueChange={(next) => {
                    if (next !== null && next !== kind) changeKind.mutate(next);
                  }}
                >
                  <SelectTrigger aria-labelledby="document-kind-label">
                    <SelectValue placeholder="Choose the type" />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {changeKind.error === null ? null : (
                  <p role="alert" className="text-sm text-destructive">
                    {`${label} was not changed. ${changeKind.error.message}`}
                  </p>
                )}
              </div>
            ) : null}
            {body}
            {showDiscard ? (
              <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
                {discard.error === null ? null : (
                  <p role="alert" className="text-sm text-destructive">
                    {`${label} was not discarded. ${discard.error.message}`}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    loading={discard.isPending}
                    onClick={() => setDiscardOpen(true)}
                  >
                    Discard
                  </Button>
                </div>
                <ConfirmDialog
                  open={discardOpen}
                  title={`Discard ${label}?`}
                  description="The file is removed and nothing is added. You can upload it again later."
                  confirmLabel="Discard"
                  danger
                  onConfirm={() => {
                    setDiscardOpen(false);
                    discard.mutate();
                  }}
                  onClose={() => setDiscardOpen(false)}
                />
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
