import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  laterInvoiceRecord,
  noDueDateInvoiceRecord,
  partPaidInvoiceRecord,
} from "./__fixtures__/invoices.ts";
import { InvoiceRecord } from "./invoice-record.tsx";

const meta = {
  title: "Modules/Invoices/Invoice record",
  component: InvoiceRecord,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One invoice at `/m/invoices/invoices/:id`, read as of the reporting date (Spec 7 R-9, R-59, R-60). The card lists its facts and its balance; the due date names where it came from. The source PDF opens in a new tab through a short-lived link. Allocations and History are tables from 768 px and cards below it, each row opening the payment. An invoice dated after the reporting date shows a note instead of a balance.",
      },
    },
    a11y: { test: "error" },
  },
  args: { view: partPaidInvoiceRecord },
} satisfies Meta<typeof InvoiceRecord>;

export default meta;

type Story = StoryObj<typeof meta>;

// Static states: the e2e reads the real page (ui-development.md, step 4).
export const Default: Story = {};

export const NoDueDate: Story = {
  name: "No due date",
  args: { view: noDueDateInvoiceRecord },
};

export const AfterReportingDate: Story = {
  name: "After the reporting date",
  args: { view: laterInvoiceRecord },
};
