import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { NavigationList } from "./navigation-list.tsx";

const meta = {
  title: "UI/NavigationList",
  component: NavigationList,
  // Without this the component gets no Docs page, so the description below is
  // written and never rendered, and the folder README's claim that the stories
  // document the component on its Docs page would be false. Every other story
  // file in this repository sets it, and nothing sets it globally.
  tags: ["autodocs"],
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

const ENTRIES = {
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
};

// The one populated assertion the three viewport variants share, so a viewport
// variant cannot drift from the story it mirrors.
const entriesRender: Story["play"] = async ({ canvasElement }) => {
  const list = within(canvasElement).getByRole("navigation", {
    name: "Modules",
  });

  await expect(within(list).getAllByRole("link")).toHaveLength(2);
  await expect(
    within(list).getByRole("link", { name: "Placeholder" })
  ).toHaveAttribute("href", "/placeholder");
};

export const WithEntries: Story = {
  args: ENTRIES,
  play: entriesRender,
};

// Every screen is proved at both viewports (DEC-25). "desktop" and "mobile1" are
// keys of the built-in minimal viewports, so no host configuration is needed.
export const Desktop: Story = {
  args: ENTRIES,
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: entriesRender,
};

export const Phone: Story = {
  args: ENTRIES,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: entriesRender,
};

export const Empty: Story = {
  args: { ...ENTRIES, items: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText(ENTRIES.emptyMessage)).toBeVisible();
    await expect(canvas.queryAllByRole("link")).toHaveLength(0);
  },
};
