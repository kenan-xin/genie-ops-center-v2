import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { ThemeProvider } from "../theme/theme-provider.tsx";
import { themeTokens } from "../theme/tokens.ts";
import { Disclosure } from "./disclosure.tsx";

const meta = {
  title: "UI/Disclosure",
  component: Disclosure,
  tags: ["autodocs"],
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
    // The content stays mounted so that aria-controls always resolves. Closed
    // therefore means hidden from sight and from the accessibility tree, which
    // is what this asserts, rather than absent from the document.
    await expect(
      canvas.getByText("One deployment serves one customer.")
    ).not.toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "Deployment notes" })
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

// Renders on the dark surface this package owns. The decorator composes the
// real ThemeProvider, so the story asserts the dark token pair the surface
// actually renders and never reaches for the host's decorator. A dark-surface
// token regression fails here; the theme toolbar in apps/storybook is a
// separate concern.
export const Dark: Story = {
  args: { defaultOpen: true },
  decorators: [
    (Story) => (
      <ThemeProvider theme="dark">
        <Story />
      </ThemeProvider>
    ),
  ],
  play: async ({ canvas }) => {
    const region = canvas.getByRole("region", { name: "Deployment notes" });

    await expect(region).toBeVisible();

    const surface = region.closest("[data-theme]");

    await expect(surface).toHaveAttribute("data-theme", "dark");
    await expect(surface).toHaveStyle({
      backgroundColor: themeTokens.dark.surface,
      color: themeTokens.dark.foreground,
    });
    // The dark pair must not collapse to the light one, so a dark token that
    // becomes the light colour (the contrast regression this story catches)
    // fails here rather than passing on the attribute alone.
    await expect(surface).not.toHaveStyle({
      backgroundColor: themeTokens.light.surface,
    });
  },
};
