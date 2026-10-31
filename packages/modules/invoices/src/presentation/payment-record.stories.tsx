import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import {
  laterPaymentRecord,
  partAllocatedPaymentRecord,
  readOnlyPaymentRecord,
} from "./__fixtures__/payments.ts";
import { PaymentRecord } from "./payment-record.tsx";
import type { PaymentRecordView } from "./views.ts";

const getPaymentRecord = fn();

const unlinkAllocation = fn();

const changeAllocation = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

const [automatic] = partAllocatedPaymentRecord.allocations;

const REFUSAL = "That amount is more than the open balance of the invoice.";

function serve(view: PaymentRecordView) {
  getPaymentRecord.mockReset().mockResolvedValue(view);
  unlinkAllocation.mockReset().mockResolvedValue({ unlinkedCents: 200_000 });
  changeAllocation
    .mockReset()
    .mockResolvedValue({ allocationId: automatic?.id ?? "" });
}

/** True when the record was read again after the last change. */
function refetchedAfterChange(): boolean {
  const changed = changeAllocation.mock.invocationCallOrder.at(-1) ?? Infinity;

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
  await expect(refetchedAfterChange()).toBe(false);

  return dialog;
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
          invoices: { getPaymentRecord, unlinkAllocation, changeAllocation },
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
          "One payment at `/m/invoices/payments/:id`, read as of the reporting date (Spec 7 R-9, R-32, R-59, R-60, decisions 4 and 9). The card lists its amounts; the source PDF opens in a new tab through a short-lived link. Allocations and History are tables from 768 px and cards below it, each row opening the invoice. A writer of the payment gets Undo on an automatic link and Change amount and Remove link on every link; Change amount keeps a refusal inside its dialog. After each change the page reads the payment again. A payment dated after the reporting date shows a note instead of a balance.",
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

// Static states: the e2e reads the real page (ui-development.md, step 4).
export const Default: Story = {};

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
    await waitFor(() => expect(refetchedAfterChange()).toBe(true));
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

// B7.5 at 390: a reader without write sees the cards, and no Undo and no menu.
export const ReadOnly: Story = {
  name: "Read only",
  globals: phone,
  args: { view: readOnlyPaymentRecord },
  beforeEach: () => serve(readOnlyPaymentRecord),
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "Allocations" });

    await expect(within(list).getByText(/Automatic/)).toBeVisible();
    await expect(canvas.queryAllByRole("button", { name: /Undo/ })).toEqual([]);
    await expect(
      canvas.queryAllByRole("button", { name: /^Actions for/ })
    ).toEqual([]);
  },
};
