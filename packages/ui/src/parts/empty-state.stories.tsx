import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { Button, EmptyState } from "../index.ts";

const onClear = fn();

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "An empty list (tokens.md, Empty state): one title, one sentence and at most one action, centered.",
      },
    },
  },
  args: {
    title: "No people match",
    description: "Try a different search, or clear the filters.",
    action: <Button onClick={onClear}>Clear filters</Button>,
  },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ClearFilters: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No people match")).toBeVisible();
    await expect(
      canvas.getByText("Try a different search, or clear the filters.")
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear filters" })
    );
    await expect(onClear).toHaveBeenCalledOnce();
  },
};

export const WithMedia: Story = {
  args: { media: <span data-testid="media">A</span> },
  play: async ({ canvas }) => {
    const media = canvas.getByTestId("media");

    await expect(media).toBeVisible();
    await expect(media.closest('[data-variant="icon"]')).toBeNull();
  },
};
