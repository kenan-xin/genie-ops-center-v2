import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { NavigationList } from "./navigation-list.tsx";

const meta = {
  title: "UI/NavigationList",
  component: NavigationList,
  parameters: {
    docs: {
      description: {
        component:
          "An unfiltered list of the entries the compiled modules declare. Section 0 applies no entitlement filter and no permission filter; those join in Section 1 and Section 2.",
      },
    },
  },
} satisfies Meta<typeof NavigationList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithEntries: Story = {
  args: {
    heading: "Modules",
    items: [
      { id: "placeholder-home", label: "Placeholder", path: "/placeholder" },
      {
        id: "placeholder-archive",
        label: "Archive",
        path: "/placeholder/archive",
      },
    ],
    emptyMessage: "No modules are compiled into this deployment.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const list = canvas.getByRole("navigation", { name: "Modules" });

    await expect(
      within(list).getByRole("link", { name: "Placeholder" })
    ).toHaveAttribute("href", "/placeholder");
    await expect(within(list).getAllByRole("link")).toHaveLength(2);
  },
};

export const Empty: Story = {
  args: {
    heading: "Modules",
    items: [],
    emptyMessage: "No modules are compiled into this deployment.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText("No modules are compiled into this deployment.")
    ).toBeVisible();
    await expect(canvas.queryAllByRole("link")).toHaveLength(0);
  },
};
