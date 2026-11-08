import { Input, RadioGroup, RadioGroupItem } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { ReviewCard } from "./review-card.tsx";
import type { ReviewItem } from "./review-model.ts";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const number: ReviewItem = {
  key: "number",
  label: "Invoice number",
  tag: "extracted",
  sources: [{ page: 1, quote: "INV-2026-10-01" }],
  control: <Input id="review-number" defaultValue="INV-2026-10-01" />,
  controlId: "review-number",
  display: "INV-2026-10-01",
  readAs: null,
  onUndo: null,
  note: null,
};

/**
 * One field of a review as the desk shows it (Spec 7 R-38, czjw.98, prototype variant A): the
 * label, the origin tag, the control, the value read with Undo once the person changed it, and a
 * note. The pager shows the same card at step size, with the label as a heading.
 */
const meta = {
  title: "Modules/Invoices/Review card",
  component: ReviewCard,
  tags: ["autodocs"],
  parameters: { a11y: { test: "error" } },
  globals: desktop,
  args: { item: number },
} satisfies Meta<typeof ReviewCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Extracted: Story = {};

export const Corrected: Story = {
  args: {
    item: {
      ...number,
      tag: "corrected",
      control: <Input id="review-number" defaultValue="INV-2026-10-11" />,
      display: "INV-2026-10-11",
      readAs: "INV-2026-10-01",
      onUndo: fn(),
    },
    selected: true,
  },
};

export const CheckThis: Story = {
  args: {
    item: {
      ...number,
      key: "amount",
      label: "Total",
      tag: "check-this",
      sources: [],
      control: <Input id="review-amount" defaultValue="" />,
      controlId: "review-amount",
      display: "None",
      note: "The quote read for this field is not in the page text, so its value was dropped. Enter it from the page.",
    },
  },
};

export const NotOnTheDocument: Story = {
  args: {
    item: {
      ...number,
      key: "paymentTerms",
      label: "Payment terms",
      tag: "not-on-document",
      sources: [],
      control: (
        <Input
          id="review-paymentTerms"
          placeholder="Not stated. Leave blank or add it."
        />
      ),
      controlId: "review-paymentTerms",
      display: "None",
      note: "Not on the document. It stays blank unless you add it.",
    },
  },
};

export const NeedsInput: Story = {
  args: {
    item: {
      ...number,
      key: "dueDate",
      label: "Due date",
      tag: "needs-input",
      sources: [],
      control: (
        <RadioGroup aria-label="Due date choice">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="person" aria-label="Enter a due date" />
            <span>Enter a due date</span>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="unspecified"
              aria-label="Mark as unspecified"
            />
            <span>Mark as unspecified</span>
          </div>
        </RadioGroup>
      ),
      controlId: null,
      display: "Not set",
    },
  },
};

export const Saved: Story = {
  args: {
    item: {
      ...number,
      tag: "corrected",
      control: <p className="font-semibold">INV-2026-10-11</p>,
      controlId: null,
      display: "INV-2026-10-11",
      readAs: "INV-2026-10-01",
    },
  },
};

export const Step: Story = { args: { size: "step" } };
