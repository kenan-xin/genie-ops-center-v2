import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { PageSkeleton } from "./page-skeleton.tsx";

/**
 * The content of a shell page that is still rendering (NAV-1). Skeleton blocks for the header and
 * the rows sit in a status region, and the `main` is busy until the page replaces it.
 */
const meta = {
  title: "Core/Shell/Page skeleton",
  component: PageSkeleton,
  tags: ["autodocs"],
  args: { label: "Loading the page…" },
} satisfies Meta<typeof PageSkeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

const desktop = { viewport: { value: "desktop", isRotated: false } };

const phone = { viewport: { value: "mobile1", isRotated: false } };

function element(root: ParentNode, selector: string) {
  const found = root.querySelector<HTMLElement>(selector);

  if (found === null) throw new Error(`${selector} is missing`);

  return found;
}

export const Default: Story = {
  globals: desktop,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Loading the page…"
    );
    await expect(canvas.getByRole("main")).toHaveAttribute("aria-busy", "true");
    await expect(canvas.queryAllByRole("heading")).toHaveLength(0);
  },
};

export const Phone: Story = {
  globals: phone,
  play: async ({ canvasElement }) => {
    // Below lg the top bar holds the title, so the header blocks take no room, as in PageHeader.
    await expect(
      element(canvasElement, "[data-page-skeleton-header]")
    ).not.toBeVisible();
  },
};

export const Dark: Story = { globals: { ...desktop, theme: "dark" } };
