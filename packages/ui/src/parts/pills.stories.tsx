import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { CountPill, LabelPill, MonoChip, StatusPill } from "../index.ts";

const meta = {
  title: "UI/Pills",
  component: StatusPill,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The four pills of tokens.md, Pills and chips. A status pill carries a state in one of four fixed tones. A label pill is neutral and never takes a status color or the tenant color. A mono chip shows a code. A count pill is the one pill in the tenant color.",
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
    <StatusPill tone="danger">Disabled</StatusPill>
    <StatusPill tone="warning">Review</StatusPill>
    <LabelPill>Finance</LabelPill>
    <MonoChip>r-admin</MonoChip>
    <CountPill>3</CountPill>
  </div>
);

const check: NonNullable<Story["play"]> = async ({ canvas }) => {
  await Promise.all(
    ["Active", "Pending", "Disabled", "Review", "Finance"].map((name) =>
      expect(canvas.getByText(name)).toBeVisible()
    )
  );

  await expect(getComputedStyle(canvas.getByText("3")).backgroundColor).toBe(
    "rgb(37, 99, 235)"
  );
  await expect(
    getComputedStyle(canvas.getByText("r-admin")).fontFamily
  ).toContain("JetBrains Mono");
};

export const AllTones: Story = { render: Pills, play: check };

export const Dark: Story = {
  render: Pills,
  globals: { theme: "dark" },
  play: check,
};
