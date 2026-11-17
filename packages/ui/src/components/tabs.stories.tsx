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
          "The shadcn Tabs on Base UI, fitted to tokens.md: a 36 px trigger from `lg`, 40 px under it with a touch area that reaches 44 px up and down only, so a flush neighbor keeps its taps, one focus ring, a primary underline on the active tab. Arrow keys move the focus between tabs, and Enter or Space selects the focused one.",
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

    await expect(first.getBoundingClientRect().height).toBe(36);
    // 6wz1.117 (T11-a): the hairline spans the row, not just the tabs.
    const list = canvas.getByRole("tablist");
    // SAFETY: the tablist always renders inside the Tabs root, a div.
    const parent = list.parentElement as HTMLElement;
    await expect(list.getBoundingClientRect().width).toBe(
      parent.getBoundingClientRect().width
    );
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

// 6wz1.114 (T3-c): under lg a 40 px trigger reaches 44 px up and down, and never sideways into its
// flush neighbor (the list has gap-0 under sm).
export const TabsOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  // Room above, so that a point 1.5 px over the edge is on the page.
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const first = canvas.getByRole("tab", { name: "Members (3)" });
    const second = canvas.getByRole("tab", { name: "Roles (1)" });
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    const y = (a.top + a.bottom) / 2;

    await expect(a.height).toBe(40);
    await expect(
      document.elementFromPoint((a.left + a.right) / 2, a.top - 1.5)
    ).toBe(first);
    await expect(document.elementFromPoint(b.left + 1, y)).toBe(second);
    await expect(document.elementFromPoint(a.right - 1, y)).toBe(first);
  },
};
