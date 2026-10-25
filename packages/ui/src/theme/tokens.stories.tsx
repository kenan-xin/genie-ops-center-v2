import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { focusRing } from "../index.ts";
import { fontSizePresetsPx } from "./tokens.ts";

const meta = {
  title: "UI/Tokens",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The fixed token layer of `docs/design/design-system/tokens.md`, and the parts of it that a component cannot fake: the one focus ring and the self-hosted faces.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const FocusRing: Story = {
  render: () => (
    <button type="button" className={focusRing}>
      Focus target
    </button>
  ),
  play: async ({ canvas }) => {
    await userEvent.tab();

    const target = canvas.getByRole("button", { name: "Focus target" });

    await expect(target).toHaveFocus();
    // R-8: the ring is --ring, which is --primary (blue-600) in the light theme.
    await expect(getComputedStyle(target).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );
  },
};

export const Fonts: Story = {
  render: () => (
    <>
      <p className="font-sans">Plus Jakarta Sans, the default face</p>
      <p className="font-mono">JetBrains Mono, the fixed mono face</p>
    </>
  ),
  play: async () => {
    // `load` answers no face when no @font-face names the family, so an unwired export fails here.
    await expect(
      await document.fonts.load('15px "Plus Jakarta Sans"')
    ).not.toHaveLength(0);
    await expect(
      await document.fonts.load('15px "JetBrains Mono"')
    ).not.toHaveLength(0);
  },
};

export const TextFloor: Story = {
  render: () => <p className="text-xs">Caption, the smallest text size</p>,
  play: async ({ canvas }) => {
    const caption = canvas.getByText("Caption, the smallest text size");
    const root = document.documentElement;
    const before = root.style.fontSize;

    try {
      // DR-22: no root size preset renders text below 12 px.
      const sizes = Object.values(fontSizePresetsPx).map((px) => {
        root.style.fontSize = `${px}px`;

        return Number.parseFloat(getComputedStyle(caption).fontSize);
      });

      await expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);

      root.style.fontSize = `${fontSizePresetsPx.default}px`;
      await expect(getComputedStyle(caption).fontSize).toBe("12px");
    } finally {
      root.style.fontSize = before;
    }
  },
};

export const WidthCap: Story = {
  render: () => <input aria-label="Search" className="w-full max-w-sm" />,
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Search" });
    const root = document.documentElement;
    const before = root.style.fontSize;

    try {
      // DR-20 (S3-03): tokens.md caps a search field at 384 px at every root size preset.
      const widths = Object.values(fontSizePresetsPx).map((px) => {
        root.style.fontSize = `${px}px`;

        return getComputedStyle(field).maxWidth;
      });

      await expect(new Set(widths)).toEqual(new Set(["384px"]));
    } finally {
      root.style.fontSize = before;
    }
  },
};

export const FocusRingOnDark: Story = {
  ...FocusRing,
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await userEvent.tab();

    const target = canvas.getByRole("button", { name: "Focus target" });

    await expect(target).toHaveFocus();
    // R-15: on dark the ring is the fixed --brand-on-dark (blue-400).
    await expect(getComputedStyle(target).boxShadow).toContain(
      "rgb(96, 165, 250)"
    );
  },
};
