import { ModuleClientProvider } from "@genie/core/rpc/client";
import { controlHeightsPx, touchAreaPx } from "@genie/ui/tokens";
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
  noLinesInvoiceReview,
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
          "The review of a document as one form beside the page (Spec 7 R-38, `czjw.187`). The desk chooses its layout from its own width, not the viewport, so the docked agent panel narrows it. From 688 px of the desk's width the Fields region sits beside the page: Type first, then the sections Needs your input, From the document and Optional, which come from the reading, so a field never moves while the person types; then the split of a payment and Save, which names and focuses what blocks it.",
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

/** The page is drawn once each read field has its mark on it. */
async function marked(root: HTMLElement, keys: readonly string[]) {
  await waitFor(() => {
    for (const key of keys) {
      if (root.querySelector(`mark[data-highlight="${key}"]`) === null)
        throw new Error(`No mark for ${key} on the page.`);
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

/** The Fields region of the one form, once it is drawn. */
const fields = (root: HTMLElement) =>
  drawn(root, 'section[aria-label="Fields"]', "The Fields region");

const SECTION_CAPTIONS = [
  "Needs your input",
  "From the document",
  "Optional",
] as const;

/** The captions of the form's sections, in their order on the page; the split has its own. */
const captionsOf = (region: HTMLElement) =>
  Array.from(
    region.querySelectorAll("section[aria-labelledby] > h2"),
    (caption) => caption.textContent
  ).filter((caption) => SECTION_CAPTIONS.some((title) => title === caption));

/** The fields of one section, by its caption, in their order on the page. */
const keysOf = (region: HTMLElement, caption: string) =>
  Array.from(
    within(region)
      .getByRole("region", { name: caption })
      .querySelectorAll<HTMLElement>("[data-field]"),
    (field) => field.dataset.field
  );

/** `first` comes before `second` in the page. */
const before = (first: Node, second: Node) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !==
  0;

const READ_KEYS = [
  "customer",
  "number",
  "date",
  "amount",
  "currency",
  "description",
] as const;

// T1-c (czjw.187): one form beside the page, Type first, the three sections from the reading in
// their order, each field once, no card or leader line; Save names and focuses the due date.
export const Invoice: Story = {
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await marked(canvasElement, READ_KEYS);

    const region = await fields(canvasElement);
    const form = within(region);

    await expect(
      before(
        form.getByRole("combobox", { name: "Type" }),
        region.querySelector("[data-field]") ?? region
      )
    ).toBe(true);
    await expect(captionsOf(region)).toEqual(SECTION_CAPTIONS);
    await expect(keysOf(region, "Needs your input")).toEqual(["dueDate"]);
    await expect(keysOf(region, "From the document")).toEqual(READ_KEYS);
    await expect(keysOf(region, "Optional")).toEqual(["paymentTerms"]);

    for (const key of [...READ_KEYS, "dueDate", "paymentTerms"]) {
      card(canvasElement, key);
    }

    await expect(canvasElement.querySelectorAll("[data-field]")).toHaveLength(
      8
    );
    await expect(
      canvas.queryByRole("complementary", { name: "Before you save" })
    ).toBeNull();
    await expect(canvasElement.querySelector("[data-pin-card]")).toBeNull();
    await expect(canvasElement.querySelector("[data-pin-line]")).toBeNull();
    await expect(
      within(card(canvasElement, "dueDate")).getByText("Needs your input")
    ).toBeVisible();
    await expect(
      within(card(canvasElement, "paymentTerms")).getByText("Optional")
    ).toBeVisible();
    // P05-24: the field chip keeps "Needs your input"; the status pill says "To review".
    await expect(
      canvas.getByText("To review", { selector: '[data-slot="badge"]' })
    ).toBeVisible();
    await expect(
      form.getByText("Enter a due date or choose No due date to save.")
    ).toBeVisible();

    // Save and Enter both go to the due choice and save nothing.
    const save = canvas.getByRole("button", { name: "Save" });

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

    // A valid choice clears the blocker and saves once; the due date keeps its section.
    await userEvent.click(canvas.getByRole("radio", { name: "No due date" }));
    await expect(canvas.getAllByText("Ready to save")).toHaveLength(2);
    await expect(keysOf(region, "Needs your input")).toEqual(["dueDate"]);

    await userEvent.click(save);
    await waitFor(() => expect(saveInvoice).toHaveBeenCalledTimes(1));
    await expect(saveInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ dueDateSource: "unspecified" })
    );
  },
};

// T1-d (H1-27): an edit shows the read value with Undo and no origin chip; Undo restores the
// value and the focus.
export const Edited: Story = {
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await fields(canvasElement);

    const description = canvas.getByLabelText("Description");
    const row = within(card(canvasElement, "description"));

    await userEvent.type(description, " and support");
    await expect(
      row.getByText("Read as “Additional consulting project - October 2026”")
    ).toBeVisible();
    await expect(row.queryByText("Corrected by you")).toBeNull();

    await userEvent.click(
      row.getByRole("button", { name: "Undo Description" })
    );
    await expect(description).toHaveValue(
      "Additional consulting project - October 2026"
    );
    await expect(row.queryByText(/^Read as/u)).toBeNull();
    await expect(row.queryByText("Extracted")).toBeNull();
    // Undo focuses on the next frame (focusSoon), which comes late under load (xok3.61).
    await waitFor(() => expect(description).toHaveFocus());
  },
};

// T1-e: a field whose quote failed needs input, with Check this; Save names and focuses it.
export const NoQuote: Story = {
  args: { view: noQuoteInvoiceReview },
  beforeEach: () => serve(noQuoteInvoiceReview),
  play: async ({ canvas, canvasElement }) => {
    const region = await fields(canvasElement);

    await expect(keysOf(region, "Needs your input")).toContain("date");

    const date = within(card(canvasElement, "date"));

    await expect(date.getByText("Check this")).toBeVisible();
    await expect(
      date.getByText(
        "The quote read for this field is not in the page text, so its value was dropped. Enter it from the page."
      )
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter the invoice date to save.")
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByLabelText("Invoice date")).toHaveFocus();
    await expect(saveInvoice).not.toHaveBeenCalled();
  },
};

// A quote the text layer cannot find keeps its field, once, under From the document, and its
// value saves.
export const LostQuote: Story = {
  args: { view: lostQuoteInvoiceReview },
  beforeEach: () => serve(lostQuoteInvoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await marked(canvasElement, ["customer", "number", "amount"]);

    const region = await fields(canvasElement);

    card(canvasElement, "currency");
    await expect(keysOf(region, "From the document")).toContain("currency");
    await expect(
      canvasElement.querySelector('mark[data-highlight="currency"]')
    ).toBeNull();

    await userEvent.click(canvas.getByRole("radio", { name: "No due date" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveInvoice).toHaveBeenCalledTimes(1));
    await expect(saveInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "SGD" })
    );
  },
};

// T2-a (czjw.187, H1-30): the locate button selects the field, lights its line and brings it into
// the page's visible box; the pointer on a field lights its line too.
export const LocateLightsTheLine: Story = {
  globals: desktop1440,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await marked(canvasElement, READ_KEYS);

    // The page scrolls to its end, so the customer line starts out of sight.
    const scroller = canvasElement.querySelector<HTMLElement>(
      "[data-desk-content]"
    )?.parentElement;

    if (scroller == null) throw new Error("The page has no scroll box.");

    scroller.scrollTop = scroller.scrollHeight;

    await userEvent.click(
      canvas.getByRole("button", { name: "Show Customer on the document" })
    );

    const visible = scroller.getBoundingClientRect();

    await waitFor(() => {
      const line = canvasElement.querySelector(
        '[data-line-box="customer"][data-lit="selected"]'
      );

      if (line === null) throw new Error("The customer line is not lit.");

      const box = line.getBoundingClientRect();

      if (box.top < visible.top - 1 || box.bottom > visible.bottom + 1)
        throw new Error("The customer line is out of view.");
    });
    await expect(card(canvasElement, "customer")).toHaveAttribute(
      "data-selected"
    );

    await userEvent.hover(card(canvasElement, "amount"));
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '[data-line-box="amount"][data-lit="hovered"]'
        )
      ).not.toBeNull()
    );
  },
};

/** The color `--ring` resolves to, read beside `element` in the same cascade. */
function ringOf(element: HTMLElement): string {
  const probe = document.createElement("span");

  probe.style.color = "var(--ring)";
  element.append(probe);

  const color = getComputedStyle(probe).color;

  probe.remove();

  return color;
}

// T2-b (czjw.187): the pointer on a mark of the page lights its field, whose control takes the
// ring border, so the highlight goes both ways.
export const MarkLightsTheField: Story = {
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvasElement }) => {
    await marked(canvasElement, READ_KEYS);

    const mark = canvasElement.querySelector<HTMLElement>(
      'mark[data-highlight="number"]'
    );

    if (mark === null) throw new Error("The page has no mark for number.");

    await userEvent.hover(mark);

    const number = card(canvasElement, "number");

    await waitFor(() => expect(number).toHaveAttribute("data-hovered"));

    const input = number.querySelector<HTMLInputElement>("input");

    if (input === null) throw new Error("The number field has no input.");

    const ring = ringOf(number);

    await waitFor(() =>
      expect(getComputedStyle(input).borderTopColor).toBe(ring)
    );
  },
};

// T2-c (czjw.187): a quoted field whose line the page lacks says so and keeps no locate button, so
// a press never lights nothing; a field with a line keeps its button.
export const LostLineHasNoLocate: Story = {
  args: { view: lostQuoteInvoiceReview },
  beforeEach: () => serve(lostQuoteInvoiceReview),
  play: async ({ canvasElement }) => {
    await marked(canvasElement, ["customer", "number", "amount"]);

    const currency = within(card(canvasElement, "currency"));

    await waitFor(() =>
      expect(
        currency.getByText("No matching line was found on the page.")
      ).toBeVisible()
    );
    await expect(
      currency.queryByRole("button", { name: "Show Currency on the document" })
    ).toBeNull();
    await expect(
      within(card(canvasElement, "number")).getByRole("button", {
        name: "Show Invoice number on the document",
      })
    ).toBeVisible();
    await expect(
      canvasElement.querySelector('mark[data-highlight="currency"]')
    ).toBeNull();
  },
};

// The page holds none of the quotes, so it draws with no marks: every quoted field says its line
// is missing and keeps no locate button that lights nothing.
export const PageHoldsNoQuotes: Story = {
  args: { view: noLinesInvoiceReview },
  beforeEach: () => serve(noLinesInvoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await fields(canvasElement);

    await waitFor(() => {
      for (const key of READ_KEYS) {
        expect(
          within(card(canvasElement, key)).getByText(
            "No matching line was found on the page."
          )
        ).toBeVisible();
      }
    }, PAGE_TIMEOUT);

    await expect(
      canvas.queryByRole("button", { name: /^Show .* on the document$/u })
    ).toBeNull();
  },
};

const PAYMENT_KEYS = [
  "customer",
  "date",
  "amount",
  "currency",
  "reference",
  "method",
  "invoiceNumbers",
] as const;

// T1-f: each payment field once under From the document, the split after the sections with live
// Allocated and Unallocated; Save names and focuses the allocation that blocks it.
export const PaymentSplit: Story = {
  args: { view: splitPaymentReview },
  beforeEach: () => serve(splitPaymentReview),
  play: async ({ canvas, canvasElement }) => {
    const region = await fields(canvasElement);

    await expect(captionsOf(region)).toEqual(["From the document"]);
    await expect(keysOf(region, "From the document")).toEqual(PAYMENT_KEYS);

    for (const key of PAYMENT_KEYS) card(canvasElement, key);

    const splitElement = region.querySelector<HTMLElement>(
      "[data-review-split]"
    );

    if (splitElement === null) throw new Error("The form has no split.");

    await expect(
      before(
        within(region).getByRole("region", { name: "From the document" }),
        splitElement
      )
    ).toBe(true);

    const split = within(splitElement);

    await expect(
      split.getByRole("region", { name: "Named on this payment" })
    ).toBeVisible();
    await expect(
      split.getByRole("button", {
        name: "Other open invoices of Orchid Retail",
      })
    ).toBeVisible();

    // An edit of one allocation moves Unallocated at once.
    const sep = canvas.getByLabelText("Amount for INV-2026-09-04");

    await expect(sep.id).toMatch(/^link-/u);
    await userEvent.clear(sep);
    await userEvent.type(sep, "4,000.00");
    await expect(
      split.getByText(`Allocated ${SGD(805000)}. Unallocated ${SGD(20000)}.`)
    ).toBeVisible();

    // An allocation above its open amount, then one of 0.00, each named and focused by Save.
    const save = canvas.getByRole("button", { name: "Save" });

    await userEvent.clear(sep);
    await userEvent.type(sep, "4,300.00");
    await expect(
      within(region).getByText(
        `The allocation to INV-2026-09-04 is more than its open ${SGD(420000)}.`
      )
    ).toBeVisible();
    await userEvent.click(save);
    await expect(sep).toHaveFocus();

    await userEvent.clear(sep);
    await userEvent.type(sep, "0.00");
    await expect(
      within(region).getByText("Enter the amount for INV-2026-09-04.")
    ).toBeVisible();
    await userEvent.click(save);
    await expect(sep).toHaveFocus();
    await expect(savePayment).not.toHaveBeenCalled();

    // C16-6: an invoice number in a row's label never breaks across two lines.
    for (const row of splitElement.querySelectorAll("li")) {
      const label = row.querySelector("label");
      const number = /INV-\S+/u.exec(label?.textContent ?? "");

      if (label === null || number === null) continue;

      const range = textRange(label, number[0]);

      if (range === null) throw new Error(`No range for ${number[0]}.`);

      const tops = Array.from(range.getClientRects(), (rect) =>
        Math.round(rect.top)
      );

      const [first] = tops;

      if (first === undefined) continue;

      for (const top of tops) {
        // oxlint-disable-next-line no-await-in-loop -- one top names the one that differs.
        await expect(Math.abs(top - first)).toBeLessThanOrEqual(1);
      }
    }
  },
};

const brokenFile: DocumentReviewView = {
  ...invoiceReview,
  document: { ...invoiceReview.document, fileUrl: "/demo-pack/missing.pdf" },
};

// A page that does not load keeps the whole form beside it, with Try again, and Save still saves.
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

    const region = await fields(canvasElement);

    await expect(
      [...READ_KEYS, "dueDate", "paymentTerms"].filter(
        (key) => !region.contains(card(canvasElement, key))
      )
    ).toEqual([]);
    await expect(canvasElement.querySelector("[data-pin-card]")).toBeNull();

    await userEvent.click(canvas.getByRole("radio", { name: "No due date" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveInvoice).toHaveBeenCalledTimes(1));
  },
};

// Review fix (P16g): the agent panel docks after the first link expired, the desk mounts again on it,
// and the first failed load asks once for a fresh link, so the page draws with no Preview failed.
export const ExpiredLinkLoadsAgain: Story = {
  args: { view: brokenFile },
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await marked(canvasElement, READ_KEYS);
    await expect(
      canvas.queryByRole("button", { name: "Try again" })
    ).toBeNull();
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

// T6.1, T6.2 (B4.4): the page reads under a scan with no Delete and the form waits with its
// note; the sweep then shows every field, and the PDF loads once from its first link.
export const Reading: Story = {
  args: { view: readingReview },
  beforeEach: serveReadingThenRead,
  play: async ({ canvas, canvasElement }) => {
    await drawn(canvasElement, '[data-scan="loop"]', "The scan");
    await expect(
      canvas.getByText("Reading. Fields appear as each line is read.")
    ).toHaveAttribute("role", "status");

    const form = within(await fields(canvasElement));

    await expect(
      form.getByText(
        "Reading the document. The fields show here when the reading finishes."
      )
    ).toBeVisible();
    await expect(canvasElement.querySelector("[data-field]")).toBeNull();
    await expect(
      form.getByText("Wait for the reading to finish.")
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();

    const type = form.getByRole("combobox", { name: "Type" });

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

    // T6.2: the poll answers the read invoice; the sweep plays once and the fields show.
    await waitFor(
      () => expect(canvasElement.querySelector("[data-scan]")).toBeNull(),
      PAGE_TIMEOUT
    );
    await marked(canvasElement, READ_KEYS);

    for (const key of [...READ_KEYS, "dueDate", "paymentTerms"]) {
      // oxlint-disable-next-line no-await-in-loop -- one field at a time names the one missing.
      await expect(card(canvasElement, key)).toBeVisible();
    }

    await expect(form.queryByText(/^Reading the document\./u)).toBeNull();
    await expect(
      form.getByText("Enter a due date or choose No due date to save.")
    ).toBeVisible();

    // The refetch's ?v=2 never reaches the viewer, and its PDF stays drawn.
    await expect(viewer).toHaveAttribute("data-document-url", firstLink);
    await expect(page.isConnected).toBe(true);
  },
};

let releaseSave: (() => void) | null = null;

// T7.1: a save made on this page keeps the form beside the page, read only, with the result at
// the top of the Fields region and no save bar.
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
    const region = await fields(canvasElement);

    await userEvent.type(canvas.getByLabelText("Description"), " and support");
    await userEvent.click(canvas.getByRole("radio", { name: "No due date" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveInvoice).toHaveBeenCalledTimes(1));
    await userEvent.type(canvas.getByLabelText("Description"), " late");
    releaseSave?.();

    const form = within(region);

    const result = await form.findByText(
      "Saved as invoice INV-LIVE-001.",
      {},
      PAGE_TIMEOUT
    );

    await expect(result).toBeVisible();
    await expect(
      before(result, form.getByRole("combobox", { name: "Type" }))
    ).toBe(true);
    await expect(
      form.getByRole("link", { name: "Open the invoice" })
    ).toBeVisible();
    await expect(
      canvasElement.querySelectorAll(
        "[data-field] input, [data-field] textarea, [data-field] [role=combobox]"
      )
    ).toHaveLength(0);

    const description = within(card(canvasElement, "description"));

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
      canvasElement.querySelector("[data-shell-bottom-bar]")
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Save" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();
  },
};

// T4-c (czjw.193): the form ends with what Save adds, inside the Fields region above the save
// bar; it follows the due choice and goes once saved.
export const ConsequenceAboveSave: Story = {
  globals: desktop1440,
  beforeEach: () => {
    serve(invoiceReview);
    saveInvoice.mockImplementation(async () => {
      getDocumentReview.mockResolvedValue(savedInvoiceReview);

      return ENVELOPE;
    });
  },
  play: async ({ canvas, canvasElement }) => {
    const region = await fields(canvasElement);
    const form = within(region);

    const line = await form.findByText(
      `Saves an unpaid invoice of ${SGD(500_000)}.`,
      { normalizer: (text) => text.replace(/\s/gu, " ") },
      PAGE_TIMEOUT
    );

    await expect(line).toBeVisible();
    await expect(
      before(line, canvas.getByRole("button", { name: "Save" }))
    ).toBe(true);

    await userEvent.click(canvas.getByRole("radio", { name: "No due date" }));
    await expect(line).toHaveTextContent(
      `Saves an unpaid invoice of ${SGD(500_000)} with no due date.`,
      { normalizeWhitespace: true }
    );

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Saved as invoice INV-LIVE-001.", {}, PAGE_TIMEOUT)
    ).toBeVisible();
    await expect(
      canvasElement.querySelector("[data-review-consequence]")
    ).toBeNull();
  },
};

/** The lens of the phone preview, once it is drawn. */
const lensOf = (root: HTMLElement) =>
  drawn(root, "[data-review-lens]", "The lens");

/** The vertical middle of a box. */
const middleOf = (box: DOMRect) => (box.top + box.bottom) / 2;

/** The range over one string inside `root`'s text, to measure where its characters sit. */
function textRange(root: HTMLElement, needle: string): Range | null {
  const start = (root.textContent ?? "").indexOf(needle);

  if (start < 0) return null;

  const end = start + needle.length;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let from: { readonly node: Text; readonly offset: number } | null = null;
  let to: { readonly node: Text; readonly offset: number } | null = null;
  let node: Node | null;

  while ((node = walker.nextNode()) !== null) {
    const length = node.textContent?.length ?? 0;
    const nodeEnd = consumed + length;

    if (from === null && start < nodeEnd && node instanceof Text) {
      from = { node, offset: start - consumed };
    }

    if (from !== null && end <= nodeEnd && node instanceof Text) {
      to = { node, offset: end - consumed };
      break;
    }

    consumed = nodeEnd;
  }

  if (from === null || to === null) return null;

  const range = document.createRange();

  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);

  return range;
}

/** The save bar's box: fixed to the bottom of the screen on a phone. */
function barOf(root: HTMLElement): DOMRect {
  const bar = root.querySelector("[data-shell-bottom-bar]");

  if (bar === null) throw new Error("The page has no save bar.");

  return bar.getBoundingClientRect();
}

// T6-a (czjw.187): the phone shows the lens and Open document over the one form of T1-c; the bar
// states the due reason with Delete and Save as wide as each other, and each dense control keeps
// its 40 px phone height.
export const InvoiceOnPhone: Story = {
  globals: phone390,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await marked(canvasElement, READ_KEYS);
    await expect(await lensOf(canvasElement)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open document" })
    ).toBeVisible();

    const region = await fields(canvasElement);
    const form = within(region);

    await expect(form.getByRole("combobox", { name: "Type" })).toBeVisible();
    await expect(captionsOf(region)).toEqual(SECTION_CAPTIONS);
    await expect(keysOf(region, "Needs your input")).toEqual(["dueDate"]);
    await expect(keysOf(region, "From the document")).toEqual(READ_KEYS);
    await expect(keysOf(region, "Optional")).toEqual(["paymentTerms"]);
    await expect(canvas.queryByText(/^Step \d+ of/u)).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "All fields" })
    ).toBeNull();

    await expect(
      canvas.getByText("Enter a due date or choose No due date to save.")
    ).toBeVisible();

    const remove = canvas
      .getByRole("button", { name: "Delete" })
      .getBoundingClientRect();

    const save = canvas
      .getByRole("button", { name: "Save" })
      .getBoundingClientRect();

    await expect(Math.abs(remove.width - save.width)).toBeLessThanOrEqual(1);

    const control = (selector: string) => {
      const found = region.querySelector<HTMLElement>(selector);

      if (found === null) throw new Error(`No ${selector} in the form.`);

      return found;
    };

    const heights = [
      form.getByRole("combobox", { name: "Type" }),
      form.getByRole("combobox", { name: "Customer" }),
      form.getByLabelText("Invoice number"),
      control('[data-field="date"] [data-slot="input-group"]'),
      control('[data-field="amount"] [data-slot="input-group"]'),
      form.getByLabelText("Payment terms"),
      ...region.querySelectorAll<HTMLElement>('button[aria-label^="Show "]'),
    ].map((element) => Math.round(element.getBoundingClientRect().height));

    await expect(heights).toEqual([
      40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40,
    ]);

    // C16-9: Open document sits below the lens, clear of the page's text.
    const lens = await lensOf(canvasElement);
    const openDocument = canvas.getByRole("button", { name: "Open document" });

    await expect(
      openDocument.getBoundingClientRect().top
    ).toBeGreaterThanOrEqual(lens.getBoundingClientRect().bottom - 1);
  },
};

// T6-b, C16-1 (czjw.187): a locate press on a phone brings the field's line to the middle of the
// lens, and the lens itself into view, though it sat above the screen.
export const LocateOnPhone: Story = {
  globals: phone390,
  decorators: [
    (Story) => (
      <div className="pb-240">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await marked(canvasElement, READ_KEYS);

    const lens = await lensOf(canvasElement);

    const locate = canvas.getByRole("button", {
      name: "Show Total on the document",
    });

    // The Total field starts at the screen's top, so the lens above it leaves the screen.
    locate.scrollIntoView({ block: "start" });
    await expect(lens.getBoundingClientRect().bottom).toBeLessThanOrEqual(0);

    await userEvent.click(locate);

    await waitFor(() => {
      const spot = lens.querySelector("[data-lens-spot]");

      if (spot === null) throw new Error("The lens has no spot.");

      const offset =
        middleOf(spot.getBoundingClientRect()) -
        middleOf(lens.getBoundingClientRect());

      if (Math.abs(offset) > 4)
        throw new Error(`The spot is ${offset} px from the lens's middle.`);

      // C16-1: the lens and its spot are on the screen, not scrolled off above it.
      const box = spot.getBoundingClientRect();

      if (box.top < 0 || box.bottom > window.innerHeight)
        throw new Error("The spot is out of the viewport.");
    }, PAGE_TIMEOUT);
  },
};

// T6-c (czjw.187): Open document fills the screen in a dialog, not the Fullscreen API that an
// iPhone lacks, with the document's toolbar and page; Close returns the focus to Open document.
export const OpenDocumentOnPhone: Story = {
  globals: phone390,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await marked(canvasElement, READ_KEYS);

    const open = canvas.getByRole("button", { name: "Open document" });

    await userEvent.click(open);

    const dialog = await screen.findByRole("dialog");

    await waitFor(() => {
      const box = dialog.getBoundingClientRect();

      expect(Math.abs(box.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - window.innerWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.height - window.innerHeight)).toBeLessThanOrEqual(1);
    });
    // The dialog fades in, so its toolbar shows once the fade ends.
    await waitFor(() =>
      expect(
        within(dialog).getByRole("toolbar", { name: "Document" })
      ).toBeVisible()
    );
    await drawn(dialog, "[data-document-viewer] canvas", "The page");

    const toolbar = within(dialog).getByRole("toolbar", { name: "Document" });
    const buttons = within(toolbar).getAllByRole("button");

    // C16-4: every toolbar button takes the 40 px dense box on a phone.
    for (const button of buttons) {
      // oxlint-disable-next-line no-await-in-loop -- one button names the one that is wrong.
      await expect(Math.round(button.getBoundingClientRect().height)).toBe(
        controlHeightsPx.dense.phone
      );
    }

    // C16-4: no button's 44 px touch area reaches its neighbor's box.
    for (let index = 1; index < buttons.length; index += 1) {
      const prev = buttons[index - 1];
      const next = buttons[index];

      if (prev === undefined || next === undefined) continue;

      const gap =
        next.getBoundingClientRect().left - prev.getBoundingClientRect().right;

      const prevHeight = prev.getBoundingClientRect().height;
      const nextHeight = next.getBoundingClientRect().height;

      // oxlint-disable-next-line no-await-in-loop -- one pair names the one that overlaps.
      await expect(gap).toBeGreaterThanOrEqual((touchAreaPx - prevHeight) / 2);
      // oxlint-disable-next-line no-await-in-loop -- one pair names the one that overlaps.
      await expect(gap).toBeGreaterThanOrEqual((touchAreaPx - nextHeight) / 2);
    }

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close the document" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(open).toHaveFocus());
  },
};

// T6-d (czjw.187): a blocked Save reveals the due choice above the fixed bar, not under it. The
// spacer puts the field below the screen, so the reveal scrolls it up to the bar.
export const RevealAboveTheBarOnPhone: Story = {
  globals: phone390,
  decorators: [
    (Story) => (
      <div className="pt-240">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await fields(canvasElement);
    window.scrollTo(0, 0);

    const enter = canvas.getByRole("radio", { name: "Enter a due date" });

    await expect(enter.getBoundingClientRect().top).toBeGreaterThan(
      window.innerHeight
    );

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(enter).toHaveFocus();
    await expect(enter.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      barOf(canvasElement).top
    );
    await expect(saveInvoice).not.toHaveBeenCalled();
  },
};

// While the job reads, the lens says so, the form waits with its note and has no Delete; when
// the reading lands, the fields show under the same page, which loads once.
export const ReadingOnPhone: Story = {
  globals: phone390,
  args: { view: readingReview },
  beforeEach: serveReadingThenRead,
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByText("Reading the page", {}, PAGE_TIMEOUT)
    ).toBeVisible();

    const form = within(await fields(canvasElement));

    await expect(
      form.getByText(
        "Reading the document. The fields show here when the reading finishes."
      )
    ).toBeVisible();
    await expect(canvasElement.querySelector("[data-field]")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();

    const viewer = await drawn(
      canvasElement,
      "[data-document-viewer]",
      "The viewer"
    );

    const page = await drawn(viewer, "canvas", "The document");

    await marked(canvasElement, READ_KEYS);
    await expect(card(canvasElement, "dueDate")).toBeVisible();
    await expect(canvas.queryByText("Reading the page")).toBeNull();
    await expect(page.isConnected).toBe(true);
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
    const region = await fields(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(/^Payment saved: .* allocated/u, {}, PAGE_TIMEOUT)
    ).toBeVisible();
    await expect(region.querySelector("[data-review-split]")).toBeNull();
    await waitFor(() =>
      expect(within(region).queryByText(/^Linked /u)).toBeNull()
    );
  },
};

// A save on a phone shows the result and the fields read only, with no bottom bar.
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
    await fields(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "No due date" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

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
    await expect(
      within(card(canvasElement, "dueDate")).getByText("No due date")
    ).toBeVisible();
    await expect(
      canvasElement.querySelectorAll(
        "[data-field] input, [data-field] textarea, [data-field] [role=combobox]"
      )
    ).toHaveLength(0);
    await expect(
      canvasElement.querySelector("[data-shell-bottom-bar]")
    ).toBeNull();
  },
};

// An edit on a phone shows the read value with Undo.
export const EditedOnPhone: Story = {
  globals: phone390,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await fields(canvasElement);

    const row = within(card(canvasElement, "description"));

    await userEvent.type(canvas.getByLabelText("Description"), " and support");
    await expect(
      row.getByText("Read as “Additional consulting project - October 2026”")
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: "Undo Description" })
    ).toBeVisible();
  },
};

// A field whose quote failed, at 390 for axe: it needs input, with Check this.
export const NoQuoteOnPhone: Story = {
  globals: phone390,
  args: { view: noQuoteInvoiceReview },
  beforeEach: () => serve(noQuoteInvoiceReview),
  play: async ({ canvasElement }) => {
    const region = await fields(canvasElement);

    await expect(keysOf(region, "Needs your input")).toContain("date");
    await expect(
      within(card(canvasElement, "date")).getByText("Check this")
    ).toBeVisible();
  },
};

// The split follows the fields on a phone, and a refused allocation is named and focused by Save,
// above the fixed bar, also when it is the lowest row of the split. The padding stands in for the
// shell's room under the page.
export const PaymentSplitOnPhone: Story = {
  globals: phone390,
  decorators: [
    (Story) => (
      <div className="pb-32">
        <Story />
      </div>
    ),
  ],
  args: { view: splitPaymentReview },
  beforeEach: () => serve(splitPaymentReview),
  play: async ({ canvas, canvasElement }) => {
    const region = await fields(canvasElement);

    if (region.querySelector("[data-review-split]") === null)
      throw new Error("The form has no split.");

    // The last row of Other open invoices, given 0.00, is the lowest control of the split.
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Other open invoices of Orchid Retail",
      })
    );

    const oct = canvas.getByLabelText("Amount for INV-2026-10-04");

    await userEvent.type(oct, "0.00");
    window.scrollTo(0, 0);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(oct).toHaveFocus();
    await expect(oct.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      barOf(canvasElement).top
    );
    await expect(savePayment).not.toHaveBeenCalled();
  },
};

// B1: beside the docked panel at 1440 px the page column is 736 px; the page and the Fields
// region sit side by side, neither covering the other.
export const BesideTheDockedPanel: Story = {
  decorators: [
    (Story) => (
      <div className="w-184">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvasElement }) => {
    await marked(canvasElement, READ_KEYS);

    const region = (await fields(canvasElement)).getBoundingClientRect();

    const page = (
      await drawn(canvasElement, "[data-document-viewer]", "The viewer")
    ).getBoundingClientRect();

    await expect(page.width).toBeGreaterThan(0);
    await expect(region.width).toBeGreaterThan(0);
    await expect(page.right).toBeLessThanOrEqual(region.left + 1);
  },
};

// T6-e: beside the docked panel at 1280 px the page column is 576 px, so the form stacks under the
// lens.
export const StackedBesideTheDockedPanel: Story = {
  decorators: [
    (Story) => (
      <div className="w-144">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    const lens = (await lensOf(canvasElement)).getBoundingClientRect();
    const region = (await fields(canvasElement)).getBoundingClientRect();

    await expect(lens.bottom).toBeLessThanOrEqual(region.top + 1);
    await expect(canvas.queryByText(/^Step \d+ of/u)).toBeNull();
  },
};

// T3-b (czjw.186): every review field takes the dense height, 32 px from lg.
export const DenseFields: Story = {
  globals: desktop1440,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    await marked(canvasElement, READ_KEYS);

    const region = await fields(canvasElement);

    const control = (selector: string) => {
      const found = region.querySelector<HTMLElement>(selector);

      if (found === null) throw new Error(`No ${selector} in the form.`);

      return found;
    };

    const heights = [
      canvas.getByRole("combobox", { name: "Type" }),
      canvas.getByRole("combobox", { name: "Customer" }),
      canvas.getByLabelText("Invoice number"),
      control('[data-field="date"] [data-slot="input-group"]'),
      control('[data-field="amount"] [data-slot="input-group"]'),
      canvas.getByLabelText("Payment terms"),
      ...region.querySelectorAll<HTMLElement>('button[aria-label^="Show "]'),
    ].map((element) => Math.round(element.getBoundingClientRect().height));

    await expect(heights).toEqual([
      32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
    ]);

    // C16-7: the due choice's label text reads at the dense field size, beside the fields.
    const dueText = canvas
      .getByRole("radio", { name: "Enter a due date" })
      .closest("label")
      ?.querySelector("span");

    if (dueText === null || dueText === undefined)
      throw new Error("The due choice has no label text.");

    await expect(getComputedStyle(dueText).fontSize).toBe(
      getComputedStyle(canvas.getByLabelText("Invoice number")).fontSize
    );
  },
};

/** The czjw.186 spacing: the form's padding, the 16 px beside the page, one top line, the gutter. */
async function expectPageSpacing(canvasElement: HTMLElement) {
  const scroll = await drawn(
    canvasElement,
    "[data-review-scroll]",
    "The form's scroll area"
  );

  const region = await fields(canvasElement);

  const page = canvasElement
    .querySelector("[data-desk-content]")
    ?.parentElement?.getBoundingClientRect();

  const main = canvasElement.querySelector("main")?.getBoundingClientRect();

  if (page === undefined || main === undefined)
    throw new Error("The desk has no page or main box.");

  const style = getComputedStyle(scroll);

  await expect(style.paddingLeft).toBe("24px");
  await expect(style.paddingRight).toBe("24px");
  await expect(style.paddingTop).toBe("20px");

  const form = region.getBoundingClientRect();

  await expect(Math.round(form.left - page.right)).toBe(16);
  await expect(Math.abs(form.top - page.top)).toBeLessThanOrEqual(1);
  await expect(Math.abs(form.right - main.right)).toBeLessThanOrEqual(1);
}

// T3-d (czjw.186): the form column's padding, the gap to the page, one top line and the gutter.
export const SpacingBesideTheDocument: Story = {
  globals: desktop1440,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvasElement }) => expectPageSpacing(canvasElement),
};

// T3-d (czjw.186): the same at 1280, where the page is 976 px beside the 240 px menu.
export const SpacingAt1280: Story = {
  decorators: [
    (Story) => (
      <div className="w-244">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvasElement }) => expectPageSpacing(canvasElement),
};
