import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Kbd, KbdGroup } from "../index.ts";

const meta = {
  title: "UI/Kbd",
  component: Kbd,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A key the person can press, for keyboard hints such as the arrow keys in present mode. `KbdGroup` sets several keys side by side. A hint is decoration: hide it from screen readers when the controls already name the action.",
      },
    },
    a11y: { test: "error" },
  },
  args: { children: "Esc" },
} satisfies Meta<typeof Kbd>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Group: Story = {
  render: () => (
    <p className="text-sm text-muted-foreground">
      <KbdGroup>
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
      </KbdGroup>{" "}
      move
    </p>
  ),
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
