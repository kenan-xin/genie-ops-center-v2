import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { DEMO_PDF } from "./__fixtures__/demo-pdfs.ts";
import {
  aiOffReview,
  couldNotReadReview,
  couldNotReadTypedReview,
  invoiceReview,
  purchaseOrderReview,
  readOnlyReview,
  readingReview,
  receiptReview,
} from "./__fixtures__/review.ts";
import { DocumentReview } from "./document-review.tsx";
import type { DocumentReviewView } from "./views.ts";

const getDocumentReview = fn();

const setDocumentKind = fn();

const discardDocument = fn();

const uploadDocument = fn();

let releaseKind: (() => void) | null = null;

let releaseDiscard: (() => void) | null = null;

const desktop = { viewport: { value: "desktop", isRotated: false } };

const desktop1440 = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

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
            getDocumentReview,
            setDocumentKind,
            discardDocument,
            uploadDocument,
          },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Invoices/Document review",
  component: DocumentReview,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One document at `/m/invoices/documents/<id>` (Spec 7 R-27, R-33, R-38, decisions 3, 4, 7 and 12). The document sits on the left, its fields on the right; below 1024 px a Fields and Document switch shows one at a time. The file name shows once, shortened, in the line under the title. A person opens the review from the inbox, changes the type, discards an unsaved document after a confirmation, and selects a field to highlight its source text on the document. The viewer loads its first file link once and keeps it while the review refetches.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { view: invoiceReview },
} satisfies Meta<typeof DocumentReview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The invoice after the reading, with a fresh file link for the refetch test. */
const invoiceAfterReading: DocumentReviewView = {
  ...invoiceReview,
  document: {
    ...invoiceReview.document,
    fileUrl: `${DEMO_PDF.invoice01}?v=2`,
  },
};

function serve(view: DocumentReviewView) {
  releaseKind = null;
  releaseDiscard = null;
  getDocumentReview.mockReset().mockResolvedValue(view);
  setDocumentKind
    .mockReset()
    .mockResolvedValue({ documentId: view.document.id, kind: "payment" });
  discardDocument
    .mockReset()
    .mockResolvedValue({ documentId: view.document.id });
  uploadDocument
    .mockReset()
    .mockResolvedValue({ outcome: "uploaded", documentId: UPLOADED_ID });
}

const UPLOADED_ID = "10000000-0000-4000-8000-000000000105";

/** The review page after the person leaves it: no viewer is left on the page. */
const noViewer = (canvasElement: HTMLElement) =>
  expect(canvasElement.querySelector("[data-document-viewer]")).toBeNull();

/** Every mark on the page as one string without whitespace, whichever text items they came from. */
function marksText(element: HTMLElement): string {
  return Array.from(element.querySelectorAll("mark"))
    .map((mark) => mark.textContent ?? "")
    .join("")
    .replaceAll(/\s+/gu, "");
}

/** The document and the fields card, once the lazy viewer has drawn. */
async function columns(canvasElement: HTMLElement) {
  const viewer = await waitFor(() => {
    const found = canvasElement.querySelector("[data-document-viewer]");

    if (found === null) throw new Error("The viewer has not drawn yet.");

    return found;
  });

  const card = canvasElement.querySelector('[data-slot="card"]');

  if (card === null) throw new Error("The fields card has not drawn yet.");

  return { card, viewer };
}

/** One field row by its key, for a tag or value inside it. */
function fieldRow(canvasElement: HTMLElement, field: string) {
  const row = canvasElement.querySelector(`[data-field="${field}"]`);

  if (!(row instanceof HTMLElement))
    throw new Error(`The review has no ${field} row.`);

  return within(row);
}

// B4.1: the selected field's source line names its page and quote, and the text layer marks the quote.
export const InvoiceRead: Story = {
  globals: desktop,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    // Design review 4.2: the file name shows once, shortened, with the whole name on hover; the
    // trail ends in Review.
    await expect(
      canvas.getByTitle("01_Invoice_Missing_Due_Date.pdf")
    ).toHaveTextContent(/^01_Invoice_Missing…_Date\.pdf$/u);
    await expect(
      canvas.queryAllByText(/01_Invoice_Missing_Due_Date\.pdf/u)
    ).toHaveLength(0);
    await expect(
      within(canvas.getByRole("navigation", { name: "breadcrumb" })).getByText(
        "Review"
      )
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Show Total on the document" })
    );

    await expect(
      canvas.getByText(
        "Found on page 1, highlighted on the document: “TOTAL (SGD) 5,000.00”"
      )
    ).toBeVisible();
    // The lazy viewer loads its chunk, fetches the PDF and draws the text layer first. The 1 s
    // default missed it at 1.3 s three times under gate:merge load; the Reading story's lazy
    // viewer budget is 8 s.
    await waitFor(
      () => expect(marksText(canvasElement)).toContain("5,000.00"),
      { timeout: 8_000 }
    );

    // B4.3 at 1440: both columns start at the same top.
    const { card, viewer } = await columns(canvasElement);

    await expect(
      Math.abs(
        card.getBoundingClientRect().top - viewer.getBoundingClientRect().top
      )
    ).toBeLessThanOrEqual(1);
  },
};

// Choice 14 at 390: Fields shows first, and the Document switch shows the document in its place.
export const InvoiceReadOnPhone: Story = {
  name: "Invoice read on a phone",
  globals: phone,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    const { card, viewer } = await columns(canvasElement);

    await expect(card).toBeVisible();
    await expect(viewer).not.toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Document" }));
    await expect(viewer).toBeVisible();
    await expect(card).not.toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Fields" }));
    await expect(card).toBeVisible();
  },
};

// B4.2: an extracted field, a dropped field and a field the document does not state.
// The read-only rows show them, because a writer sees the save form.
export const Tags: Story = {
  args: { view: readOnlyReview },
  globals: desktop,
  beforeEach: () => serve(readOnlyReview),
  play: async ({ canvasElement }) => {
    await expect(
      fieldRow(canvasElement, "customer").getByText("Extracted")
    ).toBeVisible();
    await expect(
      fieldRow(canvasElement, "dueDate").getByText("Check this")
    ).toBeVisible();
    await expect(
      fieldRow(canvasElement, "paymentTerms").getByText("Not on the document")
    ).toBeVisible();
    await expect(
      fieldRow(canvasElement, "paymentTerms").getByText("Unspecified")
    ).toBeVisible();
  },
};

// B4.4: a reading document shows its note, then its fields, and its PDF loads once.
export const Reading: Story = {
  args: { view: readingReview },
  globals: desktop,
  beforeEach: () => {
    serve(readingReview);
    let calls = 0;

    getDocumentReview.mockImplementation(async () => {
      calls += 1;

      return calls === 1 ? readingReview : invoiceAfterReading;
    });
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByText("Reading the document. The fields show when it is read.")
    ).toBeVisible();

    const viewer = await waitFor(() => {
      const found = canvasElement.querySelector("[data-document-viewer]");

      if (found === null) throw new Error("The viewer has not drawn yet.");

      return found;
    });

    const firstLink = `${DEMO_PDF.invoice01}?v=1`;

    await expect(viewer).toHaveAttribute("data-document-url", firstLink);

    const drawn = await waitFor(() => {
      const found = viewer.querySelector("canvas");

      if (found === null) throw new Error("The document has not drawn yet.");

      return found;
    });

    await expect(
      await canvas.findByText("Customer", {}, { timeout: 8_000 })
    ).toBeVisible();

    // The refetch's ?v=2 never reaches the viewer, and its PDF stays drawn.
    await expect(viewer).toHaveAttribute("data-document-url", firstLink);
    await expect(viewer.getAttribute("data-document-url")).not.toContain(
      "?v=2"
    );
    await expect(viewer.contains(drawn)).toBe(true);
  },
};

// B4.5: a reader without write gets no Type select and no Discard.
export const ReadOnly: Story = {
  name: "Read only",
  args: { view: readOnlyReview },
  globals: desktop,
  beforeEach: () => serve(readOnlyReview),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Customer")).toBeVisible();
    await expect(canvas.queryByRole("combobox", { name: "Type" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Discard" })).toBeNull();
  },
};

// B4.6: choosing another type calls setDocumentKind and then reads the document again.
export const ChangeType: Story = {
  name: "Change type",
  globals: desktop,
  beforeEach: () => {
    serve(invoiceReview);
    setDocumentKind.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseKind = () =>
            resolve({ documentId: invoiceReview.document.id, kind: "payment" });
        })
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Type" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Invoice" })
    );

    await expect(setDocumentKind).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole("combobox", { name: "Type" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Payment evidence" })
    );

    await waitFor(() =>
      expect(setDocumentKind).toHaveBeenCalledWith({
        id: invoiceReview.document.id,
        kind: "payment",
      })
    );
    // A second type cannot be sent while the first change is in flight.
    await expect(canvas.getByRole("combobox", { name: "Type" })).toBeDisabled();
    releaseKind?.();
    await waitFor(() => {
      const changed = setDocumentKind.mock.invocationCallOrder[0] ?? 0;

      expect(
        getDocumentReview.mock.invocationCallOrder.some(
          (order) => order > changed
        )
      ).toBe(true);
    });
  },
};

/** An upload's own name, which has no space to wrap at. */
const LONG_LABEL = "2026-11-04_Scan_Invoice_Missing_Due_Date_ABC_Trading.pdf";

// B4.7: Discard asks with Cancel focused; Cancel writes nothing and Confirm discards.
export const Discard: Story = {
  globals: desktop,
  beforeEach: () => {
    serve({
      ...invoiceReview,
      document: { ...invoiceReview.document, label: LONG_LABEL },
    });
    discardDocument.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseDiscard = () =>
            resolve({ documentId: invoiceReview.document.id });
        })
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }));

    const first = await screen.findByRole("dialog");
    const cancel = within(first).getByRole("button", { name: "Cancel" });

    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.click(cancel);

    await expect(discardDocument).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(canvas.getByRole("button", { name: "Discard" }));

    const second = await screen.findByRole("dialog");

    await userEvent.click(
      within(second).getByRole("button", { name: "Discard" })
    );

    await waitFor(() =>
      expect(discardDocument).toHaveBeenCalledWith({
        id: invoiceReview.document.id,
      })
    );
    // The button is busy until the discard finishes, so it cannot be sent twice.
    await expect(
      canvas.getByRole("button", { name: "Discard" })
    ).toHaveAttribute("aria-busy", "true");
    releaseDiscard?.();

    // czjw.64: the result card says what happened and offers the next step.
    const discarded = await canvas.findByText(
      `Discarded ${LONG_LABEL}. Nothing was added.`
    );

    await expect(discarded).toBeVisible();
    // A file name has no space to wrap at, so on a phone it must break inside the card.
    await expect(discarded.scrollWidth).toBeLessThanOrEqual(
      discarded.clientWidth
    );
    await expect(
      canvas.getByRole("button", { name: "Upload another" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Documents" })
    ).toHaveAttribute("href", "/m/invoices/documents");
    noViewer(canvasElement);
  },
};

/** Upload 06 saved as a paid receipt: one invoice and one payment. */
const savedPaidReceipt: DocumentReviewView = {
  ...receiptReview,
  document: { ...receiptReview.document, status: "saved" },
  saved: {
    invoice: {
      id: "30000000-0000-4000-8000-000000000006",
      number: "RCPT-LIVE-001",
    },
    payment: {
      id: "40000000-0000-4000-8000-000000000006",
      reference: "LD-PURCHASE-1800",
      paymentDate: "2026-10-27",
    },
    automaticLinks: [],
  },
};

// czjw.64: a paid receipt names both records it made, each with its link, and the PDF is gone.
export const SavedAsPaidReceipt: Story = {
  name: "Saved as a paid receipt",
  args: { view: savedPaidReceipt },
  globals: desktop1440,
  beforeEach: () => serve(savedPaidReceipt),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByText(
        "Saved as a paid receipt: invoice RCPT-LIVE-001 and payment LD-PURCHASE-1800."
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open the invoice" })
    ).toHaveAttribute(
      "href",
      "/m/invoices/invoices/30000000-0000-4000-8000-000000000006"
    );
    await expect(
      canvas.getByRole("link", { name: "Open the payment" })
    ).toHaveAttribute(
      "href",
      "/m/invoices/payments/40000000-0000-4000-8000-000000000006"
    );
    noViewer(canvasElement);
  },
};

// czjw.64: Upload another sends one PDF in place, then links to its review; a copy says so.
export const UploadAnother: Story = {
  name: "Upload another",
  args: { view: savedPaidReceipt },
  globals: desktop1440,
  beforeEach: () => serve(savedPaidReceipt),
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Choose a PDF file");

    await userEvent.upload(
      input,
      new File(["%PDF-1.4"], "05_Payment_Unmatched.pdf", {
        type: "application/pdf",
      })
    );

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    await expect(
      await canvas.findByText(
        "Uploaded 05_Payment_Unmatched.pdf. It is being read now."
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Review 05_Payment_Unmatched.pdf" })
    ).toHaveAttribute("href", `/m/invoices/documents/${UPLOADED_ID}`);

    uploadDocument.mockResolvedValue({
      outcome: "duplicate",
      documentId: UPLOADED_ID,
      label: "05_Payment_Unmatched.pdf",
    });
    await userEvent.upload(
      input,
      new File(["%PDF-1.4"], "05_copy.pdf", { type: "application/pdf" })
    );
    await expect(
      await canvas.findByText(
        "05_copy.pdf is the same file as 05_Payment_Unmatched.pdf. Nothing was added."
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open 05_Payment_Unmatched.pdf" })
    ).toHaveAttribute("href", `/m/invoices/documents/${UPLOADED_ID}`);
  },
};

const COULD_NOT_READ_TITLE = "The document could not be read.";

const COULD_NOT_READ_NOTE =
  "Retry it from Documents, or choose its type and fill in the fields by hand.";

// R-26: a Could not read document keeps Retry and offers the type select for hand entry.
export const CouldNotRead: Story = {
  name: "Could not read",
  args: { view: couldNotReadReview },
  globals: desktop,
  beforeEach: () => serve(couldNotReadReview),
  play: async ({ canvas, canvasElement }) => {
    const title = canvas.getByText(COULD_NOT_READ_TITLE);

    await expect(title).toBeVisible();
    await expect(canvas.getByText(COULD_NOT_READ_NOTE)).toBeVisible();
    // czjw.64: the card sits above both panes, and hand entry stays (R-26).
    const { viewer } = await columns(canvasElement);

    const fields = canvas
      .getByRole("combobox", { name: "Type" })
      .closest('[data-slot="card"]');

    for (const pane of [viewer, fields]) {
      // oxlint-disable-next-line no-await-in-loop -- one pane per check.
      await expect(
        pane !== null &&
          (title.compareDocumentPosition(pane) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0 &&
          !pane.contains(title)
      ).toBe(true);
    }

    await expect(
      canvas.queryByRole("button", { name: "Upload another" })
    ).toBeNull();
    await expect(canvas.getByRole("combobox", { name: "Type" })).toBeEnabled();
    await expect(
      canvas.getByRole("link", { name: "Back to Documents" })
    ).toHaveAttribute("href", "/m/invoices/documents");
  },
};

// R-26: once typed, the same document shows the empty save form under the note.
export const CouldNotReadTyped: Story = {
  name: "Could not read, entered by hand",
  args: { view: couldNotReadTypedReview },
  globals: desktop,
  beforeEach: () => serve(couldNotReadTypedReview),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(COULD_NOT_READ_NOTE)).toBeVisible();
    await expect(canvas.getByText("Customer")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Save as unpaid" })
    ).toBeVisible();
  },
};

export const PurchaseOrder: Story = {
  name: "Purchase order",
  args: { view: purchaseOrderReview },
  globals: desktop,
  beforeEach: () => serve(purchaseOrderReview),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Kept as a reference. A purchase order changes no figure."
      )
    ).toBeVisible();
  },
};

export const AiOff: Story = {
  name: "AI off",
  args: { view: aiOffReview },
  globals: desktop,
  beforeEach: () => serve(aiOffReview),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        /· not classified\. AI was off\. Fill in the fields by hand\./u
      )
    ).toBeVisible();
  },
};

export const Dark: Story = {
  globals: { ...desktop, theme: "dark" },
  beforeEach: () => serve(invoiceReview),
};

// Every review state at the phone width too, so axe checks each at 390 x 844.
export const TagsOnPhone: Story = {
  ...Tags,
  name: "Tags on a phone",
  globals: phone,
};

// B4.4 at 390 (choice 14): the PDF draws on the Document pane and stays drawn while Fields shows.
export const ReadingOnPhone: Story = {
  ...Reading,
  name: "Reading on a phone",
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Document" }));

    const drawn = await waitFor(
      () => {
        const found = canvasElement.querySelector(
          "[data-document-viewer] canvas"
        );

        if (found === null) throw new Error("The document has not drawn yet.");

        return found;
      },
      { timeout: 8_000 }
    );

    await userEvent.click(canvas.getByRole("button", { name: "Fields" }));
    await expect(
      await canvas.findByText("Customer", {}, { timeout: 8_000 })
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Document" }));
    await expect(drawn).toBeVisible();
    await expect(
      canvasElement.querySelector("[data-document-viewer]")
    ).toHaveAttribute("data-document-url", `${DEMO_PDF.invoice01}?v=1`);
  },
};

export const ReadOnlyOnPhone: Story = {
  ...ReadOnly,
  name: "Read only on a phone",
  globals: phone,
};

export const ChangeTypeOnPhone: Story = {
  ...ChangeType,
  name: "Change type on a phone",
  globals: phone,
};

export const DiscardOnPhone: Story = {
  ...Discard,
  name: "Discard on a phone",
  globals: phone,
};

export const SavedAsPaidReceiptOnPhone: Story = {
  ...SavedAsPaidReceipt,
  name: "Saved as a paid receipt on a phone",
  globals: phone,
};

export const CouldNotReadOnPhone: Story = {
  ...CouldNotRead,
  name: "Could not read on a phone",
  globals: phone,
};

export const CouldNotReadTypedOnPhone: Story = {
  ...CouldNotReadTyped,
  name: "Could not read, entered by hand, on a phone",
  globals: phone,
};

export const PurchaseOrderOnPhone: Story = {
  ...PurchaseOrder,
  name: "Purchase order on a phone",
  globals: phone,
};

export const AiOffOnPhone: Story = {
  ...AiOff,
  name: "AI off on a phone",
  globals: phone,
};
