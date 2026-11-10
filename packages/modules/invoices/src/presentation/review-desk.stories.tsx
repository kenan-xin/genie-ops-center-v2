import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { DEMO_PDF } from "./__fixtures__/demo-pdfs.ts";
import {
  invoiceAfterReading,
  invoiceReview,
  lostQuoteInvoiceReview,
  meridianOpenInvoices,
  noQuoteInvoiceReview,
  readingReview,
  savedInvoiceReview,
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

const phone390 = { viewport: { value: "phone390", isRotated: false } };

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
    // Undo focuses on the next frame (focusSoon), which comes late under load (xok3.61).
    await waitFor(() => expect(description).toHaveFocus());
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
    const found = root.querySelector<HTMLElement>(selector);

    if (found === null) throw new Error(`${what} has not drawn yet.`);

    return found;
  }, PAGE_TIMEOUT);

/** The first request answers the reading document, the poll after it the read invoice. */
function serveReadingThenRead() {
  serve(readingReview);
  let calls = 0;

  getDocumentReview.mockImplementation(async () => {
    calls += 1;

    return calls === 1 ? readingReview : invoiceAfterReading;
  });
}

// T6.1, T6.2 (B4.4): the page reads under a scan with no Discard; the sweep then shows each card,
// and the PDF loads once from its first link.
export const Reading: Story = {
  args: { view: readingReview },
  beforeEach: serveReadingThenRead,
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

let releaseSave: (() => void) | null = null;

// T7.1: a save made on this page keeps the desk, read only, with the result in the panel.
// T7.2: a field typed while the save is pending is not shown as saved.
export const Saved: Story = {
  beforeEach: () => {
    serve(invoiceReview);
    saveInvoice.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSave = () => {
            getDocumentReview.mockResolvedValue(savedInvoiceReview);
            resolve(ENVELOPE);
          };
        })
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await pinned(canvasElement, READ_KEYS);
    await userEvent.type(canvas.getByLabelText("Description"), " and support");
    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save as unpaid" })
    );
    await waitFor(() => expect(saveInvoice).toHaveBeenCalledTimes(1));
    await userEvent.type(canvas.getByLabelText("Description"), " late");
    releaseSave?.();

    const done = await drawn(
      canvasElement,
      'aside[aria-label="Saved"]',
      "The saved panel"
    );

    const side = within(done);

    await expect(
      side.getByText("Saved as invoice INV-LIVE-001.")
    ).toBeVisible();
    await expect(
      side.getByRole("link", { name: "Open the invoice" })
    ).toBeVisible();
    await expect(
      canvasElement.querySelectorAll(
        "[data-field] input, [data-field] textarea, [data-field] [role=combobox]"
      )
    ).toHaveLength(0);

    const description = within(card(canvasElement, "description"));

    await expect(description.getByText("Corrected by you")).toBeVisible();
    await expect(
      description.getByText(
        "Additional consulting project - October 2026 and support",
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      description.getByText(
        "Read as “Additional consulting project - October 2026”"
      )
    ).toBeVisible();
    await expect(
      description.queryByRole("button", { name: "Undo Description" })
    ).toBeNull();
    await expect(canvas.getByRole("combobox", { name: "Type" })).toBeDisabled();
    await expect(
      canvas.queryByRole("button", { name: "Save as unpaid" })
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Discard" })).toBeNull();
  },
};

type Canvas = ReturnType<typeof within>;

/** The pager shows this step line once its step renders. */
const onStep = (canvas: Canvas, step: number, of: number) =>
  waitFor(
    () => expect(canvas.getByText(`Step ${step} of ${of}`)).toBeVisible(),
    PAGE_TIMEOUT
  );

/** Presses the next button of the pager, under the label it carries now, the given times. */
async function next(canvas: Canvas, label: string, times = 1) {
  for (let pressed = 0; pressed < times; pressed += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each press waits for the step it opens.
    await userEvent.click(canvas.getByRole("button", { name: label }));
  }
}

/** The All fields title, once the sheet has faded in. */
const listTitle = (text: string) =>
  waitFor(() => expect(screen.getByText(text)).toBeVisible());

/** Opens All fields and presses the row whose name starts with `row`. */
async function pickField(canvas: Canvas, row: string) {
  await userEvent.click(canvas.getByRole("button", { name: "All fields" }));
  await userEvent.click(
    await screen.findByRole("button", { name: new RegExp(`^${row}`, "u") })
  );
}

// T8.1, T8.2, T8.5: one field per step in list order, the next label follows the tag, and the
// summary lists every field with Save and its reason. T9.1, T9.2: All fields counts the steps
// done and opens a step; a blocked Save goes to the step that blocks it.
export const InvoiceOnPhone: Story = {
  globals: phone390,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await onStep(canvas, 1, 9);
    card(canvasElement, "customer");
    await drawn(canvasElement, "[data-lens-spot]", "The lens spot");

    // T9.2: the list counts nothing yet, and its Due date row opens step 7.
    await userEvent.click(canvas.getByRole("button", { name: "All fields" }));
    await listTitle("All fields · 0 of 9 done");
    await userEvent.click(screen.getByRole("button", { name: /^Due date/u }));
    await onStep(canvas, 7, 9);
    card(canvasElement, "dueDate");
    await pickField(canvas, "Customer");
    await onStep(canvas, 1, 9);

    // T8.1: forward one step and back.
    await next(canvas, "Looks right");
    await onStep(canvas, 2, 9);
    card(canvasElement, "number");

    // T9.2: the step passed with Looks right counts as done.
    await userEvent.click(canvas.getByRole("button", { name: "All fields" }));
    await listTitle("All fields · 1 of 9 done");
    await userEvent.click(
      screen.getByRole("button", { name: /^Invoice number/u })
    );
    await onStep(canvas, 2, 9);
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous field" })
    );
    await onStep(canvas, 1, 9);
    card(canvasElement, "customer");

    // T8.2: the due date, which the page does not state, asks to Continue.
    await next(canvas, "Looks right", 6);
    await onStep(canvas, 7, 9);
    await expect(
      within(card(canvasElement, "dueDate")).getByText("Needs your input")
    ).toBeVisible();
    await expect(canvas.getByText("Not found on the page")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Looks right" })
    ).toBeNull();

    // T8.5: the summary lists the eight fields, and Save states its reason.
    await next(canvas, "Continue");
    await onStep(canvas, 8, 9);
    await next(canvas, "Looks right");
    await onStep(canvas, 9, 9);
    await expect(
      canvas.getByRole("heading", { name: "Check and save" })
    ).toBeVisible();

    const summary = within(
      canvasElement.querySelector<HTMLElement>("[data-review-summary]") ??
        canvasElement
    );

    await expect(summary.getAllByRole("term")).toHaveLength(8);
    await expect(summary.getByText("INV-LIVE-001")).toBeVisible();
    await expect(summary.getByText("Needs your input")).toBeVisible();
    await expect(
      canvas.getByText("Choose a due date or mark it unspecified to save.")
    ).toBeVisible();
    const save = canvas.getByRole("button", { name: "Save as unpaid" });

    await expect(save).toHaveAttribute("aria-disabled", "true");

    // T9.1: Save goes to the due date step and focuses its choice.
    await userEvent.click(save);
    await onStep(canvas, 7, 9);
    await waitFor(() =>
      expect(
        canvas.getByRole("radio", { name: "Enter a due date" })
      ).toHaveFocus()
    );
    await expect(saveInvoice).not.toHaveBeenCalled();
  },
};

// T9.3: while the job reads, the lens shows the page with no step and no bottom bar; when the
// reading lands, step 1 shows in the same lens.
export const ReadingOnPhone: Story = {
  globals: phone390,
  args: { view: readingReview },
  beforeEach: serveReadingThenRead,
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Reading the document" })
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "You check the fields one at a time when the reading finishes."
      )
    ).toBeVisible();
    await expect(canvas.getByText("Reading the page")).toBeVisible();
    await expect(
      canvasElement.querySelector("[data-shell-bottom-bar]")
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "All fields" })
    ).toBeNull();

    const viewer = await drawn(
      canvasElement,
      "[data-document-viewer]",
      "The viewer"
    );

    const page = await drawn(viewer, "canvas", "The document");

    await onStep(canvas, 1, 9);
    await expect(page.isConnected).toBe(true);
    await expect(
      canvasElement.querySelector("[data-shell-bottom-bar]")
    ).not.toBeNull();
  },
};

// After a payment save the linked invoices leave the open list, so a split row computed again
// from the refetch would read Linked 0.00; the result card states the split instead.
export const PaymentSavedOnPhone: Story = {
  globals: phone390,
  args: { view: splitPaymentReview },
  beforeEach: () => {
    serve(splitPaymentReview);
    savePayment.mockImplementation(async () => {
      getDocumentReview.mockResolvedValue({
        ...splitPaymentReview,
        document: { ...splitPaymentReview.document, status: "saved" },
        payment:
          splitPaymentReview.payment === null
            ? null
            : { ...splitPaymentReview.payment, openInvoices: [] },
        saved: {
          invoice: null,
          payment: {
            id: "40000000-0000-4000-8000-000000000003",
            reference: "OR-AUG-SEP-BUNDLE",
            paymentDate: "2026-10-27",
          },
          automaticLinks: [],
        },
      });

      return {
        outcome: "saved",
        paymentId: "40000000-0000-4000-8000-000000000003",
        customerId: splitPaymentReview.customerMatch?.id ?? "",
        allocations: [],
      };
    });
  },
  play: async ({ canvas, canvasElement }) => {
    await onStep(canvas, 1, 9);
    await pickField(canvas, "Save the payment");
    await onStep(canvas, 9, 9);
    await userEvent.click(
      canvas.getByRole("button", { name: "Save the payment" })
    );
    await expect(
      await canvas.findByText(/^Payment saved: .* linked/u, {}, PAGE_TIMEOUT)
    ).toBeVisible();

    const summary = await drawn(
      canvasElement,
      "[data-review-summary]",
      "The summary"
    );

    await waitFor(() =>
      expect(within(summary).queryByText(/^Linked /u)).toBeNull()
    );
  },
};

// T9.4: a save on a phone shows the result and the summary read only, with no bottom bar.
export const SavedOnPhone: Story = {
  globals: phone390,
  beforeEach: () => {
    serve(invoiceReview);
    saveInvoice.mockImplementation(async () => {
      getDocumentReview.mockResolvedValue(savedInvoiceReview);

      return ENVELOPE;
    });
  },
  play: async ({ canvas, canvasElement }) => {
    await onStep(canvas, 1, 9);
    await pickField(canvas, "Due date");
    await onStep(canvas, 7, 9);
    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await pickField(canvas, "Save as unpaid");
    await onStep(canvas, 9, 9);
    await userEvent.click(
      canvas.getByRole("button", { name: "Save as unpaid" })
    );

    await expect(
      await canvas.findByText(
        "Saved as invoice INV-LIVE-001.",
        {},
        PAGE_TIMEOUT
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open the invoice" })
    ).toBeVisible();

    const summary = await drawn(
      canvasElement,
      "[data-review-summary]",
      "The summary"
    );

    await expect(within(summary).getByText("Unspecified")).toBeVisible();
    // The result card keeps Upload another, whose file input is not a field.
    await expect(canvasElement.querySelector("[data-field]")).toBeNull();
    await expect(
      summary.querySelectorAll("input, textarea, [role=combobox]")
    ).toHaveLength(0);
    await expect(
      canvasElement.querySelector("[data-shell-bottom-bar]")
    ).toBeNull();
  },
};

// czjw.147: Enter (the Go key) in a step's field goes to the next step and never saves; Enter in
// the customer picker picks the option and stays on its step.
export const EnterOnAStepOnPhone: Story = {
  globals: phone390,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await onStep(canvas, 1, 9);
    // Clear the due date blocker, so that a submit would really save.
    await pickField(canvas, "Due date");
    await onStep(canvas, 7, 9);
    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await pickField(canvas, "Invoice number");
    await onStep(canvas, 2, 9);
    await userEvent.type(canvas.getByLabelText("Invoice number"), "{Enter}");
    await expect(saveInvoice).not.toHaveBeenCalled();
    await onStep(canvas, 3, 9);

    // A browser and user-event both click the form's first submit button on Enter.
    await expect(
      canvasElement
        .querySelector("form")
        ?.querySelector(
          'button[type="submit"], button:not([type]), input[type="submit"]'
        )
    ).toBe(canvas.getByRole("button", { name: "Looks right" }));

    await pickField(canvas, "Customer");
    await onStep(canvas, 1, 9);

    const customer = canvas.getByRole("combobox", { name: "Customer" });

    await userEvent.clear(customer);
    await userEvent.type(customer, "ABC{ArrowDown}{Enter}");
    await expect(customer).toHaveValue("ABC Trading");
    await expect(canvas.getByText("Step 1 of 9")).toBeVisible();
    await expect(saveInvoice).not.toHaveBeenCalled();
  },
};

// czjw.148: a step change puts focus on the step line, and Previous stays on step 1, where it does nothing.
export const StepFocusOnPhone: Story = {
  globals: phone390,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas }) => {
    await onStep(canvas, 1, 9);

    const previous = () =>
      canvas.getByRole("button", { name: "Previous field" });

    await expect(previous()).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(previous());
    await expect(canvas.getByText("Step 1 of 9")).toBeVisible();
    await expect(previous()).toHaveFocus();

    await next(canvas, "Looks right");
    await waitFor(() => expect(canvas.getByText("Step 2 of 9")).toHaveFocus());

    await userEvent.click(previous());
    await waitFor(() => expect(canvas.getByText("Step 1 of 9")).toHaveFocus());
    await expect(previous()).toBeInTheDocument();
  },
};

// T8.3: an edit shows the read value, and the next button keeps the edit.
export const EditedOnPhone: Story = {
  globals: phone390,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await onStep(canvas, 1, 9);
    await next(canvas, "Looks right", 5);
    await onStep(canvas, 6, 9);

    const row = within(card(canvasElement, "description"));

    await userEvent.type(canvas.getByLabelText("Description"), " and support");
    await expect(
      row.getByText("Read as “Additional consulting project - October 2026”")
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Keep and continue" })
    ).toBeVisible();
  },
};

// A field whose quote failed, at 390 for axe.
export const NoQuoteOnPhone: Story = {
  globals: phone390,
  args: { view: noQuoteInvoiceReview },
  beforeEach: () => serve(noQuoteInvoiceReview),
  play: async ({ canvas }) => onStep(canvas, 1, 9),
};

// T8.4: the split is its own step, and a refused split holds the next button on its link.
export const PaymentSplitOnPhone: Story = {
  globals: phone390,
  args: { view: splitPaymentReview },
  beforeEach: () => serve(splitPaymentReview),
  play: async ({ canvas }) => {
    await onStep(canvas, 1, 9);
    await next(canvas, "Looks right", 7);
    await onStep(canvas, 8, 9);
    await expect(canvas.getByText("Confirm the split")).toBeVisible();

    const sep = canvas.getByLabelText("Amount for INV-2026-09-04");

    await userEvent.clear(sep);
    await userEvent.type(sep, "4,300.00");

    const looksRight = canvas.getByRole("button", { name: "Looks right" });

    await expect(looksRight).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(looksRight);
    await expect(sep).toHaveFocus();
    await expect(canvas.getByText("Step 8 of 9")).toBeVisible();
  },
};
