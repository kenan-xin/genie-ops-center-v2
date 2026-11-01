import { ModuleClientProvider } from "@genie/core/rpc/client";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, userEvent } from "storybook/test";

import { defaultPaymentList } from "./__fixtures__/payments.ts";
import { PaymentList } from "./payment-list.tsx";
import type { PaymentListView } from "./views.ts";

const listPayments = fn();

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/** A fresh query cache per story, and the list procedure as a mock. */
function withQuery(Story: () => ReactNode) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <ModuleClientProvider client={{ invoices: { listPayments } }}>
        <Story />
      </ModuleClientProvider>
    </QueryClientProvider>
  );
}

const CURSOR = { values: ["2026-09-01", "TRF-0901-001", "payment-3"] };

const cut: PaymentListView = {
  ...defaultPaymentList,
  truncated: true,
  next: CURSOR,
};

const [firstRow] = defaultPaymentList.rows;

const NEXT_PAGE: PaymentListView = {
  asOf: "2026-10-27",
  rows:
    firstRow === undefined
      ? []
      : [{ ...firstRow, id: "payment-4", reference: "TRF-0830-777" }],
  truncated: false,
  next: null,
};

async function showsMore(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"]
) {
  listPayments.mockReset();
  listPayments.mockResolvedValue(NEXT_PAGE);

  await expect(canvas.getByText("Showing the first 3 payments.")).toBeVisible();

  await userEvent.click(canvas.getByRole("button", { name: "Show more" }));

  // The role query skips the copy that the other viewport hides (table or cards).
  await expect(
    await canvas.findByRole("link", { name: "TRF-0830-777" })
  ).toBeVisible();
  await expect(listPayments).toHaveBeenCalledWith({ after: CURSOR });
  await expect(canvas.queryByRole("button", { name: "Show more" })).toBeNull();
  await expect(canvas.queryByText(/Showing the first/)).toBeNull();
}

const meta = {
  title: "Modules/Invoices/Payments list",
  component: PaymentList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Payments list at `/m/invoices/payments`, read from `invoices.payments` as of the reporting date (Spec 7 R-59, R-60). The caption names the reporting date because `PageHeader` hides its description below `lg`. From 768 px the rows are a table; below that they are the same rows as cards, with the reference or date opening the record and the unallocated amount as a fact. The status is R-31's Allocated, Part allocated or Unallocated.",
      },
    },
    a11y: { test: "error" },
  },
  args: { view: defaultPaymentList },
  decorators: [withQuery],
} satisfies Meta<typeof PaymentList>;

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

export const Empty: Story = {
  args: {
    view: { asOf: "2026-10-27", rows: [], truncated: false, next: null },
  },
};
