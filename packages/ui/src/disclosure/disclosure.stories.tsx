import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { Disclosure } from "./disclosure.tsx";

const meta = {
  title: "UI/Disclosure",
  component: Disclosure,
  parameters: {
    docs: {
      description: {
        component:
          "A summary that shows and hides its content. The trigger is a button, it carries aria-expanded, and it responds to Enter and to Space.",
      },
    },
  },
  args: {
    summary: "Deployment notes",
    children: "One deployment serves one customer.",
  },
} satisfies Meta<typeof Disclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Deployment notes" });

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByText("One deployment serves one customer.")
    ).not.toBeInTheDocument();
  },
};

export const OpensOnClick: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Deployment notes" });

    await userEvent.click(trigger);

    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByText("One deployment serves one customer.")
    ).toBeInTheDocument();
  },
};

export const OpensFromTheKeyboard: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Deployment notes" });

    await userEvent.tab();
    await expect(trigger).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard(" ");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  },
};

export const OpenByDefault: Story = {
  args: { defaultOpen: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Deployment notes" })
    ).toHaveAttribute("aria-expanded", "true");
  },
};

export const StateResets: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Deployment notes" })
    ).toHaveAttribute("aria-expanded", "false");
  },
};

// The first consumer of the theme toolbar. It proves the preview decorator
// applies the selected scheme, and it runs the same accessibility check in dark
// mode that every other story runs in light mode.
export const Dark: Story = {
  globals: { theme: "dark" },
  args: { defaultOpen: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector("[data-theme]")).toHaveAttribute(
      "data-theme",
      "dark"
    );
    await expect(
      canvas.getByRole("region", { name: "Deployment notes" })
    ).toBeInTheDocument();
  },
};
