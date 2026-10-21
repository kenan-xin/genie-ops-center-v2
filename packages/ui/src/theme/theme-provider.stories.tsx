import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ThemeProvider } from "./theme-provider.tsx";
import { themeTokens } from "./tokens.ts";

const meta = {
  title: "UI/ThemeProvider",
  component: ThemeProvider,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The fixed theme surface a story renders against. It applies the light or dark token pair from `packages/ui`, and the Storybook preview wires it once as the host decorator.",
      },
    },
  },
  args: {
    theme: "light",
    children: <p>Theme surface</p>,
  },
} satisfies Meta<typeof ThemeProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
  play: async ({ canvas }) => {
    const surface = canvas.getByText("Theme surface").closest("[data-theme]");

    await expect(surface).toHaveAttribute("data-theme", "light");
    await expect(surface).toHaveStyle({
      backgroundColor: themeTokens.light.surface,
      color: themeTokens.light.foreground,
    });
  },
};

export const Dark: Story = {
  args: { theme: "dark" },
  play: async ({ canvas }) => {
    const surface = canvas.getByText("Theme surface").closest("[data-theme]");

    await expect(surface).toHaveAttribute("data-theme", "dark");
    await expect(surface).toHaveStyle({
      backgroundColor: themeTokens.dark.surface,
      color: themeTokens.dark.foreground,
    });
  },
};
