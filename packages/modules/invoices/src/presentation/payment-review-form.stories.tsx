import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  duplicatePaymentReview,
  meridianOpenInvoices,
  noMatchPaymentReview,
  overpaymentPaymentReview,
  splitPaymentReview,
  suggestionsPaymentReview,
} from "./__fixtures__/review.ts";
import { DocumentReview } from "./document-review.tsx";
import { formatMoney } from "./format.ts";
import type { DocumentReviewView } from "./views.ts";

const getDocumentReview = fn();

const savePayment = fn();

const listOpenInvoices = fn();

const discardDocument = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const AUG = "30000000-0000-4000-8000-000000000804";

const SEP = "30000000-0000-4000-8000-000000000904";

const OCT = "30000000-0000-4000-8000-000000001004";

const MERIDIAN = "20000000-0000-4000-8000-000000000002";

// Testing Library normalizes the page's no-break space to a space, but not the expected text.
const SGD = (cents: number) => formatMoney(cents, "SGD").replace(/\s/gu, " ");

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
            savePayment,
            listOpenInvoices,
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
  title: "Modules/Invoices/Payment review form",
  component: DocumentReview,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The payment review of `/m/invoices/documents/<id>` (Spec 7 R-30, R-31, R-33, decisions 5 and 12). A writer checks the payment's fields and the links that the proposal starts with, over the open invoices of its customer, then saves. The save sends only the links the person kept checked; it never links by itself.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  args: { view: splitPaymentReview },
} satisfies Meta<typeof DocumentReview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The procedures' answers, reset for one story. */
function serve(view: DocumentReviewView) {
  getDocumentReview.mockReset().mockResolvedValue(view);
  savePayment.mockReset().mockResolvedValue({
    outcome: "saved",
    paymentId: "40000000-0000-4000-8000-000000000003",
    customerId: view.customerMatch?.id ?? MERIDIAN,
    allocations: [],
  });
  listOpenInvoices
    .mockReset()
    .mockResolvedValue({ rows: meridianOpenInvoices, truncated: false });
  discardDocument
    .mockReset()
    .mockResolvedValue({ documentId: view.document.id });
}

/** One field row by its key, for a tag inside it. */
function fieldRow(canvasElement: HTMLElement, field: string) {
  const row = canvasElement.querySelector(`[data-field="${field}"]`);

  if (!(row instanceof HTMLElement))
    throw new Error(`The review has no ${field} row.`);

  return within(row);
}

type Canvas = ReturnType<typeof within>;

const linkBox = (canvas: Canvas, number: string) =>
  canvas.getByRole("checkbox", { name: `Link to ${number}` });

const amountFor = (canvas: Canvas, number: string) =>
  canvas.getByLabelText(`Amount for ${number}`);

// B6.2: the split starts with both links, and saves them in cents only when the person presses Save.
export const Split: Story = {
  globals: desktop,
  beforeEach: () => serve(splitPaymentReview),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Confirm the split")).toBeVisible();
    await expect(linkBox(canvas, "INV-2026-08-04")).toBeChecked();
    await expect(linkBox(canvas, "INV-2026-09-04")).toBeChecked();
    await expect(linkBox(canvas, "INV-2026-10-04")).not.toBeChecked();
    await expect(amountFor(canvas, "INV-2026-08-04")).toHaveValue("4,050.00");
    await expect(amountFor(canvas, "INV-2026-09-04")).toHaveValue("4,200.00");
    await expect(
      canvas.getByText(`Linked ${SGD(825000)}. Unallocated ${SGD(0)}.`)
    ).toBeVisible();
    await expect(savePayment).not.toHaveBeenCalled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Save the payment" })
    );

    await waitFor(() => expect(savePayment).toHaveBeenCalledTimes(1));
    await expect(savePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 825000,
        allocations: [
          { invoiceId: AUG, amountCents: 405000 },
          { invoiceId: SEP, amountCents: 420000 },
        ],
        namedInvoiceNumbers: ["INV-2026-08-04", "INV-2026-09-04"],
        keepPossibleDuplicate: false,
      })
    );
  },
};

// B6.3: nothing links until the person checks the suggestion, which fills the full amount.
export const Suggestions: Story = {
  args: { view: suggestionsPaymentReview },
  globals: desktop,
  beforeEach: () => serve(suggestionsPaymentReview),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Possible matches")).toBeVisible();

    await expect(canvas.queryAllByRole("checkbox", { checked: true })).toEqual(
      []
    );

    await expect(
      canvas.getByRole("button", { name: "Save as unallocated" })
    ).toBeVisible();

    const suggested = canvas.getByText("Same amount").closest("li");

    if (!(suggested instanceof HTMLElement))
      throw new Error("The suggestion has no row.");

    await userEvent.click(
      within(suggested).getByRole("checkbox", {
        name: "Link to INV-2026-10-04",
      })
    );
    await expect(amountFor(canvas, "INV-2026-10-04")).toHaveValue("4,350.00");

    await userEvent.click(
      canvas.getByRole("button", { name: "Save the payment" })
    );

    await waitFor(() =>
      expect(savePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          allocations: [{ invoiceId: OCT, amountCents: 435000 }],
        })
      )
    );
  },
};

// B6.4: the named invoice starts with its open amount, and the rest shows as unallocated.
export const Overpayment: Story = {
  args: { view: overpaymentPaymentReview },
  globals: desktop,
  beforeEach: () => serve(overpaymentPaymentReview),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        `${SGD(405000)} goes to INV-2026-08-04, and ${SGD(420000)} stays unallocated.`
      )
    ).toBeVisible();
    await expect(linkBox(canvas, "INV-2026-08-04")).toBeChecked();
    await expect(linkBox(canvas, "INV-2026-09-04")).not.toBeChecked();
    await expect(amountFor(canvas, "INV-2026-08-04")).toHaveValue("4,050.00");
    await expect(
      canvas.getByText(`Linked ${SGD(405000)}. Unallocated ${SGD(420000)}.`)
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Save the payment" })
    );

    await waitFor(() =>
      expect(savePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 825000,
          allocations: [{ invoiceId: AUG, amountCents: 405000 }],
        })
      )
    );
  },
};

// B6.5: no link and Save as unallocated; a changed amount is corrected and saves with no allocation.
export const NoMatch: Story = {
  name: "No match",
  args: { view: noMatchPaymentReview },
  globals: desktop,
  beforeEach: () => serve(noMatchPaymentReview),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("No matching invoice")).toBeVisible();
    await expect(linkBox(canvas, "INV-2026-10-06")).not.toBeChecked();

    const amount = canvas.getByLabelText("Amount");

    await userEvent.clear(amount);
    await userEvent.type(amount, "2200.00");
    await expect(
      fieldRow(canvasElement, "amount").getByText("Corrected by you")
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Save as unallocated" })
    );

    await waitFor(() =>
      expect(savePayment).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 220000, allocations: [] })
      )
    );
  },
};

// B6.6: another customer asks for its open invoices, and the old customer's links are not sent.
export const CustomerChange: Story = {
  name: "Customer change",
  globals: desktop,
  beforeEach: () => serve(splitPaymentReview),
  play: async ({ canvas }) => {
    await expect(linkBox(canvas, "INV-2026-08-04")).toBeChecked();

    const customer = canvas.getByRole("combobox", { name: "Customer" });

    await userEvent.clear(customer);
    await userEvent.type(customer, "Meridian");
    await userEvent.click(
      await screen.findByRole("option", { name: "MERIDIAN LABS" })
    );

    await waitFor(() =>
      expect(listOpenInvoices).toHaveBeenCalledWith({
        customerId: MERIDIAN,
        currency: "SGD",
      })
    );
    await expect(
      await canvas.findByRole("checkbox", { name: "Link to INV-2026-10-06" })
    ).not.toBeChecked();
    await expect(
      canvas.queryByRole("checkbox", { name: "Link to INV-2026-08-04" })
    ).toBeNull();

    // Either label: the payload below, not the label, proves which links are sent.
    await userEvent.click(
      canvas.getByRole("button", {
        name: /^Save (the payment|as unallocated)$/u,
      })
    );

    await waitFor(() =>
      expect(savePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: { id: MERIDIAN },
          allocations: [],
        })
      )
    );
  },
};

/** Upload 05 with 21 open invoices of SGD 100.00, one more than a save links. */
const manyOpenReview: DocumentReviewView = {
  ...noMatchPaymentReview,
  payment: {
    openInvoices: Array.from({ length: 21 }, (_, index) => ({
      invoiceId: `30000000-0000-4000-8000-${String(2000 + index).padStart(12, "0")}`,
      number: `INV-MANY-${String(index + 1).padStart(2, "0")}`,
      invoiceDate: "2026-10-06",
      dueDate: "2026-11-05",
      currency: "SGD",
      openCents: 10000,
    })),
    proposal: { kind: "no-match" },
    possibleDuplicateOf: null,
  },
};

// BF.1: more than 20 checked links keeps Save blocked and says why, so Save never does nothing.
export const TooManyLinks: Story = {
  name: "Too many links",
  args: { view: manyOpenReview },
  globals: desktop,
  beforeEach: () => serve(manyOpenReview),
  play: async ({ canvas }) => {
    for (const box of canvas.getAllByRole("checkbox", {
      name: /^Link to INV-MANY-/u,
    })) {
      // oxlint-disable-next-line no-await-in-loop -- each check fills its amount from the rest.
      await userEvent.click(box);
    }

    const save = canvas.getByRole("button", { name: "Save the payment" });

    await expect(
      canvas.getByText("Link at most 20 invoices in one save.")
    ).toBeVisible();
    await expect(save).toHaveAttribute("aria-disabled", "true");
  },
};

// Fix round 1: open invoices that fail to load are never shown as none, and the save waits.
export const OpenInvoicesFailed: Story = {
  name: "Open invoices failed",
  globals: desktop,
  beforeEach: () => {
    serve(splitPaymentReview);
    listOpenInvoices.mockRejectedValue(
      new Error("The service is unavailable.")
    );
  },
  play: async ({ canvas }) => {
    const customer = canvas.getByRole("combobox", { name: "Customer" });

    await userEvent.clear(customer);
    await userEvent.type(customer, "Meridian");
    await userEvent.click(
      await screen.findByRole("option", { name: "MERIDIAN LABS" })
    );
    await waitFor(() => expect(listOpenInvoices).toHaveBeenCalled());

    const save = canvas.getByRole("button", { name: "Save as unallocated" });

    await waitFor(() => expect(save).toHaveAttribute("aria-disabled", "true"));
    await expect(
      canvas.queryByText("This customer has no open invoice in this currency.")
    ).toBeNull();
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The open invoices were not loaded. The service is unavailable."
    );

    await userEvent.click(save);
    await expect(savePayment).not.toHaveBeenCalled();
  },
};

// B6.7: the duplicate notice shows when the review opens, and Keep and save sends the keep choice.
export const PossibleDuplicate: Story = {
  name: "Possible duplicate",
  args: { view: duplicatePaymentReview },
  globals: desktop,
  beforeEach: () => serve(duplicatePaymentReview),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("A record with the same key facts is saved already.")
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      "/m/invoices/payments/40000000-0000-4000-8000-000000000005"
    );
    await expect(savePayment).not.toHaveBeenCalled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Keep and save" })
    );

    await waitFor(() =>
      expect(savePayment).toHaveBeenCalledWith(
        expect.objectContaining({ keepPossibleDuplicate: true })
      )
    );
  },
};

// Every story at the phone width too, so axe checks each at 390 x 844.
export const SplitOnPhone: Story = {
  ...Split,
  name: "Split on a phone",
  globals: phone,
};

export const SuggestionsOnPhone: Story = {
  ...Suggestions,
  name: "Suggestions on a phone",
  globals: phone,
};

export const OverpaymentOnPhone: Story = {
  ...Overpayment,
  name: "Overpayment on a phone",
  globals: phone,
};

export const NoMatchOnPhone: Story = {
  ...NoMatch,
  name: "No match on a phone",
  globals: phone,
};

export const CustomerChangeOnPhone: Story = {
  ...CustomerChange,
  name: "Customer change on a phone",
  globals: phone,
};

export const OpenInvoicesFailedOnPhone: Story = {
  ...OpenInvoicesFailed,
  name: "Open invoices failed on a phone",
  globals: phone,
};

export const PossibleDuplicateOnPhone: Story = {
  ...PossibleDuplicate,
  name: "Possible duplicate on a phone",
  globals: phone,
};

export const TooManyLinksOnPhone: Story = {
  ...TooManyLinks,
  name: "Too many links on a phone",
  globals: phone,
};
