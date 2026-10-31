import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { DEMO_PDF } from "./__fixtures__/demo-pdfs.ts";
import {
  aiOffReview,
  couldNotReadReview,
  invoiceReview,
  purchaseOrderReview,
  readOnlyReview,
  readingReview,
} from "./__fixtures__/review.ts";
import { DocumentReview } from "./document-review.tsx";
import type { DocumentReviewView } from "./views.ts";

const getDocumentReview = fn();

const setDocumentKind = fn();

const discardDocument = fn();

let releaseKind: (() => void) | null = null;

let releaseDiscard: (() => void) | null = null;

const desktop = { viewport: { value: "desktop", isRotated: false } };

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
          invoices: { getDocumentReview, setDocumentKind, discardDocument },
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
          "One document at `/m/invoices/documents/<id>` (Spec 7 R-27, R-33, R-38, decisions 3, 4, 7 and 12). The document sits on the left, its fields on the right; below 1024 px they stack. A person opens the review from the inbox, changes the type, discards an unsaved document after a confirmation, and selects a field to highlight its source text on the document. The viewer loads its first file link once and keeps it while the review refetches.",
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
}

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
    await userEvent.click(
      canvas.getByRole("button", { name: "Show the source of Total" })
    );

    await expect(
      canvas.getByText(
        "Found on page 1, highlighted on the document: “TOTAL (SGD) 5,000.00”"
      )
    ).toBeVisible();
    await waitFor(() => expect(marksText(canvasElement)).toContain("5,000.00"));

    // B4.3 at 1440: both columns start at the same top.
    const { card, viewer } = await columns(canvasElement);

    await expect(
      Math.abs(
        card.getBoundingClientRect().top - viewer.getBoundingClientRect().top
      )
    ).toBeLessThanOrEqual(1);
  },
};

// B4.3 at 390: the fields card starts below the document.
export const InvoiceReadOnPhone: Story = {
  name: "Invoice read on a phone",
  globals: phone,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvasElement }) => {
    const { card, viewer } = await columns(canvasElement);

    await expect(card.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      viewer.getBoundingClientRect().bottom
    );
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

// B4.7: Discard asks with Cancel focused; Cancel writes nothing and Confirm discards.
export const Discard: Story = {
  globals: desktop,
  beforeEach: () => {
    serve(invoiceReview);
    discardDocument.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseDiscard = () =>
            resolve({ documentId: invoiceReview.document.id });
        })
    );
  },
  play: async ({ canvas }) => {
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
    await expect(
      await canvas.findByText("Discarded. Nothing was added.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Documents" })
    ).toHaveAttribute("href", "/m/invoices/documents");
  },
};

// The remaining states, for their copy and the accessibility check at both widths.
export const CouldNotRead: Story = {
  name: "Could not read",
  args: { view: couldNotReadReview },
  globals: desktop,
  beforeEach: () => serve(couldNotReadReview),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "The document could not be read. Retry it from Documents."
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Documents" })
    ).toHaveAttribute("href", "/m/invoices/documents");
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
        /01_Invoice_Missing_Due_Date\.pdf · not classified\. AI was off\. Fill in the fields by hand\./
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

export const ReadingOnPhone: Story = {
  ...Reading,
  name: "Reading on a phone",
  globals: phone,
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

export const CouldNotReadOnPhone: Story = {
  ...CouldNotRead,
  name: "Could not read on a phone",
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
