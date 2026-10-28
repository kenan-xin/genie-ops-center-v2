import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Building2Icon } from "lucide-react";

// The package entry, not ./icon-tile.tsx, so that the stories prove what an app can import.
import { IconTile } from "../index.ts";

const meta = {
  title: "UI/IconTile",
  component: IconTile,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The neutral 40 px tile that leads a phone card. It holds a kind icon and is hidden from assistive technology, because the card states the kind in words beside the name.",
      },
    },
  },
  args: { children: <Building2Icon /> },
} satisfies Meta<typeof IconTile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Dark: Story = {
  globals: { theme: "dark" },
};
