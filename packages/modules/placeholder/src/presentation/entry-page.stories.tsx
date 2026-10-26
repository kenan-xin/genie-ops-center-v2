import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { EntryPage } from "./entry-page.tsx";

const meta = {
  title: "Modules/Placeholder/Entry page",
  component: EntryPage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The one plain page behind the placeholder's Archive and Retired entries (6wz1.37). Its title is the entry's label, through `PageHeader`.",
      },
    },
    a11y: { test: "error" },
  },
  args: { label: "Archive" },
} satisfies Meta<typeof EntryPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Archive" })
    ).toBeVisible();
    await expect(
      canvas.getByText("This placeholder entry holds nothing yet.")
    ).toBeInTheDocument();
  },
};
