"use client";

import { PageHeader, PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  buttonVariants,
  CountPill,
  DataTable,
  type DataTableColumn,
  EmptyState,
  focusRing,
  InfoNote,
  infoTint,
  ToggleGroup,
  ToggleGroupItem,
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

import { invoicesContract } from "../contract.ts";
import type { DocumentStatus } from "../contract.ts";
import { kindText } from "./document-kind.ts";
import { DocumentStatusBadge } from "./document-status-badge.tsx";
import { formatInstant, formatMoney } from "./format.ts";
import { type InboxGroup, inboxGroupOf } from "./inbox-groups.ts";
import { useListPages } from "./use-list-pages.ts";
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

/** The groups top to bottom (design review 3.1, choice 13). */
const GROUPS: readonly {
  readonly group: InboxGroup;
  readonly label: string;
}[] = [
  { group: "needs-you", label: "Needs you" },
  { group: "reading", label: "Reading" },
  { group: "done", label: "Done" },
];

/** The chips; Reading shows under All only, because nobody acts on it. */
type Shown = "all" | "needs-you" | "done";

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
  const [shown, setShown] = useState<Shown>("all");
  // Keys for refusals and Duplicate rows; `crypto.randomUUID` exists only in a secure context.
  const serial = useRef(0);
  const nextKey = () => `upload-${(serial.current += 1)}`;

  // The list reads one page at a time from the cursor, and Show more reads the next (czjw.49).
  const list = useListPages({
    key: DOCUMENTS_QUERY,
    first: view,
    read: (after) => invoices.listDocuments({ after }),
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
        setDuplicates((previous) => [
          {
            id: nextKey(),
            label: file.name,
            kind: null,
            status: "duplicate",
            reason: null,
            uploadedAt: new Date().toISOString(),
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
    (state) => ({ busy: !state.isEmpty || state.activeItems.length > 0 })
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

    for (const file of Array.from(files)) uploads.addItem(file);

    uploads.start();
  }

  const data = view;
  const rows: readonly InboxRow[] = [...duplicates, ...listed];

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
    ) : inboxGroupOf(row.status) === "needs-you" && data.canUpload ? (
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

  const columns: readonly DataTableColumn<InboxRow>[] = [
    { id: "document", header: "Document", cell: documentLabel },
    { id: "type", header: "Type", cell: (row) => kindText(row.kind) },
    { id: "found", header: "What we found", cell: (row) => foundText(row) },
    { id: "uploaded", header: "Uploaded", cell: uploaded },
  ];

  const grouped = GROUPS.map(({ group, label }) => ({
    group,
    label,
    rows: rows.filter((row) => inboxGroupOf(row.status) === group),
  }));

  const sizeOf = (group: InboxGroup) =>
    grouped.find((entry) => entry.group === group)?.rows.length ?? 0;

  const needYou = sizeOf("needs-you");

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
          rows.length === 0
            ? "Nothing uploaded yet."
            : `${needYou} ${needYou === 1 ? "needs" : "need"} you. Newest uploads first.`
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
        {rows.length === 0 && data.canUpload ? (
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
        ) : rows.length === 0 ? (
          <EmptyState
            variant="framed"
            title="No documents yet"
            description="Uploaded invoices, receipts and payment evidence show here with their reading status."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <ToggleGroup
              aria-label="Show"
              value={[shown]}
              onValueChange={(value) => {
                const [chosen] = value;

                // A click on the pressed chip answers no chip; the list keeps its group.
                if (
                  chosen === "all" ||
                  chosen === "needs-you" ||
                  chosen === "done"
                )
                  setShown(chosen);
              }}
            >
              <ToggleGroupItem value="all">All {rows.length}</ToggleGroupItem>
              <ToggleGroupItem value="needs-you">
                Needs you {needYou}
              </ToggleGroupItem>
              <ToggleGroupItem value="done">
                Done {sizeOf("done")}
              </ToggleGroupItem>
            </ToggleGroup>
            <div
              className={`overflow-hidden rounded-xl border ${
                dragging && data.canUpload
                  ? `border-primary dark:border-brand-on-dark ${infoTint}`
                  : "border-border"
              }`}
              {...(data.canUpload ? dropTarget : {})}
            >
              {grouped.flatMap((entry) =>
                entry.rows.length === 0 ||
                (shown !== "all" && shown !== entry.group) ? (
                  []
                ) : (
                  <section
                    key={entry.group}
                    aria-labelledby={`inbox-${entry.group}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                      <h2
                        id={`inbox-${entry.group}`}
                        className="text-base font-semibold"
                      >
                        {entry.label}
                      </h2>
                      <CountPill>{entry.rows.length}</CountPill>
                    </div>
                    <DataTable
                      label={entry.label}
                      framed={false}
                      rows={entry.rows}
                      rowKey={(row) => row.id}
                      rowLabel={(row) => row.label}
                      columns={columns}
                      status={(row) => (
                        <span className="flex flex-wrap items-center gap-2">
                          <DocumentStatusBadge status={row.status} />
                          {rowAction(row)}
                        </span>
                      )}
                      card={{
                        title: documentLabel,
                        badge: (row) => (
                          <DocumentStatusBadge status={row.status} />
                        ),
                        facts: (row) => [foundText(row)],
                        detail: (row) =>
                          `${kindText(row.kind)} · uploaded ${uploaded(row)}`,
                        content: rowAction,
                      }}
                    />
                  </section>
                )
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {list.more ? (
                <>
                  <p>Showing the first {listed.length} documents.</p>
                  <Button
                    variant="secondary"
                    disabled={list.loading}
                    onClick={list.showMore}
                  >
                    {list.loading ? "Loading more…" : "Show more"}
                  </Button>
                </>
              ) : null}
              {list.failed ? (
                <p role="alert">
                  More documents could not be read. Try Show more again.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
