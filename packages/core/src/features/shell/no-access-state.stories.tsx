import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { NoAccessState } from "./no-access-state.tsx";

/** A page the viewer may not open (R-35): the framed empty state with a lock and a way home. */
const meta = {
  title: "Core/No-access state",
  component: NoAccessState,
  tags: ["autodocs"],
  args: {
    title: "You do not have access to this page",
    description: "Ask your administrator for access.",
    home: { href: "/", label: "Go to home" },
  },
} satisfies Meta<typeof NoAccessState>;

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
