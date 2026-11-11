import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ExpenseClaimsPrototype } from "./expense-claims.prototype.tsx";

/** Throwaway owner prototype: employee submission, simulated checks and human approval in the real shell. */
const meta = {
  title: "Prototypes/Expense claims",
  component: ExpenseClaimsPrototype,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ExpenseClaimsPrototype>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Workflow: Story = {};
