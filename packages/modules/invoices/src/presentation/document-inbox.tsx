"use client";

import { PageHeader } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  InfoNote,
} from "@genie/ui";
import { useAsyncQueuer } from "@tanstack/react-pacer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { invoicesContract } from "../contract.ts";
import { DocumentStatusBadge } from "./document-status-badge.tsx";
import { formatMoney } from "./format.ts";
import type { DocumentInboxRow, DocumentInboxView } from "./views.ts";

export type DocumentInboxProps = {
  readonly view: DocumentInboxView;
};

/** A `duplicate` answer adds a row for this visit; nothing was stored (R-23, decision 10). */
type DuplicateRow = Omit<DocumentInboxRow, "status"> & {
  readonly status: "duplicate";
  readonly sameAs: string;
};

type InboxRow = DocumentInboxRow | DuplicateRow;

type Refusal = {
  readonly name: string;
  readonly message: string;
};

const DOCUMENTS_QUERY = ["invoices", "documents"] as const;

const POLL_MS = 3_000;

function kindText(kind: DocumentInboxRow["kind"]): string {
  switch (kind) {
    case "invoice":
      return "Invoice";
    case "payment":
      return "Payment evidence";
    case "paid-receipt":
      return "Paid receipt";
    case "purchase-order":
      return "Purchase order";
    case null:
      return "Not classified";
  }
}

/** The one line of "What we found", in the order of R-37 and decision 11. */
function foundText(row: InboxRow): string {
  if (row.status === "duplicate") return `Same file as ${row.sameAs}`;

  if (row.status === "reading") return "Reading the document";

  if (row.status === "could-not-read") return "The document could not be read";

  if (row.reason === "ai-off" && row.status === "needs-input") {
    return "AI was off. Fill in the fields by hand.";
  }

  if (row.reason === "no-text-layer" && row.status === "needs-input") {
    return "The PDF has no text. Fill in the fields by hand.";
  }

  if (row.kind === "purchase-order") return "No figure changes";

  if (row.found === null) return "Nothing found";

  const { customer, currency, amountCents, invoiceNumbers } = row.found;
  const parts: string[] = [];

  if (customer !== null) parts.push(customer);

  if (amountCents !== null && currency !== null) {
    parts.push(formatMoney(amountCents, currency));
  }

  let text = parts.join(" · ");

  if (invoiceNumbers.length === 1) text += ` → ${invoiceNumbers[0]}`;
  else if (invoiceNumbers.length > 1) {
    text += ` → ${invoiceNumbers.length} invoices`;
  }

  return text === "" ? "Nothing found" : text;
}

function refusalMessage(error: Error): string {
  return error.message === ""
    ? "That file could not be uploaded."
    : error.message;
}

/** The Documents inbox: the list, the upload queue, Retry and the AI-off notice (R-37, R-20). */
export function DocumentInbox(props: DocumentInboxProps) {
  const { view } = props;
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [refusals, setRefusals] = useState<readonly Refusal[]>([]);
  const [duplicates, setDuplicates] = useState<readonly DuplicateRow[]>([]);

  const documents = useQuery({
    queryKey: DOCUMENTS_QUERY,
    queryFn: () => invoices.listDocuments(),
    initialData: view,
    refetchInterval: (query) =>
      query.state.data?.rows.some((row) => row.status === "reading") === true
        ? POLL_MS
        : false,
  });

  // One file at a time, in the chosen order (decision 9). A refusal is kept beside its name.
  const uploads = useAsyncQueuer<File>(
    async (file) => {
      const answer = await invoices.uploadDocument({ file });

      if (answer.outcome === "duplicate") {
        setDuplicates((previous) => [
          {
            id: crypto.randomUUID(),
            label: file.name,
            kind: null,
            status: "duplicate",
            reason: null,
            found: null,
            sameAs: answer.label,
          },
          ...previous,
        ]);
      }

      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY });
    },
    {
      concurrency: 1,
      onError: (error, file) => {
        setRefusals((previous) => [
          ...previous,
          { name: file.name, message: refusalMessage(error) },
        ]);
      },
    }
  );

  const retry = useMutation({
    mutationFn: (id: string) => invoices.retryReading({ id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY }),
  });

  function choose(files: FileList | null) {
    if (files === null) return;

    setRefusals([]);

    for (const file of Array.from(files)) uploads.addItem(file);

    uploads.start();
  }

  const data = documents.data;
  const rows: readonly InboxRow[] = [...duplicates, ...data.rows];

  // The save-failure rule of DESIGN.md: one alert line with what failed and why; Retry stays the retry.
  const retryFailed =
    retry.error === null
      ? null
      : `${rows.find((row) => row.id === retry.variables)?.label ?? "The document"} was not read again. ${retry.error.message}`.trim();

  const retryButton = (row: InboxRow) =>
    row.status === "could-not-read" && data.canUpload ? (
      <Button
        variant="secondary"
        size="sm"
        loading={retry.isPending && retry.variables === row.id}
        onClick={() => retry.mutate(row.id)}
      >
        Retry
      </Button>
    ) : null;

  const columns: readonly DataTableColumn<InboxRow>[] = [
    { id: "document", header: "Document", cell: (row) => row.label },
    { id: "type", header: "Type", cell: (row) => kindText(row.kind) },
    { id: "found", header: "What we found", cell: (row) => foundText(row) },
  ];

  return (
    <main>
      <PageHeader
        title="Documents"
        description="Drop invoices, receipts and payment evidence in any order. Each one is read, classified and matched."
      />
      {data.ai === "on" ? null : (
        <InfoNote size="md" role="status">
          AI is off. Documents are stored, and you fill in their fields by hand.
        </InfoNote>
      )}
      {data.canUpload ? (
        <div
          className="mt-4 rounded-xl border border-dashed border-input bg-muted p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            choose(event.dataTransfer.files);
          }}
        >
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose PDF files"
            onChange={(event) => {
              choose(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Drop PDF files here, or
            </span>
            <Button variant="secondary" onClick={() => input.current?.click()}>
              Choose PDF files
            </Button>
          </div>
          {refusals.length === 0 ? null : (
            <div role="alert" className="mt-2 text-sm text-destructive">
              {refusals.map((refusal) => (
                <p key={`${refusal.name} ${refusal.message}`}>
                  {`${refusal.name}: ${refusal.message}`}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : null}
      <div className="mt-6">
        {retryFailed === null ? null : (
          <p role="alert" className="mb-2 text-sm text-destructive">
            {retryFailed}
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState
            variant="framed"
            title="No documents yet"
            description="Uploaded invoices, receipts and payment evidence show here with their reading status."
          />
        ) : (
          <>
            <DataTable
              label="Documents"
              rows={rows}
              rowKey={(row) => row.id}
              rowLabel={(row) => row.label}
              columns={columns}
              status={(row) => (
                <span className="flex flex-wrap items-center gap-2">
                  <DocumentStatusBadge status={row.status} />
                  {retryButton(row)}
                </span>
              )}
              card={{
                title: (row) => row.label,
                badge: (row) => <DocumentStatusBadge status={row.status} />,
                detail: (row) => kindText(row.kind),
                facts: (row) => [foundText(row)],
                content: retryButton,
              }}
            />
            {data.truncated ? (
              <p>Showing the first {data.rows.length} documents.</p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
