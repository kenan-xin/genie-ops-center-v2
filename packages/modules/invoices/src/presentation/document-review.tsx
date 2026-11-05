"use client";

import { useAgentPage } from "@genie/core/features/agent/panel";
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
  ToggleGroup,
  ToggleGroupItem,
} from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";

import { invoicesContract, RECORD_TYPES } from "../contract.ts";
import { AutomaticLinks } from "./automatic-links.tsx";
import { type DocumentKind, kindText } from "./document-kind.ts";
import { LazyDocumentViewer } from "./document-viewer-lazy.tsx";
import { shortName } from "./format.ts";
import { InvoiceReviewForm } from "./invoice-review-form.tsx";
import { PaymentReviewForm } from "./payment-review-form.tsx";
import {
  ReviewFieldList,
  type ReviewFieldKey,
  sourcesOf,
} from "./review-fields.tsx";
import { linkButton, ReviewResult, savedTitle } from "./review-result.tsx";
import type { DocumentReviewView } from "./views.ts";

const DOCUMENTS_QUERY = ["invoices", "documents"] as const;

const POLL_MS = 3_000;

const KIND_ITEMS: readonly {
  readonly value: DocumentKind;
  readonly label: string;
}[] = [
  { value: "invoice", label: kindText("invoice") },
  { value: "payment", label: kindText("payment") },
  { value: "paid-receipt", label: kindText("paid-receipt") },
  { value: "purchase-order", label: kindText("purchase-order") },
];

const DOCUMENTS_HREF = "/m/invoices/documents";

/** The trail names the step, so the file name shows once, in the meta line (design review 4.2). */
const TRAIL = {
  parent: { label: "Documents", href: DOCUMENTS_HREF },
  current: "Review",
} as const;

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
  // Below `lg` one pane shows at a time; from `lg` both sit side by side (choice 14).
  const [pane, setPane] = useState<"fields" | "document">("fields");

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

  useAgentPage({
    context: {
      page: "Document review",
      record: { type: RECORD_TYPES.document, id },
    },
    about: label,
  });

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
    // Exact: the list only, so the deleted document's own review is not fetched again.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY, exact: true }),
  });

  const title = titleOf(kind);

  const about =
    kind === null
      ? `not classified${data.document.reason === null ? "" : `. ${reasonSentence(data.document.reason)}`}`
      : `classified as ${kindText(kind)} · select a field to see where it came from`;

  const meta = (
    <>
      <span title={label}>{shortName(label)}</span>
      {` · ${about}`}
    </>
  );

  if (discard.isSuccess) {
    return (
      <main>
        <PageHeader title={title} breadcrumb={TRAIL} />
        <ReviewResult
          tone="discarded"
          title={`Discarded ${label}. Nothing was added.`}
          canUpload={data.canWrite}
        />
      </main>
    );
  }

  const saved = data.saved;

  if (saved !== null) {
    return (
      <main>
        <PageHeader
          title={title}
          breadcrumb={TRAIL}
          meta={<span title={label}>{shortName(label)}</span>}
        />
        <ReviewResult
          tone="saved"
          title={savedTitle(saved)}
          {...(savedMessage === null ? {} : { detail: savedMessage })}
          records={
            <>
              {saved.invoice === null ? null : (
                <PageLink
                  href={`/m/invoices/invoices/${saved.invoice.id}`}
                  className={linkButton("primary")}
                >
                  Open the invoice
                </PageLink>
              )}
              {saved.payment === null ? null : (
                <PageLink
                  href={`/m/invoices/payments/${saved.payment.id}`}
                  // One primary per card: a paid receipt leads with its invoice.
                  className={linkButton(
                    saved.invoice === null ? "primary" : "secondary"
                  )}
                >
                  Open the payment
                </PageLink>
              )}
            </>
          }
          canUpload={data.canWrite}
        >
          <AutomaticLinks view={data} />
        </ReviewResult>
      </main>
    );
  }

  // A Could not read document takes a type too, so a person enters it by hand (R-26).
  const showType = data.canWrite && data.document.status !== "reading";

  const couldNotRead = data.document.status === "could-not-read";

  const showDiscard = showType;

  let body: ReactNode;

  if (data.document.status === "reading") {
    body = (
      <p className="px-4 py-3 text-sm">
        Reading the document. The fields show when it is read.
      </p>
    );
  } else if (kind === null) {
    body = (
      <p className="px-4 py-3 text-sm">
        Choose the type of this document to fill in its fields.
      </p>
    );
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
        discarding={discard.isPending}
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
        discarding={discard.isPending}
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

  // A save form carries Discard in its own bar; every other body shows it under the card.
  const formBody =
    data.canWrite &&
    data.document.status !== "reading" &&
    kind !== null &&
    kind !== "purchase-order";

  return (
    <main>
      <PageHeader title={title} breadcrumb={TRAIL} meta={meta} />
      {couldNotRead ? (
        <div className="mb-4">
          <ReviewResult
            tone="unread"
            title="The document could not be read."
            detail="Retry it from Documents, or choose its type and fill in the fields by hand."
            canUpload={false}
          />
        </div>
      ) : null}
      <ToggleGroup
        aria-label="Show"
        className="mb-4 lg:hidden"
        value={[pane]}
        onValueChange={(value) => {
          const [chosen] = value;

          // A press on the pressed item answers none; the pane stays.
          if (chosen === "fields" || chosen === "document") setPane(chosen);
        }}
      >
        <ToggleGroupItem value="fields">Fields</ToggleGroupItem>
        <ToggleGroupItem value="document">Document</ToggleGroupItem>
      </ToggleGroup>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* Hidden, not unmounted, so the PDF never loads again (`firstFileUrl`). */}
        <div
          className={`min-w-0 ${pane === "document" ? "" : "max-lg:hidden"}`}
        >
          <LazyDocumentViewer
            url={firstFileUrl}
            label={label}
            highlights={highlights}
          />
        </div>
        {/* `overflow-clip`, not `-hidden`, so the save bar sticks to the screen, not the card. */}
        <Card
          className={`overflow-clip ${pane === "fields" ? "" : "max-lg:hidden"}`}
        >
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
              <>
                {formBody && discard.error === null ? null : (
                  <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
                    {discard.error === null ? null : (
                      <p role="alert" className="text-sm text-destructive">
                        {`${label} was not discarded. ${discard.error.message}`}
                      </p>
                    )}
                    {formBody ? null : (
                      <div className="flex justify-end">
                        <Button
                          variant="secondary"
                          loading={discard.isPending}
                          onClick={() => setDiscardOpen(true)}
                        >
                          Discard
                        </Button>
                      </div>
                    )}
                  </div>
                )}
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
              </>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
