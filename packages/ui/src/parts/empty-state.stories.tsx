import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LockIcon } from "lucide-react";
import { expect, fn, userEvent } from "storybook/test";

import { Button, EmptyState } from "../index.ts";

const onClear = fn();

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'Nothing to show (tokens.md, "Empty state"): one heading, one sentence and at most one action, centered. The framed form (`variant="framed"`) fills a page: a dashed frame, an icon or logo tile and a larger heading, for a refused page or an empty home. The compact form, the default, has no frame and no tile, for a list that matches nothing.',
      },
    },
  },
  args: {
    title: "No people match",
    description: "Clear the search and the filters to see everyone.",
    action: (
      <Button variant="secondary" onClick={onClear}>
        Clear search and filters
      </Button>
    ),
  },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

function frameOf(canvasElement: HTMLElement): CSSStyleDeclaration {
  return getComputedStyle(canvasElement.querySelector('[data-slot="empty"]')!);
}

export const ClearFilters: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { level: 2, name: "No people match" })
    ).toBeVisible();
    // The compact no-results form sits inside a list area, so it draws no frame.
    await expect(frameOf(canvasElement).borderTopWidth).toBe("0px");

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear search and filters" })
    );
    await expect(onClear).toHaveBeenCalledOnce();
  },
};

const FRAMED = {
  variant: "framed",
  headingLevel: "h1",
  icon: <LockIcon />,
  title: "You do not have access to this page",
  description: "Ask your administrator for access.",
  action: <Button variant="secondary">Go to home</Button>,
} as const;

export const FramedDrawsADashedFrame: Story = {
  args: FRAMED,
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", {
        level: 1,
        name: "You do not have access to this page",
      })
    ).toBeVisible();

    const frame = frameOf(canvasElement);

    await expect(frame.borderTopStyle).toBe("dashed");
    await expect(frame.borderTopWidth).toBe("1px");
  },
};

export const FramedDark: Story = {
  args: FRAMED,
  globals: { theme: "dark" },
};

export const FramedPhone: Story = {
  args: FRAMED,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const WithMedia: Story = {
  args: {
    variant: "framed",
    media: <span data-testid="media">A</span>,
  },
  play: async ({ canvas }) => {
    const media = canvas.getByTestId("media");

    await expect(media).toBeVisible();
    await expect(media.closest('[data-variant="icon"]')).toBeNull();
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
