import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import { Button, Tooltip, TooltipContent, TooltipTrigger } from "../index.ts";

const meta = {
  title: "UI/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Tooltip (base style). It names an icon-only control on hover and on keyboard focus; the control keeps its own `aria-label`. `HelpDisclosure` uses it in its `iconOnly` form.",
      },
    },
  },
  render: () => (
    <div className="p-12">
      <Tooltip>
        <TooltipTrigger render={<Button variant="secondary" />}>
          Hover or focus
        </TooltipTrigger>
        <TooltipContent>The full name of the control</TooltipContent>
      </Tooltip>
    </div>
  ),
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async () => {
    await userEvent.tab();

    const tip = await screen.findByText("The full name of the control");

    // The tooltip fades in, so wait until it paints.
    await waitFor(() => expect(tip).toBeVisible());
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
