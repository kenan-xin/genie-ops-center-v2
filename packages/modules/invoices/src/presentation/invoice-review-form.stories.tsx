import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  dueDateReadReview,
  invoiceReview,
  linkedAutomaticallyReview,
  newCustomerReview,
  receiptReview,
  savedInvoiceReview,
} from "./__fixtures__/review.ts";
import { DocumentReview } from "./document-review.tsx";
import type { DocumentReviewView } from "./views.ts";

const getDocumentReview = fn();

const saveInvoice = fn();

const savePaidReceipt = fn();

const unlinkAllocation = fn();

const discardDocument = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const DEVICE_ENVELOPE = {
  invoiceId: "30000000-0000-4000-8000-000000000001",
  customerId: "20000000-0000-4000-8000-000000000001",
  linkedPayments: [],
};

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
            unlinkAllocation,
            discardDocument,
          },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Invoices/Invoice review form",
  component: DocumentReview,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The invoice and paid-receipt review of `/m/invoices/documents/<id>` (Spec 7 R-28, R-29, R-32, R-33, R-38, decisions 8, 9 and 12). A writer saves the document as an unpaid invoice or a paid receipt; a saved document shows its records and Undo for an automatic link. Each field shows the mark its save will store.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { view: invoiceReview },
} satisfies Meta<typeof DocumentReview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The procedures' answers, reset for one story. */
function serve(view: DocumentReviewView) {
  getDocumentReview.mockReset().mockResolvedValue(view);
  saveInvoice
    .mockReset()
    .mockResolvedValue({ outcome: "saved", ...DEVICE_ENVELOPE });
  savePaidReceipt.mockReset().mockResolvedValue({
    outcome: "saved",
    ...DEVICE_ENVELOPE,
    paymentId: "40000000-0000-4000-8000-000000000001",
    allocationId: "50000000-0000-4000-8000-000000000001",
  });
  unlinkAllocation.mockReset().mockResolvedValue({ unlinkedCents: 300000 });
  discardDocument
    .mockReset()
    .mockResolvedValue({ documentId: view.document.id });
}

/** One field row by its key, for a tag or value inside it. */
function fieldRow(canvasElement: HTMLElement, field: string) {
  const row = canvasElement.querySelector(`[data-field="${field}"]`);

  if (!(row instanceof HTMLElement))
    throw new Error(`The review has no ${field} row.`);

  return within(row);
}

/** The form's save button, by its invoice or receipt words. */
function saveButton(canvas: ReturnType<typeof within>, name: string) {
  return canvas.getByRole("button", { name });
}

// B5.1: no due-date decision keeps Save disabled with its reason; a date or unspecified enables it.
export const MissingDueDate: Story = {
  globals: desktop,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas }) => {
    const save = saveButton(canvas, "Save as unpaid");

    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(
      canvas.getByText("Choose a due date or mark it unspecified to save.")
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("radio", { name: "Enter a due date" })
    );
    await expect(save).toHaveAttribute("aria-disabled", "true");

    await userEvent.type(canvas.getByLabelText("Due date"), "2026-11-25");
    await expect(save).not.toHaveAttribute("aria-disabled", "true");

    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await expect(save).not.toHaveAttribute("aria-disabled", "true");
  },
};

// B5.2 run 1: a typed due date saves source person.
export const DueDateSources: Story = {
  name: "Due date sources: typed",
  globals: desktop,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: "Enter a due date" })
    );
    await userEvent.type(canvas.getByLabelText("Due date"), "2026-11-25");
    await userEvent.click(saveButton(canvas, "Save as unpaid"));

    await waitFor(() =>
      expect(saveInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: "2026-11-25",
          dueDateSource: "person",
        })
      )
    );
  },
};

// B5.2 run 2: unspecified saves no date and its source.
export const DueDateSourcesUnspecified: Story = {
  name: "Due date sources: unspecified",
  globals: desktop,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await userEvent.click(saveButton(canvas, "Save as unpaid"));

    await waitFor(() =>
      expect(saveInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: null,
          dueDateSource: "unspecified",
        })
      )
    );
  },
};

// B5.2 run 3: a read due date kept saves source document.
export const DueDateSourcesKept: Story = {
  name: "Due date sources: kept",
  args: { view: dueDateReadReview },
  globals: desktop,
  beforeEach: () => serve(dueDateReadReview),
  play: async ({ canvas }) => {
    await userEvent.click(saveButton(canvas, "Save as unpaid"));

    await waitFor(() =>
      expect(saveInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: "2026-11-30",
          dueDateSource: "document",
        })
      )
    );
  },
};

// B5.3: a changed total is corrected, the read value typed back is extracted, a typed due date is entered.
export const Tags: Story = {
  globals: desktop,
  beforeEach: () => serve(invoiceReview),
  play: async ({ canvas, canvasElement }) => {
    const total = canvas.getByLabelText("Total");

    await userEvent.clear(total);
    await userEvent.type(total, "4000.00");
    await expect(
      fieldRow(canvasElement, "amount").getByText("Corrected by you")
    ).toBeVisible();

    await userEvent.clear(total);
    await userEvent.type(total, "5000");
    await expect(
      fieldRow(canvasElement, "amount").getByText("Extracted")
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("radio", { name: "Enter a due date" })
    );
    await userEvent.type(canvas.getByLabelText("Due date"), "2026-11-25");
    await expect(
      fieldRow(canvasElement, "dueDate").getByText("Entered by you")
    ).toBeVisible();
  },
};

// B5.4: an unknown customer waits for its confirmation, and a picked customer saves by id.
export const NewCustomer: Story = {
  name: "New customer",
  args: { view: newCustomerReview },
  globals: desktop,
  beforeEach: () => serve(newCustomerReview),
  play: async ({ canvas }) => {
    const create = canvas.getByRole("checkbox", {
      name: "Create Meridian Labs Pte as a new customer",
    });

    await expect(create).toBeVisible();

    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await expect(
      canvas.getByText("Confirm the new customer to save.")
    ).toBeVisible();
    await expect(saveButton(canvas, "Save as unpaid")).toHaveAttribute(
      "aria-disabled",
      "true"
    );

    await userEvent.click(create);
    await expect(
      canvas.queryByText("Confirm the new customer to save.")
    ).toBeNull();
    await userEvent.click(saveButton(canvas, "Save as unpaid"));

    await waitFor(() =>
      expect(saveInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: { name: "Meridian Labs Pte", email: null, confirmed: true },
        })
      )
    );

    const customer = canvas.getByRole("combobox", { name: "Customer" });

    await userEvent.clear(customer);
    await userEvent.type(customer, "ABC");
    await userEvent.click(
      await screen.findByRole("option", { name: "ABC Trading" })
    );
    await userEvent.click(saveButton(canvas, "Save as unpaid"));

    await waitFor(() =>
      expect(saveInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          customer: { id: "20000000-0000-4000-8000-000000000001" },
        })
      )
    );
  },
};

// B5.5: Possible duplicate offers the stored record and keeps or saves again.
export const PossibleDuplicate: Story = {
  name: "Possible duplicate",
  globals: desktop,
  beforeEach: () => {
    serve(invoiceReview);
    saveInvoice.mockResolvedValue({
      outcome: "possible-duplicate",
      duplicateOf: "30000000-0000-4000-8000-000000000009",
    });
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await userEvent.click(saveButton(canvas, "Save as unpaid"));

    await expect(
      await canvas.findByText(
        "A record with the same key facts is saved already."
      )
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      "/m/invoices/invoices/30000000-0000-4000-8000-000000000009"
    );

    await userEvent.click(saveButton(canvas, "Keep and save"));

    await waitFor(() =>
      expect(saveInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({ keepPossibleDuplicate: true })
      )
    );
  },
};

// B5.6: a refused save keeps the typed values, one alert line, and reads the document again.
export const SaveRefused: Story = {
  name: "Save refused",
  globals: desktop,
  beforeEach: () => {
    serve(invoiceReview);
    saveInvoice.mockRejectedValue(
      new Error("A record from that document is already saved.")
    );
  },
  play: async ({ canvas }) => {
    const total = canvas.getByLabelText("Total");

    await userEvent.clear(total);
    await userEvent.type(total, "4000.00");
    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );

    const reads = getDocumentReview.mock.calls.length;

    await userEvent.click(saveButton(canvas, "Save as unpaid"));

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "01_Invoice_Missing_Due_Date.pdf was not saved. A record from that document is already saved."
    );
    await expect(total).toHaveValue("4000.00");
    await waitFor(() =>
      expect(getDocumentReview.mock.calls.length).toBeGreaterThan(reads)
    );
  },
};

// B5.7: Save as paid calls savePaidReceipt with the receipt's number, date, cents, reference and method.
export const Receipt: Story = {
  args: { view: receiptReview },
  globals: desktop,
  beforeEach: () => serve(receiptReview),
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: "Mark as unspecified" })
    );
    await userEvent.click(saveButton(canvas, "Save as paid"));

    await waitFor(() =>
      expect(savePaidReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          number: "RCPT-LIVE-001",
          date: "2026-10-27",
          totalCents: 180000,
          reference: "LD-PURCHASE-1800",
          method: "Card",
          dueDate: null,
          dueDateSource: "unspecified",
        })
      )
    );
  },
};

// B5.8 run 1: Undo unlinks the automatic link and reads the document again.
export const SavedWithAutomaticLink: Story = {
  name: "Saved with an automatic link",
  args: { view: savedInvoiceReview },
  globals: desktop,
  beforeEach: () => serve(savedInvoiceReview),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Saved as invoice INV-LIVE-001.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open the invoice" })
    ).toHaveAttribute(
      "href",
      "/m/invoices/invoices/30000000-0000-4000-8000-000000000001"
    );

    const reads = getDocumentReview.mock.calls.length;

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Undo the link of HF-SEP-FINAL-PART to INV-LIVE-001",
      })
    );

    await waitFor(() =>
      expect(unlinkAllocation).toHaveBeenCalledWith({
        id: "50000000-0000-4000-8000-000000000001",
      })
    );
    await expect(
      await canvas.findByText(
        "Link removed. SGD 3,000.00 is unallocated on HF-SEP-FINAL-PART."
      )
    ).toBeVisible();
    await waitFor(() =>
      expect(getDocumentReview.mock.calls.length).toBeGreaterThan(reads)
    );
  },
};

// B5.8 run 2: a saved payment shows Undo for its automatic link too.
export const LinkedAutomatically: Story = {
  name: "Linked automatically",
  args: { view: linkedAutomaticallyReview },
  globals: desktop,
  beforeEach: () => serve(linkedAutomaticallyReview),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", {
        name: "Undo the link of HF-SEP-FINAL-PART to INV-2026-09-03",
      })
    ).toBeVisible();
  },
};

/** The saved invoice as a reader without write sees it. */
const readOnlySavedInvoice: DocumentReviewView = {
  ...savedInvoiceReview,
  canWrite: false,
};

// Fix round 1 item 2: a reader without write sees the saved record but no Undo.
export const SavedReadOnly: Story = {
  name: "Saved read only",
  args: { view: readOnlySavedInvoice },
  globals: desktop,
  beforeEach: () => serve(readOnlySavedInvoice),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Saved as invoice INV-LIVE-001.")
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", {
        name: "Undo the link of HF-SEP-FINAL-PART to INV-LIVE-001",
      })
    ).toBeNull();
  },
};

// Every form state at the phone width too, so axe checks each at 390 x 844.
export const MissingDueDateOnPhone: Story = {
  ...MissingDueDate,
  name: "Missing due date on a phone",
  globals: phone,
};

export const DueDateSourcesOnPhone: Story = {
  ...DueDateSources,
  name: "Due date sources: typed on a phone",
  globals: phone,
};

export const DueDateSourcesUnspecifiedOnPhone: Story = {
  ...DueDateSourcesUnspecified,
  name: "Due date sources: unspecified on a phone",
  globals: phone,
};

export const DueDateSourcesKeptOnPhone: Story = {
  ...DueDateSourcesKept,
  name: "Due date sources: kept on a phone",
  globals: phone,
};

export const TagsOnPhone: Story = {
  ...Tags,
  name: "Tags on a phone",
  globals: phone,
};

export const NewCustomerOnPhone: Story = {
  ...NewCustomer,
  name: "New customer on a phone",
  globals: phone,
};

export const PossibleDuplicateOnPhone: Story = {
  ...PossibleDuplicate,
  name: "Possible duplicate on a phone",
  globals: phone,
};

export const SaveRefusedOnPhone: Story = {
  ...SaveRefused,
  name: "Save refused on a phone",
  globals: phone,
};

export const ReceiptOnPhone: Story = {
  ...Receipt,
  name: "Receipt on a phone",
  globals: phone,
};

export const SavedWithAutomaticLinkOnPhone: Story = {
  ...SavedWithAutomaticLink,
  name: "Saved with an automatic link on a phone",
  globals: phone,
};

export const LinkedAutomaticallyOnPhone: Story = {
  ...LinkedAutomatically,
  name: "Linked automatically on a phone",
  globals: phone,
};

export const SavedReadOnlyOnPhone: Story = {
  ...SavedReadOnly,
  name: "Saved read only on a phone",
  globals: phone,
};
