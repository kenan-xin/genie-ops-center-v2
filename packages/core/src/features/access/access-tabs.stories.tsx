import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AccessTabs } from "./access-tabs.tsx";

const meta = {
  title: "Core/Access/AccessTabs",
  component: AccessTabs,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The tab bar of Access, under the page header. Grants and Overview are two routes, so the bar is a list of links, and the current one is marked for assistive technology.",
      },
    },
    a11y: { test: "error" },
  },
  args: { current: "grants" },
} satisfies Meta<typeof AccessTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const GrantsCurrent: Story = {};

/** T1: the current tab is marked, and each link opens its own route. */
export const OverviewCurrent: Story = {
  args: { current: "overview" },
  play: async ({ canvas }) => {
    const overview = canvas.getByRole("link", { name: "Overview" });

    const grants = canvas.getByRole("link", { name: "Grants" });

    await expect(overview).toHaveAttribute("aria-current", "page");
    await expect(grants).not.toHaveAttribute("aria-current");
    await expect(overview).toHaveAttribute("href", "/admin/access/overview");
    await expect(grants).toHaveAttribute("href", "/admin/access");
  },
};
