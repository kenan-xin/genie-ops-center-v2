import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { NotFoundState } from "./not-found-state.tsx";

/** An address with no page (6wz1.129): the framed empty state with a compass and a way home. */
const meta = {
  title: "Core/Not-found state",
  component: NotFoundState,
  tags: ["autodocs"],
  args: {
    title: "Page not found",
    description: "There is no page at this address.",
    home: { href: "/", label: "Go to home" },
  },
} satisfies Meta<typeof NotFoundState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {};

export const Dark: Story = {
  globals: { theme: "dark" },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const PhoneDark: Story = {
  globals: {
    theme: "dark",
    viewport: { value: "mobile1", isRotated: false },
  },
};
