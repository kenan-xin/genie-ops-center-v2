import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  expect,
  fireEvent,
  fn,
  spyOn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";

import {
  aiOffDocumentInbox,
  defaultDocumentInbox,
  emptyDocumentInbox,
  needsYouDocumentInbox,
  nothingNeedsYouDocumentInbox,
  readOnlyDocumentInbox,
} from "./__fixtures__/documents.ts";
import { DocumentInbox } from "./document-inbox.tsx";
import type {
  DocumentInboxRow,
  DocumentInboxView,
  InboxStatus,
} from "./views.ts";

const listDocuments = fn();

const uploadDocument = fn();

const retryReading = fn();

const documentStatus = fn();

/** The order the mock saw each upload start and end, to prove one at a time. */
const uploadEvents: string[] = [];

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const STATUS_WORDS = [
  "Reading",
  "Could not read",
  "Needs your input",
  "Linked automatically",
  "Confirm the split",
  "Possible duplicate",
  "No matching invoice",
  "Kept as a reference",
  "Saved",
] as const;

/** A fresh query cache per story, with no retries so a refused call reports at once. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider
        client={{
          invoices: {
            uploadDocument,
            listDocuments,
            retryReading,
            documentStatus,
          },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Invoices/Documents inbox",
  component: DocumentInbox,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Documents inbox at `/m/invoices/documents` (Spec 7 R-20, R-23, R-37) on the list header (variant C, `czjw.73`): the status tabs Needs you, Reading, Done and All with their counts, a search, the type and the upload date range, and the columns Document, Type, What we found, Uploaded, Status and Updated. Needs you is the resting tab, and a tab with no rows shows no count (`czjw.68`). An upload moves the list to All. The list polls the rows that are Reading. Uploads go one at a time in the chosen order; an exact copy adds a Duplicate (nothing added) row for this visit, and a refusal shows beside its file name while the next file still uploads. A Could not read row offers Retry. With AI off the page says that a person fills the fields by hand.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { view: needsYouDocumentInbox },
  // Each story leaves the address as it found it.
  beforeEach: () => {
    const before = window.location.href;

    return () => window.history.replaceState(null, "", before);
  },
} satisfies Meta<typeof DocumentInbox>;

export default meta;

type Story = StoryObj<typeof meta>;

const pdf = (name: string) =>
  new File(["%PDF-1.4\n"], name, { type: "application/pdf" });

const uploaded = (name: string) => ({
  outcome: "uploaded" as const,
  documentId: `document-${name}`,
});

function serve(view: DocumentInboxView) {
  listDocuments.mockReset().mockResolvedValue(view);
  uploadDocument.mockReset().mockResolvedValue(uploaded("file"));
  retryReading.mockReset().mockResolvedValue({ documentId: "document-id" });
  documentStatus.mockReset().mockResolvedValue([]);
  uploadEvents.length = 0;
}

function rowWithStatus(status: InboxStatus): DocumentInboxRow {
  const row = defaultDocumentInbox.rows.find(
    (candidate) => candidate.status === status
  );

  if (row === undefined) throw new Error(`The fixture has no ${status} row.`);

  return row;
}

const COULD_NOT_READ = rowWithStatus("could-not-read");

const READING = rowWithStatus("reading");

const readingView: DocumentInboxView = {
  ...defaultDocumentInbox,
  rows: [READING],
};

const retryView: DocumentInboxView = {
  ...defaultDocumentInbox,
  rows: [COULD_NOT_READ],
};

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];

/** Opens the story at an address with these list parameters. */
function atAddress(query: string) {
  const url = new URL(window.location.href);

  for (const [name, value] of new URLSearchParams(query)) {
    url.searchParams.set(name, value);
  }

  window.history.replaceState(null, "", url);
}

const param = (name: string) =>
  new URLSearchParams(window.location.search).get(name);

/** The one table of the inbox. */
const documents = (canvas: Canvas) =>
  within(canvas.getByRole("table", { name: "Documents" }));

/** A status pill; the Reading group's heading and caption say "Reading" too. */
const BADGE = '[data-slot="badge"]';

/** Every word shows once in the table or the card list, whichever the width draws. */
async function expectStatusWords(
  canvas: Canvas,
  role: "table" | "list"
): Promise<void> {
  const list = await canvas.findByRole(role, { name: "Documents" });

  await waitFor(() =>
    expect(
      within(list).queryAllByText("Saved", { selector: BADGE })
    ).toHaveLength(1)
  );
  await Promise.all(
    STATUS_WORDS.map((word) =>
      expect(
        within(list).queryAllByText(word, { selector: BADGE })
      ).toHaveLength(1)
    )
  );
}

/** D3: each row that needs the person offers Review, and Could not read offers Retry. */
async function expectRowActions(canvas: Canvas): Promise<void> {
  const table = documents(canvas);

  await Promise.all(
    NEEDS_REVIEW.map((row) =>
      expect(
        table.getByRole("link", { name: `Review ${row.label}` })
      ).toHaveAttribute("href", `/m/invoices/documents/${row.id}`)
    )
  );
  await expect(table.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(canvas.getAllByRole("link", { name: /^Review / })).toHaveLength(
    NEEDS_REVIEW.length
  );
}

const NEEDS_REVIEW = defaultDocumentInbox.rows.filter((row) =>
  ["needs-input", "confirm-split", "possible-duplicate", "no-match"].includes(
    row.status
  )
);

// Needs you is the resting tab, and the server page is its page one (LH20). D3: Review and Retry
// show under Needs you and under All.
export const Default: Story = {
  globals: desktop,
  beforeEach: () => serve(defaultDocumentInbox),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("tab", { name: "Needs you 5" })
    ).toHaveAttribute("aria-selected", "true");
    await expectRowActions(canvas);

    await userEvent.click(canvas.getByRole("tab", { name: "All 9" }));
    await expect(listDocuments).toHaveBeenCalledWith({
      after: null,
      params: { status: "all" },
    });
    await expectStatusWords(canvas, "table");
    await expectRowActions(canvas);
    await expect(
      canvas.getByRole("columnheader", { name: /Updated/ })
    ).toHaveAttribute("aria-sort", "descending");
  },
};

// B8.1: every status word as cards, at the phone width, under All.
export const DefaultOnPhone: Story = {
  name: "Default on a phone",
  globals: phone,
  beforeEach: () => {
    serve(defaultDocumentInbox);
    atAddress("?status=all");
  },
  play: ({ canvas }) => expectStatusWords(canvas, "list"),
};

/** D1: an empty Needs you shows no count, no 0, and says so (`czjw.68`). */
async function nothingNeedsYou(canvas: Canvas): Promise<void> {
  await expect(await canvas.findByText("Nothing needs you.")).toBeVisible();
  await expect(canvas.queryAllByText(/^0$/)).toEqual([]);
  await expect(canvas.queryByText(/Needs you 0/)).toBeNull();
}

export const NothingNeedsYou: Story = {
  name: "Nothing needs you",
  args: { view: nothingNeedsYouDocumentInbox },
  globals: desktop,
  beforeEach: () => serve(nothingNeedsYouDocumentInbox),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("tab", { name: "Needs you" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tab", { name: "Done 30" })).toBeVisible();
    await nothingNeedsYou(canvas);
  },
};

export const NothingNeedsYouOnPhone: Story = {
  name: "Nothing needs you on a phone",
  args: { view: nothingNeedsYouDocumentInbox },
  globals: phone,
  beforeEach: () => serve(nothingNeedsYouDocumentInbox),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Needs you" })
    ).toBeVisible();
    await nothingNeedsYou(canvas);
  },
};

const NEW_UPLOAD: DocumentInboxRow = {
  ...READING,
  id: "10000000-0000-4000-8000-000000000010",
  label: "new.pdf",
  uploadedAt: "2026-11-04T02:00:00.000Z",
  updatedAt: "2026-11-04T02:00:00.000000Z",
};

// D2: a chosen file moves the list to All, where the new row is first under Updated, newest.
export const UploadShowsAll: Story = {
  name: "Upload shows All",
  globals: desktop,
  beforeEach: () => {
    serve({
      ...defaultDocumentInbox,
      rows: [NEW_UPLOAD, ...defaultDocumentInbox.rows],
    });
  },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("new.pdf"),
    ]);

    await waitFor(() => expect(param("status")).toBe("all"));
    await expect(canvas.getByRole("tab", { name: /^All/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await waitFor(() =>
      expect(documents(canvas).getAllByRole("row")[1]).toHaveTextContent(
        "new.pdf"
      )
    );
  },
};

// A return to the default tab reads page one again, not the server page of the first visit.
export const BackToNeedsYouAfterUpload: Story = {
  name: "Back to Needs you after an upload",
  globals: desktop,
  beforeEach: () => {
    serve({
      ...defaultDocumentInbox,
      rows: [NEW_UPLOAD, ...defaultDocumentInbox.rows],
    });
  },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("new.pdf"),
    ]);
    await waitFor(() => expect(param("status")).toBe("all"));
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));

    await userEvent.click(canvas.getByRole("tab", { name: /^Needs you/ }));

    await waitFor(() =>
      expect(listDocuments).toHaveBeenCalledWith({ after: null, params: {} })
    );
  },
};

// The first upload into an empty inbox, then an empty tab: the header stays, so All is one click.
export const EmptyTabAfterFirstUpload: Story = {
  name: "Empty tab after the first upload",
  args: { view: emptyDocumentInbox },
  globals: desktop,
  beforeEach: () => {
    serve(emptyDocumentInbox);
    const counts = { "needs-you": 0, "reading": 1, "done": 0, "all": 1 };

    listDocuments.mockImplementation(
      async ({ params }: { readonly params: { readonly status?: string } }) =>
        params.status === "all"
          ? { ...emptyDocumentInbox, rows: [NEW_UPLOAD], counts }
          : { ...emptyDocumentInbox, counts }
    );
  },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("new.pdf"),
    ]);
    await expect(
      await canvas.findByRole("link", { name: "new.pdf" })
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Done" }));

    await expect(
      await canvas.findByText("No document matches these filters.")
    ).toBeVisible();
    await expect(canvas.getByRole("tab", { name: "All 1" })).toBeVisible();
  },
};

// An upload clears the search, the filters and the sort, so the new row shows first (D2).
export const UploadClearsTheFilters: Story = {
  name: "Upload clears the filters",
  globals: desktop,
  beforeEach: () => {
    serve({
      ...defaultDocumentInbox,
      rows: [NEW_UPLOAD, ...defaultDocumentInbox.rows],
    });
    atAddress("?q=order&type=invoice&sort=updated.asc");
  },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("new.pdf"),
    ]);

    await waitFor(() => expect(param("status")).toBe("all"));
    await expect([param("q"), param("type"), param("sort")]).toEqual([
      null,
      null,
      null,
    ]);
  },
};

// A search still waiting for its 300 ms pause does not come back after the upload clears it.
export const UploadBeatsPendingSearch: Story = {
  name: "Upload beats a pending search",
  globals: desktop,
  beforeEach: () => {
    serve({
      ...defaultDocumentInbox,
      rows: [NEW_UPLOAD, ...defaultDocumentInbox.rows],
    });
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("searchbox"), "order");
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("new.pdf"),
    ]);

    await waitFor(() => expect(param("status")).toBe("all"));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(param("q")).toBeNull();
  },
};

export const Dark: Story = {
  globals: { ...desktop, theme: "dark" },
  beforeEach: () => serve(defaultDocumentInbox),
};

export const Empty: Story = {
  args: { view: emptyDocumentInbox },
  globals: desktop,
  beforeEach: () => serve(emptyDocumentInbox),
};

// B8.6: the AI-off notice says that a person fills the fields by hand.
export const AiOff: Story = {
  name: "AI off",
  args: { view: aiOffDocumentInbox },
  globals: desktop,
  beforeEach: () => serve(aiOffDocumentInbox),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "AI is off. Documents are stored, and you fill in their fields by hand."
      )
    ).toBeVisible();
  },
};

// B8.6: without upload rights there is no upload, no Review and no Retry (Review Focus 3).
export const ReadOnly: Story = {
  name: "Read only",
  args: { view: readOnlyDocumentInbox },
  globals: desktop,
  beforeEach: () => serve(readOnlyDocumentInbox),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Upload" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Choose PDF files" })
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull();
    await expect(canvas.queryAllByRole("link", { name: /^Review / })).toEqual(
      []
    );
  },
};

// B8.2: three files upload one at a time in the chosen order, and a duplicate adds its row.
export const Uploads: Story = {
  args: { view: emptyDocumentInbox },
  globals: desktop,
  beforeEach: () => {
    serve(emptyDocumentInbox);
    uploadDocument.mockImplementation(
      async ({ file }: { readonly file: File }) => {
        uploadEvents.push(`start ${file.name}`);
        await new Promise((resolve) => setTimeout(resolve, 15));
        uploadEvents.push(`end ${file.name}`);

        if (file.name === "b.pdf") {
          return {
            outcome: "duplicate",
            documentId: "document-a",
            label: "a.pdf",
          };
        }

        return uploaded(file.name);
      }
    );
  },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("a.pdf"),
      pdf("b.pdf"),
      pdf("c.pdf"),
    ]);

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(uploadEvents).toEqual([
        "start a.pdf",
        "end a.pdf",
        "start b.pdf",
        "end b.pdf",
        "start c.pdf",
        "end c.pdf",
      ])
    );

    const table = within(
      await canvas.findByRole("table", { name: "Documents" })
    );

    await expect(
      await table.findByText("Duplicate (nothing added)")
    ).toBeVisible();
    await expect(table.getByText("Same file as a.pdf")).toBeVisible();
    // An upload moves the list to All, where this visit's Duplicate rows show.
    await expect(param("status")).toBe("all");
  },
};

// B8.3: a refusal shows beside its file name and the next file still uploads.
export const UploadRefused: Story = {
  name: "Upload refused",
  args: { view: emptyDocumentInbox },
  globals: desktop,
  beforeEach: () => {
    serve(emptyDocumentInbox);
    uploadDocument.mockImplementation(
      async ({ file }: { readonly file: File }) => {
        uploadEvents.push(`start ${file.name}`);
        await new Promise((resolve) => setTimeout(resolve, 15));
        uploadEvents.push(`end ${file.name}`);

        if (file.name === "b.pdf") {
          throw new Error("That file is not a PDF. Upload a PDF document.");
        }

        return uploaded(file.name);
      }
    );
  },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("a.pdf"),
      pdf("b.pdf"),
      pdf("c.pdf"),
    ]);

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(3));
    await expect(
      await canvas.findByText(
        /b\.pdf: That file is not a PDF\. Upload a PDF document\./
      )
    ).toBeVisible();
    await expect(uploadEvents).toContain("start c.pdf");
  },
};

// czjw.39: one file refused twice shows two lines, each with its own key.
export const UploadRefusedTwice: Story = {
  name: "Upload refused twice",
  args: { view: emptyDocumentInbox },
  globals: desktop,
  beforeEach: () => {
    serve(emptyDocumentInbox);
    uploadDocument.mockRejectedValue(
      new Error("That file is not a PDF. Upload a PDF document.")
    );
  },
  play: async ({ canvas }) => {
    const error = spyOn(console, "error");

    try {
      await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
        pdf("b.pdf"),
        pdf("b.pdf"),
      ]);

      await waitFor(() =>
        expect(
          canvas.getAllByText(/^b\.pdf: That file is not a PDF/)
        ).toHaveLength(2)
      );
      await expect(
        error.mock.calls.filter(([message]) =>
          String(message).includes("same key")
        )
      ).toEqual([]);
    } finally {
      error.mockRestore();
    }
  },
};

// czjw.39: a drag over the drop zone shows that a drop uploads.
export const DragOver: Story = {
  name: "Drag over",
  args: { view: emptyDocumentInbox },
  globals: desktop,
  beforeEach: () => serve(emptyDocumentInbox),
  play: async ({ canvas, canvasElement }) => {
    const zone = canvasElement.querySelector<HTMLElement>("[data-drop-zone]");

    if (zone === null) throw new Error("The inbox has no drop zone.");

    fireEvent.dragEnter(zone);
    fireEvent.dragOver(zone);
    await expect(canvas.getByText("Drop to upload")).toBeVisible();
    await expect(getComputedStyle(zone).borderTopStyle).toBe("solid");

    // Crossing the button fires dragleave on the zone; the state stays.
    fireEvent.dragLeave(zone, {
      relatedTarget: canvas.getByRole("button", { name: "Choose PDF files" }),
    });
    await expect(canvas.getByText("Drop to upload")).toBeVisible();

    fireEvent.dragLeave(zone, { relatedTarget: null });
    await expect(canvas.getByText("Drop PDF files here, or")).toBeVisible();

    // End in the drag-over state, so the capture shows it.
    fireEvent.dragEnter(zone);
  },
};

/** Fires the browser's unload event and answers whether a listener asked to stay. */
function unload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });

  window.dispatchEvent(event);

  return event.defaultPrevented;
}

/** Clicks a link and answers whether a listener kept the page; the story never navigates. */
function clickKeepsPage(link: HTMLElement): boolean {
  let kept = false;

  const record = (event: MouseEvent) => {
    kept = event.defaultPrevented;
    event.preventDefault();
  };

  window.addEventListener("click", record);
  link.click();
  window.removeEventListener("click", record);

  return kept;
}

/** Ends the upload that `LeaveDuringUpload` holds open. */
let finishUpload = () => {};

// czjw.39: while a file uploads, leaving asks first; once the queue is empty, nothing asks.
export const LeaveDuringUpload: Story = {
  name: "Leave during upload",
  globals: desktop,
  beforeEach: () => {
    serve(defaultDocumentInbox);
    uploadDocument.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpload = () => resolve(uploaded("slow.pdf"));
        })
    );

    const confirm = spyOn(window, "confirm").mockReturnValue(false);

    return () => confirm.mockRestore();
  },
  play: async ({ canvas }) => {
    const link = () => canvas.getByRole("link", { name: COULD_NOT_READ.label });

    await expect(unload()).toBe(false);
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("slow.pdf"),
    ]);
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));

    await expect(unload()).toBe(true);
    await expect(clickKeepsPage(link())).toBe(true);
    await expect(window.confirm).toHaveBeenCalledTimes(1);

    finishUpload();
    await waitFor(() => expect(unload()).toBe(false));
    await expect(clickKeepsPage(link())).toBe(false);
    await expect(window.confirm).toHaveBeenCalledTimes(1);
  },
};

// B8.4: Retry calls the row's id and the row then shows Reading.
export const Retry: Story = {
  args: { view: retryView },
  globals: desktop,
  beforeEach: () => {
    serve(retryView);
    retryReading.mockImplementation(async ({ id }: { readonly id: string }) => {
      listDocuments.mockResolvedValue({
        ...retryView,
        rows: [{ ...COULD_NOT_READ, status: "reading" }],
      });

      return { documentId: id };
    });
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(retryReading).toHaveBeenCalledWith({ id: COULD_NOT_READ.id })
    );

    // The row reads again.
    await waitFor(() =>
      expect(
        documents(canvas).getByText("Reading", { selector: BADGE })
      ).toBeVisible()
    );
  },
};

// F4.1: a refused Retry names the document and the reason, and the row keeps its Retry.
export const RetryRefused: Story = {
  name: "Retry refused",
  args: { view: retryView },
  globals: desktop,
  beforeEach: () => {
    serve(retryView);
    retryReading.mockRejectedValue(
      new Error("That document is not waiting for a retry.")
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      `${COULD_NOT_READ.label} was not read again. That document is not waiting for a retry.`
    );
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeEnabled();
    // A refused Retry still reads the list again: the row can change on the server (czjw.39).
    // The first page came with the view, so this is the only read.
    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(1));
  },
};

/** The finished row's status word, read from the Needs you group it moves to. */
const needsYouRow = (canvas: Canvas) =>
  documents(canvas).getByText("Needs your input");

/** The stale times of each list read, for the one-reload check. */
const listTimes: number[] = [];

// B8.5: a batch of uploads bigger than one poll asks in chunks, so every reading row is polled.
export const PollChunksManyRows: Story = {
  name: "Poll chunks many rows",
  args: {
    view: {
      ...defaultDocumentInbox,
      rows: Array.from({ length: 150 }, (_, index) => ({
        ...READING,
        id: `reading-${String(index).padStart(3, "0")}`,
        label: `reading-${index}.pdf`,
      })),
    },
  },
  globals: desktop,
  beforeEach: () => {
    serve({
      ...defaultDocumentInbox,
      rows: [],
    });
    documentStatus.mockImplementation(
      async ({ ids }: { readonly ids: readonly string[] }) => {
        if (ids.length > 100) {
          throw new Error("The status poll takes at most 100 ids.");
        }

        return ids.map((id) => ({
          id,
          status: "reading" as const,
          reason: null,
        }));
      }
    );
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(documentStatus).toHaveBeenCalled());
    // Two chunks of 100 and 50: a single 150-id call is refused, and one row would stop polling.
    const asked = documentStatus.mock.calls.flatMap(([input]) => input.ids);

    await waitFor(() => expect(documentStatus.mock.calls.length).toBe(2));
    await expect(new Set(asked).size).toBe(150);
    await expect(canvas.getByRole("table")).toBeVisible();
  },
};

// B8.5: a reading that ends reloads the list once, and the poll stops.
export const ReadingEnds: Story = {
  name: "Reading ends",
  args: { view: readingView },
  globals: desktop,
  beforeEach: () => {
    serve(readingView);
    listTimes.length = 0;
    listDocuments.mockImplementation(async () => {
      listTimes.push(Date.now());

      return listTimes.length === 1 ? readingView : defaultDocumentInbox;
    });
    documentStatus.mockResolvedValue([
      { id: READING.id, status: "needs-input", reason: null },
    ]);
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(needsYouRow(canvas)).toBeVisible(), {
      timeout: 6_000,
    });
    // One reload for the finished reading (the first page came with the request), and then none:
    // a second poll tick would add one more read to this list.
    await waitFor(() => expect(listTimes).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await expect(listTimes).toHaveLength(1);
    // The row was polled by its id, not by reading the whole list.
    await expect(documentStatus).toHaveBeenCalledWith({ ids: [READING.id] });
  },
};

// B8.5 on a cut list: Show more asks for the page after the cursor.
export const ShowMore: Story = {
  name: "Show more",
  args: {
    view: {
      ...defaultDocumentInbox,
      next: { values: ["2026-10-01T00:00:00.000000Z", "document-a"] },
    },
  },
  globals: desktop,
  beforeEach: () => {
    serve(defaultDocumentInbox);
    listDocuments.mockResolvedValue({
      rows: defaultDocumentInbox.rows,
      truncated: false,
      next: null,
      counts: null,
      ai: "on",
      canUpload: true,
    });
  },
  play: async ({ canvas }) => {
    // Scroll loading reads the next page as soon as the end is near; Show more is its fallback.
    const more = canvas.queryByRole("button", { name: "Show more" });

    if (more !== null) await userEvent.click(more);

    await waitFor(() =>
      expect(listDocuments).toHaveBeenCalledWith({
        after: { values: ["2026-10-01T00:00:00.000000Z", "document-a"] },
        params: {},
      })
    );
  },
};

export const RefreshWhileReading: Story = {
  name: "Refresh while reading",
  args: { view: readingView },
  globals: desktop,
  beforeEach: () => {
    serve(readingView);
    listTimes.length = 0;
    listDocuments.mockImplementation(async () => {
      listTimes.push(Date.now());

      return readingView;
    });
    documentStatus.mockImplementation(
      async ({ ids }: { readonly ids: readonly string[] }) =>
        ids.map((id) => ({ id, status: "needs-input" as const, reason: null }))
    );
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(needsYouRow(canvas)).toBeVisible(), {
      timeout: 6_000,
    });
    // The row was polled by its id, not by reading the whole list.
    await expect(documentStatus).toHaveBeenCalledWith({ ids: [READING.id] });
  },
};

/** Every stored row's label is a link to its review; a Duplicate row has none. */
const checkRowLinks: Story["play"] = async ({ canvas }) => {
  await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
    pdf("extra.pdf"),
  ]);

  await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));

  // The upload moves the list to All, which reads every row again.
  await waitFor(() =>
    Promise.all(
      defaultDocumentInbox.rows.map((row) =>
        expect(canvas.getByRole("link", { name: row.label })).toHaveAttribute(
          "href",
          `/m/invoices/documents/${row.id}`
        )
      )
    )
  );

  await expect(
    (await canvas.findAllByText("Same file as a.pdf")).length
  ).toBeGreaterThan(0);
  await expect(canvas.queryByRole("link", { name: "extra.pdf" })).toBeNull();
};

const serveDuplicate = () => {
  serve(defaultDocumentInbox);
  uploadDocument.mockResolvedValue({
    outcome: "duplicate",
    documentId: "document-a",
    label: "a.pdf",
  });
};

// B4.8: a stored row opens its review at both widths; the Duplicate row has no link.
export const Links: Story = {
  globals: desktop,
  beforeEach: serveDuplicate,
  play: checkRowLinks,
};

// czjw.39: a plain http host has no `crypto.randomUUID`, and a duplicate still adds its row.
export const UploadsWithoutSecureContext: Story = {
  name: "Uploads without a secure context",
  globals: desktop,
  beforeEach: () => {
    serveDuplicate();
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });

    return () => {
      Reflect.deleteProperty(crypto, "randomUUID");
    };
  },
  play: async ({ canvas }) => {
    await userEvent.upload(canvas.getByLabelText("Choose PDF files"), [
      pdf("extra.pdf"),
    ]);

    await expect(
      await documents(canvas).findByText("Same file as a.pdf")
    ).toBeVisible();
  },
};

// B4.8 on a phone: the card title carries the same link.
export const LinksOnPhone: Story = {
  name: "Links on a phone",
  globals: phone,
  beforeEach: serveDuplicate,
  play: checkRowLinks,
};
