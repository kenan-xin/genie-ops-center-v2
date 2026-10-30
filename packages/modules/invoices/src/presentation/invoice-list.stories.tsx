import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  defaultInvoiceList,
  twoCurrencyInvoiceList,
} from "./__fixtures__/invoices.ts";
import { InvoiceList } from "./invoice-list.tsx";

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
} satisfies Meta<typeof InvoiceList>;

export default meta;

type Story = StoryObj<typeof meta>;

// Documentation only: the e2e reads the real page.
export const Default: Story = {};

export const TwoCurrencies: Story = {
  name: "Two currencies",
  args: { view: twoCurrencyInvoiceList },
  play: async ({ canvas }) => {
    const amounts = await canvas.findAllByText("US$1,250.00");

    await expect(amounts[0]).toBeVisible();
  },
};

export const RowCap: Story = {
  name: "Row cap",
  args: { view: { ...defaultInvoiceList, truncated: true } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Showing the first 4 invoices.")
    ).toBeVisible();
  },
};

export const Empty: Story = {
  args: { view: { asOf: "2026-10-27", rows: [], truncated: false } },
};
