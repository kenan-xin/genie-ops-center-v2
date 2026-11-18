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
          "The tab bar of Access, under the page header: Overview, the landing tab, then Grants. Each is its own route, so the bar is a list of links, and the current one is marked for assistive technology.",
      },
    },
    a11y: { test: "error" },
  },
  args: { current: "grants" },
} satisfies Meta<typeof AccessTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const GrantsCurrent: Story = {};

/** T10-g (P12-9): Overview comes first, each link opens its own route, and the current one is marked. */
export const TabsPutOverviewFirst: Story = {
  args: { current: "overview" },
  play: async ({ canvas }) => {
    const links = canvas.getAllByRole("link");

    await expect(links.map((link) => link.textContent)).toEqual([
      "Overview",
      "Grants",
    ]);
    await expect(links[0]).toHaveAttribute("href", "/admin/access/overview");
    await expect(links[0]).toHaveAttribute("aria-current", "page");
    await expect(links[1]).toHaveAttribute("href", "/admin/access/grants");
    await expect(links[1]).not.toHaveAttribute("aria-current");
  },
};
