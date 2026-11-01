import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, userEvent } from "storybook/test";

import {
  defaultInvoiceList,
  twoCurrencyInvoiceList,
} from "./__fixtures__/invoices.ts";
import { InvoiceList } from "./invoice-list.tsx";
import type { InvoiceListView } from "./views.ts";

const listInvoices = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/** A fresh query cache per story, and the list procedure as a mock. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider client={{ invoices: { listInvoices } }}>
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const CURSOR = { values: ["2026-09-01", "INV-2026-09-01", "invoice-4"] };

/** A first page that was cut, and the one row the next page answers. */
const cut: InvoiceListView = {
  ...defaultInvoiceList,
  truncated: true,
  next: CURSOR,
};

const [firstRow] = defaultInvoiceList.rows;

const NEXT_PAGE: InvoiceListView = {
  asOf: "2026-10-27",
  rows:
    firstRow === undefined
      ? []
      : [{ ...firstRow, id: "invoice-5", invoiceNumber: "INV-2026-08-30" }],
  truncated: false,
  next: null,
};

async function showsMore(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"]
) {
  listInvoices.mockReset();
  listInvoices.mockResolvedValue(NEXT_PAGE);

  await expect(canvas.getByText("Showing the first 4 invoices.")).toBeVisible();

  await userEvent.click(canvas.getByRole("button", { name: "Show more" }));

  // The role query skips the copy that the other viewport hides (table or cards).
  await expect(
    await canvas.findByRole("link", { name: "INV-2026-08-30" })
  ).toBeVisible();
  await expect(listInvoices).toHaveBeenCalledWith({ after: CURSOR });
  await expect(canvas.queryByRole("button", { name: "Show more" })).toBeNull();
  await expect(canvas.queryByText(/Showing the first/)).toBeNull();
}

const meta = {
  title: "Modules/Invoices/Invoices list",
  component: InvoiceList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Invoices list at `/m/invoices/invoices`, read from `invoices.invoices` as of the reporting date (Spec 7 R-59, R-60). The caption names the reporting date because `PageHeader` hides its description below `lg`. From 768 px the rows are a table; below that they are the same rows as cards, with the invoice number opening the record and the balance as a fact. A cut read says how many rows it shows.",
      },
    },
    a11y: { test: "error" },
  },
  args: { view: defaultInvoiceList },
  decorators: [withQuery],
} satisfies Meta<typeof InvoiceList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Show more" })
    ).toBeNull();
    await expect(canvas.queryByText(/Showing the first/)).toBeNull();
  },
};

export const TwoCurrencies: Story = {
  name: "Two currencies",
  args: { view: twoCurrencyInvoiceList },
  play: async ({ canvas }) => {
    const amounts = await canvas.findAllByText("US$1,250.00");

    await expect(amounts[0]).toBeVisible();
  },
};

export const ShowMore: Story = {
  name: "Show more",
  args: { view: cut },
  globals: desktop,
  play: async ({ canvas }) => showsMore(canvas),
};

export const ShowMoreOnPhone: Story = {
  name: "Show more on a phone",
  args: { view: cut },
  globals: phone,
  play: async ({ canvas }) => showsMore(canvas),
};

/** The list, left for another screen and opened again with a new first page from the server. */
function LeaveAndReturn() {
  const [view, setView] = useState<InvoiceListView | null>(defaultInvoiceList);

  return (
    <>
      <button type="button" onClick={() => setView(null)}>
        Leave
      </button>
      <button type="button" onClick={() => setView(twoCurrencyInvoiceList)}>
        Return
      </button>
      {view === null ? null : <InvoiceList view={view} />}
    </>
  );
}

export const FreshAfterReturn: Story = {
  name: "Fresh after a return",
  globals: desktop,
  render: () => <LeaveAndReturn />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Leave" }));
    await userEvent.click(canvas.getByRole("button", { name: "Return" }));

    // A save on another screen changes the server's first page; the list shows that page.
    const amounts = await canvas.findAllByText("US$1,250.00");

    await expect(amounts[0]).toBeVisible();
  },
};

export const Empty: Story = {
  args: {
    view: { asOf: "2026-10-27", rows: [], truncated: false, next: null },
  },
};
