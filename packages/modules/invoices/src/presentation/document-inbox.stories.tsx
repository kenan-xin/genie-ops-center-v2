import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import {
  aiOffDocumentInbox,
  defaultDocumentInbox,
  emptyDocumentInbox,
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
        client={{ invoices: { uploadDocument, listDocuments, retryReading } }}
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
          "The Documents inbox at `/m/invoices/documents` (Spec 7 R-20, R-23, R-37). The list asks for the documents again every 3 seconds while one is Reading. Uploads go one at a time in the chosen order; an exact copy adds a Duplicate (nothing added) row for this visit, and a refusal shows beside its file name while the next file still uploads. A Could not read row offers Retry. With AI off the page says that a person fills the fields by hand.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { view: defaultDocumentInbox },
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

const retryView: DocumentInboxView = {
  ...defaultDocumentInbox,
  rows: [COULD_NOT_READ],
};

const readingView: DocumentInboxView = {
  ...defaultDocumentInbox,
  rows: [READING],
};

const needsInputView: DocumentInboxView = {
  ...defaultDocumentInbox,
  rows: [{ ...READING, status: "needs-input" }],
};

const statusWordsInTable: Story["play"] = async ({ canvas }) => {
  const table = within(canvas.getByRole("table"));

  await Promise.all(
    STATUS_WORDS.map((word) => expect(table.getByText(word)).toBeVisible())
  );
};

const statusWordsInCards: Story["play"] = async ({ canvas }) => {
  const list = within(canvas.getByRole("list", { name: "Documents" }));

  await Promise.all(
    STATUS_WORDS.map((word) => expect(list.getByText(word)).toBeVisible())
  );
};

// B8.1: every R-37 status word, at the desktop width.
export const Default: Story = {
  globals: desktop,
  beforeEach: () => serve(defaultDocumentInbox),
  play: statusWordsInTable,
};

// B8.1: the same rows as cards, at the phone width.
export const DefaultOnPhone: Story = {
  name: "Default on a phone",
  globals: phone,
  beforeEach: () => serve(defaultDocumentInbox),
  play: statusWordsInCards,
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

// B8.6: without upload rights there is no upload area and no Retry.
export const ReadOnly: Story = {
  name: "Read only",
  args: { view: readOnlyDocumentInbox },
  globals: desktop,
  beforeEach: () => serve(readOnlyDocumentInbox),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Choose PDF files" })
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull();
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

    const table = within(canvas.getByRole("table"));

    await expect(
      await table.findByText("Duplicate (nothing added)")
    ).toBeVisible();
    await expect(table.getByText("Same file as a.pdf")).toBeVisible();
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

    const table = within(canvas.getByRole("table"));

    await expect(await table.findByText("Reading")).toBeVisible();
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
  },
};

// B8.5: while a row is Reading the page asks again, and the row changes without a reload.
export const RefreshWhileReading: Story = {
  name: "Refresh while reading",
  args: { view: readingView },
  globals: desktop,
  beforeEach: () => {
    serve(readingView);
    listDocuments.mockImplementation(async () =>
      listDocuments.mock.calls.length === 1 ? readingView : needsInputView
    );
  },
  play: async ({ canvas }) => {
    const table = within(canvas.getByRole("table"));

    await waitFor(
      () => expect(table.getByText("Needs your input")).toBeVisible(),
      { timeout: 6_000 }
    );
    await expect(listDocuments.mock.calls.length).toBeGreaterThanOrEqual(2);
  },
};
