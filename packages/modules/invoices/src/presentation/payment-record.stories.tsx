import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  bundlePaymentRecord,
  laterPaymentRecord,
  openInvoicesOfPayment,
  partAllocatedPaymentRecord,
  readOnlyPaymentRecord,
} from "./__fixtures__/payments.ts";
import { formatDay, formatMoney } from "./format.ts";
import { PaymentRecord } from "./payment-record.tsx";
import type { PaymentRecordView } from "./views.ts";

const getPaymentRecord = fn();

const unlinkAllocation = fn();

const changeAllocation = fn();

const listOpenInvoices = fn();

const linkPayment = fn();

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const [automatic] = partAllocatedPaymentRecord.allocations;

/** Below 1280 px the links sit in the record's sheet, so a phone story opens it first. */
async function openDetails(canvas: ReturnType<typeof within>) {
  const details = canvas.queryByRole("button", { name: "Details" });

  if (details !== null) await userEvent.click(details);
}

const REFUSAL = "That amount is more than the open balance of the invoice.";

function serve(view: PaymentRecordView) {
  getPaymentRecord.mockReset().mockResolvedValue(view);
  unlinkAllocation.mockReset().mockResolvedValue({ unlinkedCents: 200_000 });
  changeAllocation
    .mockReset()
    .mockResolvedValue({ allocationId: automatic?.id ?? "" });
  listOpenInvoices.mockReset().mockResolvedValue(openInvoicesOfPayment);
  linkPayment.mockReset().mockResolvedValue({
    allocationId: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0",
  });
}

/** True when the record was read again after the last call of `mutation`. */
function refetchedAfter(mutation: typeof changeAllocation): boolean {
  const changed = mutation.mock.invocationCallOrder.at(-1) ?? Infinity;

  return getPaymentRecord.mock.invocationCallOrder.some(
    (order) => order > changed
  );
}

function refuseOnce() {
  serve(partAllocatedPaymentRecord);
  changeAllocation.mockRejectedValueOnce(new Error(REFUSAL));
}

/**
 * Opens Change amount on the automatic link, saves 2500.50, and answers the dialog that shows the
 * refusal. The read is not repeated after a refused change.
 */
async function changeAndRefuse(canvas: ReturnType<typeof within>) {
  await openDetails(canvas);
  await userEvent.click(
    canvas.getByRole("button", { name: "Actions for INV-2026-09-03" })
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Change amount" })
  );

  const dialog = await screen.findByRole("dialog");

  // Inside waitFor: the dialog fades in, and an opacity of 0 is not visible yet.
  await waitFor(() =>
    expect(
      within(dialog).getByRole("heading", {
        name: "Change the link to INV-2026-09-03",
      })
    ).toBeVisible()
  );

  const amount = within(dialog).getByRole("textbox", { name: "Amount" });

  await expect(amount).toHaveValue("2000.00");
  await userEvent.clear(amount);
  await userEvent.type(amount, "2500.50");
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(changeAllocation).toHaveBeenCalledWith({
      id: automatic?.id,
      amountCents: 250_050,
    })
  );
  await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    REFUSAL
  );
  await expect(dialog).toBeVisible();
  await expect(refetchedAfter(changeAllocation)).toBe(false);

  return dialog;
}

const larger = openInvoicesOfPayment.rows[1];

const LINK_REFUSAL =
  "That amount is more than the open balance of the invoice.";

/**
 * Opens Link to an invoice, checks that it asks for the open invoices of the payment's customer
 * and currency, and chooses the smaller invoice, then the larger one: each fills the lower of its
 * open amount and the payment's unallocated 2,000.00.
 */
async function chooseInvoice(canvas: ReturnType<typeof within>) {
  await openDetails(canvas);
  await userEvent.click(
    canvas.getByRole("button", { name: "Link to an invoice" })
  );

  const dialog = await screen.findByRole("dialog");

  await waitFor(() =>
    expect(
      within(dialog).getByRole("heading", {
        name: `Link ${formatDay(partAllocatedPaymentRecord.payment.paymentDate)} to an invoice`,
      })
    ).toBeVisible()
  );
  await expect(listOpenInvoices).toHaveBeenCalledWith({
    customerId: partAllocatedPaymentRecord.payment.customerId,
    currency: "SGD",
  });

  const pick = async (label: string, filled: string) => {
    await userEvent.click(
      await within(dialog).findByRole("combobox", { name: "Invoice" })
    );
    await userEvent.click(await screen.findByRole("option", { name: label }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole("textbox", { name: "Amount" })
      ).toHaveValue(filled)
    );
  };

  // formatMoney, because the money format may join the currency with a no-break space.
  await pick(`INV-2026-10-07 · open ${formatMoney(120_000, "SGD")}`, "1200.00");
  await pick(`INV-2026-10-09 · open ${formatMoney(450_000, "SGD")}`, "2000.00");

  // The popup fades out; axe must not catch it half unmounted.
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

  return dialog;
}

function refuseLinkOnce() {
  serve(partAllocatedPaymentRecord);
  linkPayment.mockRejectedValueOnce(new Error(LINK_REFUSAL));
}

/** Links the larger invoice, and answers the dialog that shows the refusal. */
async function linkAndRefuse(canvas: ReturnType<typeof within>) {
  const dialog = await chooseInvoice(canvas);

  await userEvent.click(within(dialog).getByRole("button", { name: "Link" }));
  await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    LINK_REFUSAL
  );
  await expect(dialog).toBeVisible();
  await expect(refetchedAfter(linkPayment)).toBe(false);
}

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
            getPaymentRecord,
            unlinkAllocation,
            changeAllocation,
            listOpenInvoices,
            linkPayment,
          },
        }}
      >
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Modules/Invoices/Payment record",
  component: PaymentRecord,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One payment at `/m/invoices/payments/:id`, read as of the reporting date, on the document desk (Spec 7 R-9, R-32, R-38a, R-59, R-60, decisions 4 and 9). The page header holds the customer. The Figures strip leads with Unallocated and its status, or with Amount when nothing is unallocated, then Allocated and the payment date. From 1280 px the PDF shows in the page with each read field pinned beside its line, and the invoices and their history sit in a drawer, as cards. Below 1280 px the page comes first and the record opens in a bottom sheet. A writer gets Undo on an automatic link, Change amount and Remove link on every link, and Link to an invoice while money is unallocated. A refusal stays inside the open dialog, and after each change the page reads the payment again.",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [withQuery],
  beforeEach: () => serve(partAllocatedPaymentRecord),
  args: { view: partAllocatedPaymentRecord },
} satisfies Meta<typeof PaymentRecord>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The terms of the Figures strip, in order. */
const figureTerms = (canvas: ReturnType<typeof within>) =>
  within(canvas.getByRole("region", { name: "Figures" }))
    .getAllByRole("term")
    .map((term) => term.textContent);

// D19: the payment shows its PDF in the page and its invoices in the drawer; its figures stay.
export const Default: Story = {
  globals: desktop,
  args: { view: bundlePaymentRecord },
  beforeEach: () => serve(bundlePaymentRecord),
  play: async ({ canvas, canvasElement }) => {
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector("[data-document-viewer] canvas")
        ).not.toBeNull(),
      { timeout: 10000 }
    );

    const drawer = canvas.getByRole("complementary", {
      name: "Invoices and history",
    });

    await expect(
      within(within(drawer).getByRole("list", { name: "Invoices" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      expect.stringContaining("INV-2026-08-04"),
      expect.stringContaining("INV-2026-09-04"),
    ]);
    await expect(figureTerms(canvas)).toEqual([
      "Amount",
      "Allocated",
      "Payment date",
    ]);
  },
};

// Choice 11: unallocated money leads the strip.
export const PartAllocated: Story = {
  name: "Part allocated",
  globals: desktop,
  play: async ({ canvas }) => {
    await expect(figureTerms(canvas)).toEqual([
      "Unallocated",
      "Amount",
      "Allocated",
      "Payment date",
    ]);
  },
};

const fullyAllocatedPaymentRecord = {
  ...partAllocatedPaymentRecord,
  payment: {
    ...partAllocatedPaymentRecord.payment,
    unallocatedCents: 0,
    allocatedCents: 500_000,
    status: "allocated",
  },
} satisfies PaymentRecordView;

// Choice 11: with nothing unallocated, Amount leads and no "Unallocated SGD 0.00" shows.
export const FullyAllocated: Story = {
  name: "Fully allocated",
  globals: desktop,
  args: { view: fullyAllocatedPaymentRecord },
  beforeEach: () => serve(fullyAllocatedPaymentRecord),
  play: async ({ canvas }) => {
    await expect(figureTerms(canvas)).toEqual([
      "Amount",
      "Allocated",
      "Payment date",
    ]);
  },
};

export const AfterReportingDate: Story = {
  name: "After the reporting date",
  args: { view: laterPaymentRecord },
};

// B7.3: the dialog sends the typed cents, keeps a refusal inside it, and closes on a save.
export const ChangeAmount: Story = {
  globals: desktop,
  beforeEach: refuseOnce,
  play: async ({ canvas }) => {
    const dialog = await changeAndRefuse(canvas);

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(changeAllocation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The closing dialog kept its title to the end, never an empty dialog.
    // The node is detached now, so the check reads the text it last held.
    await expect(
      within(dialog).queryByText("Change the link to INV-2026-09-03")
    ).not.toBeNull();
    await waitFor(() => expect(refetchedAfter(changeAllocation)).toBe(true));
    await expect(getPaymentRecord).toHaveBeenLastCalledWith({
      id: partAllocatedPaymentRecord.payment.id,
    });
  },
};

// B7.3, ending with the refusal in the open dialog: axe scans the field, the alert and the footer at 1440.
export const ChangeAmountRefused: Story = {
  name: "Change amount, refused",
  globals: desktop,
  beforeEach: refuseOnce,
  play: async ({ canvas }) => {
    await changeAndRefuse(canvas);
  },
};

// B7.3 at 390, from the card menu, ending with the refusal in the open dialog for axe.
export const ChangeAmountRefusedOnPhone: Story = {
  name: "Change amount, refused, on a phone",
  globals: phone,
  beforeEach: refuseOnce,
  play: async ({ canvas }) => {
    await changeAndRefuse(canvas);
  },
};

// B8.1: the open invoices of the payment's customer and currency, the lower amount filled, and the link sent in cents.
export const LinkInvoice: Story = {
  name: "Link to an invoice",
  globals: desktop,
  play: async ({ canvas }) => {
    const dialog = await chooseInvoice(canvas);

    await userEvent.click(within(dialog).getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(linkPayment).toHaveBeenCalledWith({
        invoiceId: larger?.invoiceId,
        paymentId: partAllocatedPaymentRecord.payment.id,
        amountCents: 200_000,
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(refetchedAfter(linkPayment)).toBe(true));
  },
};

// B8.1, ending with a refusal in the open dialog: axe scans the select, the amount and the alert at 1440.
export const LinkInvoiceRefused: Story = {
  name: "Link to an invoice, refused",
  globals: desktop,
  beforeEach: refuseLinkOnce,
  play: async ({ canvas }) => {
    await linkAndRefuse(canvas);
  },
};

// B8.1 at 390, ending with the refusal in the open dialog for axe.
export const LinkInvoiceRefusedOnPhone: Story = {
  name: "Link to an invoice, refused, on a phone",
  globals: phone,
  beforeEach: refuseLinkOnce,
  play: async ({ canvas }) => {
    await linkAndRefuse(canvas);
  },
};

// B7.5 and B8.5 at 390: a reader without write sees the cards, and no Undo, no menu and no Link.

export const ReadOnly: Story = {
  name: "Read only",
  globals: phone,
  args: { view: readOnlyPaymentRecord },
  beforeEach: () => serve(readOnlyPaymentRecord),
  play: async ({ canvas }) => {
    await openDetails(canvas);

    const list = canvas.getByRole("list", { name: "Invoices" });

    await expect(within(list).getByText(/Automatic/)).toBeVisible();
    await expect(canvas.queryAllByRole("button", { name: /Undo/ })).toEqual([]);
    await expect(
      canvas.queryAllByRole("button", { name: /^Actions for/ })
    ).toEqual([]);
    await expect(
      canvas.queryByRole("button", { name: "Link to an invoice" })
    ).toBeNull();
  },
};
