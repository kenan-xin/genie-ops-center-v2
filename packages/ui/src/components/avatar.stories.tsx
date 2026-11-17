import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Avatar, AvatarFallback } from "../index.ts";

const SIZES = ["sm", "default", "lg", "xl"] as const;

const FALLBACK_BACKGROUND = "rgb(243, 244, 246)";

const DARK_FALLBACK_BACKGROUND = "rgb(31, 41, 55)";

function AvatarSizes() {
  return (
    <div className="flex items-center gap-3">
      {SIZES.map((size) => (
        <Avatar key={size} size={size} aria-hidden="true">
          <AvatarFallback>AM</AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

const meta = {
  title: "UI/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'DESIGN.md "Tile": a person\'s avatar is a gray tile with bold initials and no ring.',
      },
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The tile at every size: one fill and weight, a 48 px box at xl, no ring. */
export const Sizes: Story = {
  render: () => <AvatarSizes />,
  play: async ({ canvasElement }) => {
    const avatars = [
      ...canvasElement.querySelectorAll<HTMLElement>('[data-slot="avatar"]'),
    ];

    const fallbacks = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-slot="avatar-fallback"]'
      ),
    ];

    await expect(avatars).toHaveLength(SIZES.length);

    const fills = fallbacks.map(
      (fallback) => getComputedStyle(fallback).backgroundColor
    );

    const weights = fallbacks.map(
      (fallback) => getComputedStyle(fallback).fontWeight
    );

    await expect(fills).toEqual(SIZES.map(() => FALLBACK_BACKGROUND));
    await expect(weights).toEqual(SIZES.map(() => "700"));

    // The ring the shadcn base draws as an after: border.
    const rings = avatars.map(
      (avatar) => getComputedStyle(avatar, "::after").content
    );

    await expect(rings).toEqual(SIZES.map(() => "none"));

    const xl = canvasElement.querySelector<HTMLElement>('[data-size="xl"]')!;

    await expect(xl.getBoundingClientRect().width).toBe(48);
  },
};

export const Dark: Story = {
  render: () => <AvatarSizes />,
  globals: { theme: "dark" },
  play: async ({ canvasElement }) => {
    const fallback = canvasElement.querySelector<HTMLElement>(
      '[data-slot="avatar-fallback"]'
    )!;

    await expect(getComputedStyle(fallback).backgroundColor).toBe(
      DARK_FALLBACK_BACKGROUND
    );
  },
};
