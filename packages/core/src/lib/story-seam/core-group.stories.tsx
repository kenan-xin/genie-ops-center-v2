import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { CoreGroup } from "./core-group.tsx";

const meta = {
  title: "Core/Story seam",
  component: CoreGroup,
  // The docs addon generates the Docs page from this tag, which is where the
  // component description below renders.
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A static fixture that proves the Core group renders. Section 1 replaces it with the first real core screen.",
      },
    },
  },
  args: {
    heading: "Core renders in the workbench",
    body: "This fixture imports no database, no registry, and no environment value.",
  },
} satisfies Meta<typeof CoreGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Core renders in the workbench" })
    ).toBeInTheDocument();
  },
};
