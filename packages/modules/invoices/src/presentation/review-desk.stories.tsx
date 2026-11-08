import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { DEMO_PDF } from "./__fixtures__/demo-pdfs.ts";
import {
  invoiceAfterReading,
  invoiceReview,
  lostQuoteInvoiceReview,
  meridianOpenInvoices,
  noQuoteInvoiceReview,
  readingReview,
  splitPaymentReview,
} from "./__fixtures__/review.ts";
import { DocumentReview } from "./document-review.tsx";
import { formatMoney } from "./format.ts";
import type { DocumentReviewView } from "./views.ts";

const getDocumentReview = fn();

const saveInvoice = fn();

const savePaidReceipt = fn();

const discardDocument = fn();

const setDocumentKind = fn();

const savePayment = fn();

const listOpenInvoices = fn();

/** Money as the page shows it, with a plain space. */
const SGD = (cents: number) => formatMoney(cents, "SGD").replace(/\s/gu, " ");

const desktop1440 = { viewport: { value: "desktop1440", isRotated: false } };

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
            saveInvoice,
            savePaidReceipt,
            discardDocument,
            setDocumentKind,
            savePayment,
            listOpenInvoices,
          },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Invoices/Review desk",
  component: DocumentReview,
  parameters: {
    docs: {
      description: {
        component:
          "The review of a document as a desk (Spec 7 R-38, `czjw.98`). From 1280 px each field read from the page is an editable card beside its line; the Before you save panel holds the fields the page does not quote and Save, which names and focuses what blocks it.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  globals: desktop1440,
  args: { view: invoiceReview },
} satisfies Meta<typeof DocumentReview>;

export default meta;

type Story = StoryObj<typeof meta>;

const ENVELOPE = {
  outcome: "saved",
  invoiceId: "30000000-0000-4000-8000-000000000001",
  customerId: "20000000-0000-4000-8000-000000000001",
  linkedPayments: [],
} as const;

function serve(view: DocumentReviewView) {
  getDocumentReview.mockReset().mockResolvedValue(view);
  saveInvoice.mockReset().mockResolvedValue(ENVELOPE);
  savePaidReceipt.mockReset();
  discardDocument.mockReset();
  setDocumentKind.mockReset();
  savePayment.mockReset();
  listOpenInvoices
    .mockReset()
    .mockResolvedValue({ rows: meridianOpenInvoices, truncated: false });
}

const PAGE_TIMEOUT = { timeout: 10_000 };

/** The cards of the read fields once the page is drawn and each card has its leader line. */
async function pinned(root: HTMLElement, keys: readonly string[]) {
  await waitFor(() => {
    for (const key of keys) {
      if (root.querySelector(`[data-pin-line="${key}"]`) === null)
        throw new Error(`No leader line for ${key}.`);
    }
  }, PAGE_TIMEOUT);
}

function card(root: HTMLElement, key: string): HTMLElement {
  const found = root.querySelectorAll<HTMLElement>(`[data-field="${key}"]`);

  const [first] = found;

  if (found.length !== 1 || first === undefined)
    throw new Error(`${key} shows ${found.length} times, not once.`);

  return first;
}

function aside(root: HTMLElement): HTMLElement {
  const found = root.querySelector<HTMLElement>(
    'aside[aria-label="Before you save"]'
  );

  if (found === null)
    throw new Error("The review has no Before you save panel.");

  return found;
}

const panel = (root: HTMLElement) => within(aside(root));

const READ_KEYS = [
  "customer",
  "number",
  "date",
  "amount",
  "currency",
  "description",
] as const;

// T4.1 to T4.3: each field once, read ones pinned, the rest in the panel; Save names and focuses the due date.
export const Invoice: Story = {
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await pinned(canvasElement, READ_KEYS);

    for (const key of [...READ_KEYS, "dueDate", "paymentTerms"]) {
      card(canvasElement, key);
    }

    await expect(
      READ_KEYS.filter(
        (key) =>
          canvasElement.querySelector(`[data-pin-card="${key}"]`) === null
      )
    ).toEqual([]);

    const side = panel(canvasElement);

    await expect(side.getByText("Not on the page")).toBeVisible();
    await expect(side.getByText("2 fields")).toBeVisible();
    await expect(
      within(card(canvasElement, "dueDate")).getByText("Needs your input")
    ).toBeVisible();
    await expect(
      canvasElement.querySelector('[data-pin-card="dueDate"]')
    ).toBeNull();
    await expect(
      canvas.getAllByText("Needs your input").length
    ).toBeGreaterThanOrEqual(2);
    await expect(
      side.getByText("Choose a due date or mark it unspecified to save.")
    ).toBeVisible();

    // T4.2: Save and Enter both go to the due choice and save nothing.
    const save = canvas.getByRole("button", { name: "Save as unpaid" });

    await userEvent.click(save);
    await expect(
      canvas.getByRole("radio", { name: "Enter a due date" })
    ).toHaveFocus();
    await expect(card(canvasElement, "dueDate")).toHaveAttribute(
      "data-selected"
    );

    await userEvent.click(canvas.getByLabelText("Invoice number"));
    await userEvent.keyboard("{Enter}");
    await expect(
      canvas.getByRole("radio", { name: "Enter a due date" })
    ).toHaveFocus();
    await expect(saveInvoice).not.toHaveBeenCalled();

    // T4.3: a valid choice clears the blocker and saves once.
    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await expect(
      within(card(canvasElement, "dueDate")).getByText("Unspecified")
    ).toBeVisible();
    await expect(canvas.getAllByText("Ready to save")).toHaveLength(2);

    await userEvent.click(save);
    await waitFor(() => expect(saveInvoice).toHaveBeenCalledTimes(1));
    await expect(saveInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ dueDateSource: "unspecified" })
    );
  },
};

// T4.4: an edit shows the read value with Undo; Undo restores the value, the tag and the focus.
export const Edited: Story = {
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await pinned(canvasElement, READ_KEYS);

    const description = canvas.getByLabelText("Description");
    const row = within(card(canvasElement, "description"));

    await userEvent.type(description, " and support");
    await expect(row.getByText("Corrected by you")).toBeVisible();
    await expect(
      row.getByText("Read as “Additional consulting project - October 2026”")
    ).toBeVisible();

    await userEvent.click(
      row.getByRole("button", { name: "Undo Description" })
    );
    await expect(description).toHaveValue(
      "Additional consulting project - October 2026"
    );
    await expect(row.getByText("Extracted")).toBeVisible();
    await expect(row.queryByText(/^Read as/u)).toBeNull();
    await expect(description).toHaveFocus();
  },
};

// T4.5: a field whose quote failed sits in the panel with Check this; Save names and focuses it.
export const NoQuote: Story = {
  args: { view: noQuoteInvoiceReview },
  beforeEach: () => serve(noQuoteInvoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await pinned(canvasElement, ["customer", "number", "amount"]);

    const date = card(canvasElement, "date");

    await expect(
      canvasElement.querySelector('[data-pin-card="date"]')
    ).toBeNull();
    await expect(
      panel(canvasElement).getByLabelText("Invoice date")
    ).toBeVisible();
    await expect(within(date).getByText("Check this")).toBeVisible();
    await expect(
      within(date).getByText(
        "The quote read for this field is not in the page text, so its value was dropped. Enter it from the page."
      )
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter the invoice date to save.")
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Save as unpaid" })
    );
    await expect(canvas.getByLabelText("Invoice date")).toHaveFocus();
    await expect(saveInvoice).not.toHaveBeenCalled();
  },
};

// T4.6: a quote the text layer cannot find keeps its card, once, in the pin column, and its value saves.
export const LostQuote: Story = {
  args: { view: lostQuoteInvoiceReview },
  beforeEach: () => serve(lostQuoteInvoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await pinned(canvasElement, ["customer", "number", "amount"]);
    card(canvasElement, "currency");
    await expect(
      canvasElement.querySelector('[data-pin-card="currency"]')
    ).not.toBeNull();
    await expect(
      canvasElement.querySelector('[data-pin-line="currency"]')
    ).toBeNull();

    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save as unpaid" })
    );
    await waitFor(() => expect(saveInvoice).toHaveBeenCalledTimes(1));
    await expect(saveInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "SGD" })
    );
  },
};

const middle = (box: DOMRect) => (box.top + box.bottom) / 2;

const marksOf = (root: HTMLElement, key: string) =>
  Array.from(root.querySelectorAll(`mark[data-highlight="${key}"]`))
    .map((mark) => mark.getBoundingClientRect())
    .toSorted((a, b) => a.top - b.top);

// T5.1 to T5.3: the split sits in the panel with live Linked and Unallocated; Save names and
// focuses the link that blocks it; Invoice numbers pins between its two lines.
export const PaymentSplit: Story = {
  args: { view: splitPaymentReview },
  beforeEach: () => serve(splitPaymentReview),
  play: async ({ canvas, canvasElement }) => {
    await pinned(canvasElement, [
      "customer",
      "date",
      "amount",
      "currency",
      "reference",
      "method",
      "invoiceNumbers",
    ]);

    const side = panel(canvasElement);

    await expect(
      side.getByText(
        "Every field was found on the page. Select a card to see its line."
      )
    ).toBeVisible();

    const splitElement = aside(canvasElement).querySelector<HTMLElement>(
      "[data-review-split]"
    );

    if (splitElement === null) throw new Error("The panel has no split.");

    const split = within(splitElement);

    await expect(
      split.getByRole("region", { name: "Named on this payment" })
    ).toBeVisible();
    await expect(
      split.getByRole("button", {
        name: "Other open invoices of Orchid Retail",
      })
    ).toBeVisible();

    // T5.1: an edit of one link moves Unallocated at once.
    const sep = canvas.getByLabelText("Amount for INV-2026-09-04");

    await userEvent.clear(sep);
    await userEvent.type(sep, "4,000.00");
    await expect(
      split.getByText(`Linked ${SGD(805000)}. Unallocated ${SGD(20000)}.`)
    ).toBeVisible();

    // T5.2: a link above its open amount, then a link of 0.00, each named and focused by Save.
    const save = canvas.getByRole("button", { name: "Save the payment" });

    await userEvent.clear(sep);
    await userEvent.type(sep, "4,300.00");
    await expect(
      side.getByText(
        `The link to INV-2026-09-04 is more than its open ${SGD(420000)}.`
      )
    ).toBeVisible();
    await userEvent.click(save);
    await expect(sep).toHaveFocus();

    await userEvent.clear(sep);
    await userEvent.type(sep, "0.00");
    await expect(
      side.getByText("Enter the amount for INV-2026-09-04.")
    ).toBeVisible();
    await userEvent.click(save);
    await expect(sep).toHaveFocus();
    await expect(savePayment).not.toHaveBeenCalled();

    // T5.3: two quotes pin to the middle of both lines, not to the first.
    const quotes = marksOf(canvasElement, "invoiceNumbers");

    const dot = middle(
      canvasElement
        .querySelector('[data-pin-dot="invoiceNumbers"]')
        ?.getBoundingClientRect() ?? new DOMRect()
    );

    await expect(dot).toBeGreaterThan(middle(quotes[0] ?? new DOMRect()) + 2);
    await expect(dot).toBeLessThan(middle(quotes.at(-1) ?? new DOMRect()) - 2);
  },
};

const brokenFile: DocumentReviewView = {
  ...invoiceReview,
  document: { ...invoiceReview.document, fileUrl: "/demo-pack/missing.pdf" },
};

// T4.7: a page that does not load puts every card in the panel, with Try again.
export const PreviewFailedReview: Story = {
  name: "Preview failed",
  args: { view: brokenFile },
  beforeEach: () => serve(brokenFile),
  play: async ({ canvas, canvasElement }) => {
    await waitFor(
      () =>
        expect(canvas.getByRole("button", { name: "Try again" })).toBeVisible(),
      PAGE_TIMEOUT
    );

    const side = aside(canvasElement);

    await expect(
      [...READ_KEYS, "dueDate", "paymentTerms"].filter(
        (key) => !side.contains(card(canvasElement, key))
      )
    ).toEqual([]);

    await expect(canvasElement.querySelector("[data-pin-card]")).toBeNull();
  },
};

/** The one element that matches, once it is drawn. */
const drawn = (root: Element, selector: string, what: string) =>
  waitFor(() => {
    const found = root.querySelector(selector);

    if (found === null) throw new Error(`${what} has not drawn yet.`);

    return found;
  }, PAGE_TIMEOUT);

// T6.1, T6.2 (B4.4): the page reads under a scan with no Discard; the sweep then shows each card,
// and the PDF loads once from its first link.
export const Reading: Story = {
  args: { view: readingReview },
  beforeEach: () => {
    serve(readingReview);
    let calls = 0;

    getDocumentReview.mockImplementation(async () => {
      calls += 1;

      return calls === 1 ? readingReview : invoiceAfterReading;
    });
  },
  play: async ({ canvas, canvasElement }) => {
    await drawn(canvasElement, '[data-scan="loop"]', "The scan");
    await expect(
      canvas.getByText("Reading. Fields appear as each line is read.")
    ).toHaveAttribute("role", "status");
    await expect(
      canvasElement.querySelectorAll("[data-skeleton-card]")
    ).toHaveLength(1);

    const side = panel(canvasElement);

    await expect(
      side.getByText(
        "Reading the document. Fields that are not on the page, and the split of a payment, show here when the reading finishes."
      )
    ).toBeVisible();
    await expect(
      side.getByText("Wait for the reading to finish.")
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Discard" })).toBeNull();

    const type = canvas.getByRole("combobox", { name: "Type" });

    await expect(type).toBeDisabled();
    await expect(type).toHaveTextContent("Not classified yet");

    const viewer = await drawn(
      canvasElement,
      "[data-document-viewer]",
      "The viewer"
    );

    const firstLink = `${DEMO_PDF.invoice01}?v=1`;

    await expect(viewer).toHaveAttribute("data-document-url", firstLink);

    const page = await drawn(viewer, "canvas", "The document");

    // T6.2: the poll answers the read invoice; the sweep plays once and shows every card.
    await waitFor(
      () => expect(canvasElement.querySelector("[data-scan]")).toBeNull(),
      PAGE_TIMEOUT
    );
    await pinned(canvasElement, READ_KEYS);

    // `invisible` keeps a hidden card in the layout, so visibility is what the reveal changes.
    await expect(
      READ_KEYS.filter(
        (key) =>
          !canvasElement
            .querySelector(`[data-pin-card="${key}"]`)
            ?.hasAttribute("data-revealed") ||
          getComputedStyle(card(canvasElement, key)).visibility !== "visible"
      )
    ).toEqual([]);

    await expect(
      canvasElement.querySelector("[data-skeleton-card]")
    ).toBeNull();
    await expect(
      panel(canvasElement).getByText(
        "Choose a due date or mark it unspecified to save."
      )
    ).toBeVisible();

    // The refetch's ?v=2 never reaches the viewer, and its PDF stays drawn.
    await expect(viewer).toHaveAttribute("data-document-url", firstLink);
    await expect(page.isConnected).toBe(true);
  },
};
