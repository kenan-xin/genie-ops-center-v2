import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ThemeProvider } from "./theme-provider.tsx";
import { colorRoles } from "./tokens.ts";

const meta = {
  title: "UI/ThemeProvider",
  component: ThemeProvider,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Storybook-only theme decorator (D3-4). It sets `data-theme` on the story root, so the fixed token layer's variables and every `dark:` class apply inside the story. The Storybook preview wires it once as the host decorator.",
      },
    },
  },
  args: {
    theme: "light",
    children: (
      <>
        <p>Theme surface</p>
        <p className="bg-card text-muted-foreground">Muted on card</p>
      </>
    ),
  },
} satisfies Meta<typeof ThemeProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {
  play: async ({ canvas }) => {
    const surface = canvas.getByText("Theme surface").closest("[data-theme]");

    await expect(surface).toHaveAttribute("data-theme", "light");
    await expect(surface).toHaveStyle({
      backgroundColor: colorRoles.light.background,
      color: colorRoles.light.foreground,
    });
    await expect(canvas.getByText("Muted on card")).toHaveStyle({
      backgroundColor: colorRoles.light.card,
      color: colorRoles.light["muted-foreground"],
    });
  },
};

export const Dark: Story = {
  args: { theme: "dark" },
  play: async ({ canvas }) => {
    const surface = canvas.getByText("Theme surface").closest("[data-theme]");

    await expect(surface).toHaveAttribute("data-theme", "dark");
    await expect(surface).toHaveStyle({
      backgroundColor: colorRoles.dark.background,
      color: colorRoles.dark.foreground,
    });
    await expect(canvas.getByText("Muted on card")).toHaveStyle({
      backgroundColor: colorRoles.dark.card,
      color: colorRoles.dark["muted-foreground"],
    });
  },
};
