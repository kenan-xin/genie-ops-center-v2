import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Spinner } from "../index.ts";

const meta = {
  title: "UI/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'A busy indicator. It has the status role and a screen reader label, "Loading" unless `label` says more. The icon is hidden from assistive technology and spins only when the person has not asked for reduced motion.',
      },
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const status = canvas.getByRole("status");

    await expect(status).toHaveTextContent("Loading");
    await expect(status.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  },
};
