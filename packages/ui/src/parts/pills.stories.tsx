import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { CountPill, LabelPill, StatusPill, CategoryChip } from "../index.ts";
import {
  categoryColors,
  colorRoles,
  type CategoryTone,
} from "../theme/tokens.ts";

const meta = {
  title: "UI/Pills",
  component: StatusPill,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The four pills of tokens.md, Pills and chips. A status pill carries a state in one of four fixed tones. A label pill is neutral and never takes a status color or the tenant color. A count pill is the one pill in the tenant color.",
      },
    },
  },
  args: { tone: "success", children: "Active" },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta<typeof StatusPill>;

export default meta;

type Story = StoryObj<typeof meta>;

const Pills = () => (
  <div className="flex flex-wrap items-center gap-2">
    <StatusPill tone="success">Active</StatusPill>
    <StatusPill tone="neutral">Pending</StatusPill>
    <StatusPill tone="danger">Suspended</StatusPill>
    <StatusPill tone="warning">Review</StatusPill>
    <LabelPill>Finance</LabelPill>
    <CountPill>3</CountPill>
  </div>
);

const check: NonNullable<Story["play"]> = async ({ canvas }) => {
  await Promise.all(
    ["Active", "Pending", "Suspended", "Review", "Finance"].map((name) =>
      expect(canvas.getByText(name)).toBeVisible()
    )
  );

  await expect(getComputedStyle(canvas.getByText("3")).backgroundColor).toBe(
    "rgb(37, 99, 235)"
  );
};

export const AllTones: Story = { render: Pills, play: check };

/** Counts set their figures at one width, so a row of counts lines up (6wz1.125). */
export const CountsLineUp: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <CountPill>11</CountPill>
      <CountPill>88</CountPill>
    </div>
  ),
  play: async ({ canvas }) => {
    const first = canvas.getByText("11").getBoundingClientRect().width;
    const second = canvas.getByText("88").getBoundingClientRect().width;

    await expect(Math.abs(first - second)).toBeLessThan(0.5);
  },
};

export const Dark: Story = {
  render: Pills,
  globals: { theme: "dark" },
  play: check,
};

const categoryActions = {
  "session": "auth:sign_in",
  "people": "core:person_added",
  "groups": "core:group_label_changed",
  "access": "core:role_assignment_removed",
  "settings": "core:settings_updated",
  "modules": "core:module_enabled",
  "module-event": "solutions:status:changed",
} as const satisfies Record<CategoryTone, string>;

// SAFETY: the object satisfies Record<CategoryTone, string>, so its keys are that union.
const tones = Object.keys(categoryActions) as CategoryTone[];

function rgb(hex: string): string {
  const digits = hex.replace("#", "");
  const r = Number.parseInt(digits.slice(0, 2), 16);
  const g = Number.parseInt(digits.slice(2, 4), 16);
  const b = Number.parseInt(digits.slice(4, 6), 16);

  return `rgb(${r}, ${g}, ${b})`;
}

/** The seven event categories, plus an operator row, which carries none. */
const CategoryChips = () => (
  <div className="flex flex-wrap items-center gap-2">
    {tones.map((tone) => (
      <CategoryChip key={tone} category={tone}>
        {categoryActions[tone]}
      </CategoryChip>
    ))}
    <CategoryChip category={null}>ops:migrate</CategoryChip>
  </div>
);

const checkCategories =
  (theme: "light" | "dark"): NonNullable<Story["play"]> =>
  async ({ canvas }) => {
    await Promise.all(
      tones.map((tone) => {
        const chip = canvas.getByText(categoryActions[tone]);
        const pair = categoryColors[tone][theme];

        return Promise.all([
          expect(getComputedStyle(chip).backgroundColor).toBe(
            rgb(pair.background)
          ),
          expect(getComputedStyle(chip).color).toBe(rgb(pair.text)),
        ]);
      })
    );

    // An operator row has no category, so it keeps the neutral fill.
    await expect(
      getComputedStyle(canvas.getByText("ops:migrate")).backgroundColor
    ).toBe(rgb(colorRoles[theme].muted));
  };

export const Categories: Story = {
  render: CategoryChips,
  play: checkCategories("light"),
};

export const CategoriesOnDark: Story = {
  render: CategoryChips,
  globals: { theme: "dark" },
  play: checkCategories("dark"),
};
