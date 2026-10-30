import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  laterPaymentRecord,
  partAllocatedPaymentRecord,
} from "./__fixtures__/payments.ts";
import { PaymentRecord } from "./payment-record.tsx";

const meta = {
  title: "Modules/Invoices/Payment record",
  component: PaymentRecord,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One payment at `/m/invoices/payments/:id`, read as of the reporting date (Spec 7 R-9, R-59, R-60). The card lists its amounts; the source PDF opens in a new tab through a short-lived link. Allocations and History are tables from 768 px and cards below it, each row opening the invoice. A payment dated after the reporting date shows a note instead of a balance.",
      },
    },
    a11y: { test: "error" },
  },
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
