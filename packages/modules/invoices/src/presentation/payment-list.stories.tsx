import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { defaultPaymentList } from "./__fixtures__/payments.ts";
import { PaymentList } from "./payment-list.tsx";

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
} satisfies Meta<typeof PaymentList>;

export default meta;

type Story = StoryObj<typeof meta>;

// Documentation only: the e2e reads the real page.
export const Default: Story = {};

export const Empty: Story = {
  args: { view: { asOf: "2026-10-27", rows: [], truncated: false } },
};
