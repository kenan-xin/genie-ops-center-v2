"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  buttonVariants,
  type DataTableColumn,
  EmptyState,
  focusRing,
  InfoNote,
  infoTint,
  ListHeader,
  useListState,
} from "@genie/ui";
import { useAsyncQueuer } from "@tanstack/react-pacer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadIcon } from "lucide-react";
import {
  type DragEvent,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DOCUMENT_KINDS,
  documentListParams,
  invoicesContract,
} from "../contract.ts";
import type { DocumentStatus } from "../contract.ts";
import { kindText } from "./document-kind.ts";
import { DocumentStatusBadge } from "./document-status-badge.tsx";
import { formatInstant, formatMoney } from "./format.ts";
import { documentListDefinition } from "./list-definitions.ts";
import {
  procedureParams,
  useListPages,
  withOptions,
} from "./use-list-pages.ts";
import type { DocumentInboxPageView, DocumentInboxRow } from "./views.ts";

export type DocumentInboxProps = {
  readonly view: DocumentInboxPageView;
};

/** A `duplicate` answer adds a row for this visit; nothing was stored (R-23, decision 10). */
type DuplicateRow = Omit<DocumentInboxRow, "status"> & {
  readonly status: "duplicate";
  readonly sameAs: string;
};

type InboxRow = DocumentInboxRow | DuplicateRow;

type Refusal = {
  readonly key: string;
  readonly name: string;
  readonly message: string;
};

const DOCUMENTS_QUERY = ["invoices", "documents"] as const;

/** The inbox list header, with one type option per document kind (LH24). */
const DEFINITION = withOptions(
  documentListDefinition,
  "type",
  DOCUMENT_KINDS.map((kind) => ({ value: kind, label: kindText(kind) }))
);

/** The statuses that wait for the person, the Needs you tab (decision 11, LH20). */
const NEEDS_YOU = new Set<string>(
  documentListDefinition.tabs.items[0].statuses
);

const LEAVE_WARNING =
  "Files are still uploading. If you leave this page, the files that did not upload yet are dropped. Leave the page?";

/** The most ids one status poll asks for, as the procedure accepts (czjw.49). */
const STATUS_POLL_CHUNK = 100;

/**
 * The status of every named document. The procedure takes at most `STATUS_POLL_CHUNK` ids, so a
 * batch of uploads larger than one chunk asks in parallel chunks; otherwise its refused call
 * would leave every row of the batch unread forever (czjw.49).
 */
async function documentStatusOf(
  invoices: ReturnType<typeof useModuleClient<typeof invoicesContract>>,
  ids: readonly string[]
): Promise<DocumentStatus[]> {
  const chunks: string[][] = [];

  for (let at = 0; at < ids.length; at += STATUS_POLL_CHUNK) {
    chunks.push(ids.slice(at, at + STATUS_POLL_CHUNK));
  }

  const answers = await Promise.all(
    chunks.map((chunk) => invoices.documentStatus({ ids: chunk }))
  );

  return answers.flat();
}

/** The wait after each poll: 2, 4, 8 seconds, then 15 at most (czjw.49). */
const POLL_WAITS_MS = [2_000, 4_000, 8_000, 15_000] as const;

/** The wait after `tick` answers: the first is 2 seconds, and the last repeats. */
export function pollWaitMs(tick: number): number {
  return POLL_WAITS_MS[Math.min(tick, POLL_WAITS_MS.length - 1)] ?? 15_000;
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
  const [dragging, setDragging] = useState(false);
  // Keys for refusals and Duplicate rows; `crypto.randomUUID` exists only in a secure context.
  const serial = useRef(0);
  const nextKey = () => `upload-${(serial.current += 1)}`;

  // The tab, the filters and the sort live in the address; the server page is the default one.
  const state = useListState(DEFINITION);
  const params = procedureParams(documentListParams, state.params);
  const filtered = Object.keys(params).length > 0;

  // The list reads one page at a time from the cursor (czjw.49).
  const list = useListPages<DocumentInboxPageView>({
    key: [...DOCUMENTS_QUERY, params],
    first: filtered ? undefined : view,
    read: (after) => invoices.listDocuments({ after, params }),
  });

  // Only the rows still Reading are polled, by their ids, so a finished row costs no poll (czjw.49).
  const readingIds = list.rows
    .filter((row) => row.status === "reading")
    .map((row) => row.id);

  const statuses = useQuery({
    queryKey: [...DOCUMENTS_QUERY, "status", readingIds.join(",")],
    queryFn: () => documentStatusOf(invoices, readingIds),
    enabled: readingIds.length > 0,
    // The wait grows with each answer, and `false` stops the timer; the next reading starts it again.
    refetchInterval: (query) =>
      query.state.data === undefined
        ? false
        : pollWaitMs(query.state.dataUpdateCount - 1),
  });

  const latest = new Map(
    (statuses.data ?? []).map((status) => [status.id, status])
  );

  const listed = list.rows.map((row) => {
    const status = latest.get(row.id);

    return status === undefined ? row : { ...row, ...status };
  });

  const reading = listed.some((row) => row.status === "reading");

  // One reload when the last reading ends: the list brings the found values the poll leaves out.
  useEffect(() => {
    if (statuses.data === undefined || reading) return;

    void list.reload();
    // A finished reading is one event; `reading` turns false once, after it.
  }, [reading, statuses.data === undefined]);

  // One file at a time, in the chosen order (decision 9). A refusal is kept beside its name.
  const uploads = useAsyncQueuer<File, { readonly busy: boolean }>(
    async (file) => {
      const answer = await invoices.uploadDocument({ file });

      if (answer.outcome === "duplicate") {
        const now = new Date().toISOString();

        setDuplicates((previous) => [
          {
            id: nextKey(),
            label: file.name,
            kind: null,
            status: "duplicate",
            reason: null,
            uploadedAt: now,
            updatedAt: now,
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
          { key: nextKey(), name: file.name, message: refusalMessage(error) },
        ]);
      },
    },
    (queue) => ({ busy: !queue.isEmpty || queue.activeItems.length > 0 })
  );

  const { busy } = uploads.state;

  // While files wait or upload, leaving drops them, so a reload, a close or an app link asks first.
  useEffect(() => {
    if (!busy) return undefined;

    const unload = (event: BeforeUnloadEvent) => event.preventDefault();

    // An app link is a client navigation that `beforeunload` never sees. Only `preventDefault`:
    // the host's router link skips a prevented click (czjw.39).
    const click = (event: MouseEvent) => {
      const link =
        event.target instanceof Element ? event.target.closest("a") : null;

      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.origin !== window.location.origin ||
        event.defaultPrevented
      )
        return;

      if (!window.confirm(LEAVE_WARNING)) event.preventDefault();
    };

    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);

    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [busy]);

  const retry = useMutation({
    mutationFn: (id: string) => invoices.retryReading({ id }),
    // A refused Retry reads the list too: the row may have changed on the server (czjw.39).
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY }),
  });

  function choose(files: FileList | null) {
    if (files === null) return;

    setRefusals([]);
    // The new rows show under All with no filter, at the top under the default sort (LH20, I13).
    state.set({
      ...Object.fromEntries(
        DEFINITION.filters.map((filter) => [filter.id, undefined])
      ),
      sort: undefined,
      status: "all",
    });

    for (const file of Array.from(files)) uploads.addItem(file);

    uploads.start();
  }

  const data = view;

  // This visit's Duplicate rows are done, so they show under All and Done.
  const rows: readonly InboxRow[] =
    state.tab === "all" || state.tab === "done"
      ? [...duplicates, ...listed]
      : listed;

  const counts = list.first?.counts ?? undefined;
  const needYou = counts?.["needs-you"] ?? 0;

  // The tab never narrows the counts, so with no filter All counts the whole inbox. The latest
  // page decides, so a first upload leaves the drop zone and a refused one keeps it.
  const narrowed =
    params.q !== undefined ||
    params.type !== undefined ||
    params.uploaded !== undefined;

  const inboxEmpty =
    rows.length === 0 &&
    !narrowed &&
    (counts?.["all"] ?? view.counts?.["all"] ?? 0) === 0;

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

  // Every row that waits for the person offers its review; Could not read offers Retry (3.2).
  const rowAction = (row: InboxRow): ReactNode =>
    row.status === "could-not-read" ? (
      retryButton(row)
    ) : NEEDS_YOU.has(row.status) && data.canUpload ? (
      <PageLink
        href={`/m/invoices/documents/${row.id}`}
        aria-label={`Review ${row.label}`}
        className={`${buttonVariants({ variant: "secondary", size: "sm" })} ${focusRing}`}
      >
        Review
      </PageLink>
    ) : null;

  // A stored row opens its review; a Duplicate row has no record to open (R-23).
  const documentLabel = (row: InboxRow): ReactNode =>
    row.status === "duplicate" ? (
      row.label
    ) : (
      <PageLink href={`/m/invoices/documents/${row.id}`} title={row.label}>
        {row.label}
      </PageLink>
    );

  const uploaded = (row: InboxRow) =>
    formatInstant(row.uploadedAt, data.timeZone);

  const updated = (row: InboxRow) =>
    formatInstant(row.updatedAt, data.timeZone);

  const columns: readonly DataTableColumn<InboxRow>[] = [
    { id: "document", header: "Document", cell: documentLabel },
    { id: "type", header: "Type", cell: (row) => kindText(row.kind) },
    { id: "found", header: "What we found", cell: (row) => foundText(row) },
    { id: "uploaded", header: "Uploaded", cell: uploaded, sort: "date" },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <DocumentStatusBadge status={row.status} />
          {rowAction(row)}
        </span>
      ),
    },
    { id: "updated", header: "Updated", cell: updated, sort: "date" },
  ];

  // The quick ranges of Uploaded count from today in the tenant's zone (LH25).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.timeZone,
  }).format(new Date());

  // A drop anywhere on the inbox uploads, so the zone of an empty inbox and the list share it.
  const dropTarget = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      // Crossing the button or the text fires dragleave; only leaving the zone ends the drag.
      const into = event.relatedTarget;

      if (!(into instanceof Node && event.currentTarget.contains(into)))
        setDragging(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(false);
      choose(event.dataTransfer.files);
    },
  };

  const upload = data.canUpload ? (
    <Button onClick={() => input.current?.click()}>
      <UploadIcon aria-hidden="true" data-icon="inline-start" />
      Upload
    </Button>
  ) : undefined;

  return (
    <main>
      <PageHeader
        title="Documents"
        meta={
          inboxEmpty
            ? "Nothing uploaded yet."
            : needYou === 0
              ? "No document needs you."
              : `${needYou} ${needYou === 1 ? "needs" : "need"} you.`
        }
        actions={upload}
      />
      {data.ai === "on" ? null : (
        <InfoNote size="md" role="status">
          AI is off. Documents are stored, and you fill in their fields by hand.
        </InfoNote>
      )}
      {data.canUpload ? (
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
      ) : null}
      {refusals.length === 0 ? null : (
        <div role="alert" className="mt-4 text-sm text-destructive">
          {refusals.map((refusal) => (
            <p key={refusal.key}>{`${refusal.name}: ${refusal.message}`}</p>
          ))}
        </div>
      )}
      <div className="mt-4">
        {retryFailed === null ? null : (
          <p role="alert" className="mb-2 text-sm text-destructive">
            {retryFailed}
          </p>
        )}
        {list.broken ? (
          <p role="alert" className="mb-2 text-sm text-destructive">
            The documents could not be read. Change a filter to try again.
          </p>
        ) : null}
        {inboxEmpty && data.canUpload ? (
          <div
            data-drop-zone=""
            // tokens.md, Drop zone: the tint while dragging carries state, so it stays blue.
            className={`rounded-xl border p-4 ${
              dragging
                ? `border-solid border-primary dark:border-brand-on-dark ${infoTint}`
                : "border-dashed border-input bg-muted"
            }`}
            {...dropTarget}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {dragging ? "Drop to upload" : "Drop PDF files here, or"}
              </span>
              <Button
                variant="secondary"
                onClick={() => input.current?.click()}
              >
                Choose PDF files
              </Button>
            </div>
          </div>
        ) : inboxEmpty ? (
          <EmptyState
            variant="framed"
            title="No documents yet"
            description="Uploaded invoices, receipts and payment evidence show here with their reading status."
          />
        ) : (
          <div
            className={`rounded-xl ${
              dragging && data.canUpload
                ? `ring-2 ring-primary dark:ring-brand-on-dark ${infoTint}`
                : ""
            }`}
            {...(data.canUpload ? dropTarget : {})}
          >
            <ListHeader
              definition={DEFINITION}
              state={state}
              counts={counts}
              anchorDay={today}
              table={{
                rows,
                rowKey: (row) => row.id,
                rowLabel: (row) => row.label,
                columns,
                card: {
                  title: documentLabel,
                  badge: (row) => <DocumentStatusBadge status={row.status} />,
                  facts: (row) => [foundText(row), `Updated ${updated(row)}`],
                  detail: (row) =>
                    `${kindText(row.kind)} · uploaded ${uploaded(row)}`,
                  content: rowAction,
                },
              }}
              page={{
                loaded: rows.length,
                more: list.more,
                loading: list.pending || list.loading,
                failed: list.failed,
                onMore: list.showMore,
              }}
              empty={
                state.tab === "needs-you" && !filtered
                  ? {
                      title: "Nothing needs you.",
                      description:
                        "Documents that wait for your review or a retry show here.",
                    }
                  : {
                      title: "No document matches these filters.",
                      description: "Change a filter, or clear them all.",
                    }
              }
            />
          </div>
        )}
      </div>
    </main>
  );
}
