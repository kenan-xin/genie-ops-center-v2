import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../index.ts";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Tabs on Base UI, fitted to tokens.md: a 40 px trigger, one focus ring, a primary underline on the active tab. Arrow keys move the focus between tabs, and Enter or Space selects the focused one.",
      },
    },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  render: () => (
    <Tabs defaultValue="members">
      <TabsList>
        <TabsTrigger value="members">Members (3)</TabsTrigger>
        <TabsTrigger value="roles">Roles (1)</TabsTrigger>
      </TabsList>
      <TabsContent value="members">Three people are in this group.</TabsContent>
      <TabsContent value="roles">One role is assigned.</TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const first = canvas.getByRole("tab", { name: "Members (3)" });
    const second = canvas.getByRole("tab", { name: "Roles (1)" });

    await expect(first.getBoundingClientRect().height).toBe(40);
    await expect(
      canvas.getByRole("tabpanel").getBoundingClientRect().top
    ).toBeGreaterThanOrEqual(
      canvas.getByRole("tablist").getBoundingClientRect().bottom
    );
    await expect(first).toHaveAttribute("aria-selected", "true");

    await userEvent.tab();
    await expect(first).toHaveFocus();
    await expect(getComputedStyle(first).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );

    await userEvent.keyboard("{ArrowRight}");
    await expect(second).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByText("One role is assigned.")).toBeVisible();
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("tab", { name: "Members (3)" })
    ).toHaveAttribute("aria-selected", "true");
  },
};
