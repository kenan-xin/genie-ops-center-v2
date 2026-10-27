import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Skeleton } from "../index.ts";

const meta = {
  title: "UI/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A placeholder block for content that is still loading. Size it with layout classes. It pulses only when the person has not asked for reduced motion.",
      },
    },
  },
  args: { className: "h-10 w-60" },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Dark: Story = {
  globals: { theme: "dark" },
};
