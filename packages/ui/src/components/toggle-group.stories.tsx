import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, within } from "storybook/test";

// The package entry, so that the stories prove what an app can import.
import { ToggleGroup, ToggleGroupItem } from "../index.ts";

const STATUSES = ["All", "Open", "Overdue", "Paid"] as const;

/** One pressed chip at a time, and All stays pressed when the pressed chip is clicked again. */
function StatusChips({ size }: { readonly size?: "sm" | "md" }) {
  const [status, setStatus] = useState<string>("All");

  return (
    <ToggleGroup
      aria-label="Status"
      {...(size === undefined ? {} : { size })}
      value={[status]}
      onValueChange={(value) => setStatus(value[0] ?? status)}
    >
      {STATUSES.map((label) => (
        <ToggleGroupItem key={label} value={label}>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const meta = {
  title: "UI/ToggleGroup",
  component: ToggleGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn ToggleGroup on the Base UI primitive (`@base-ui/react/toggle-group`), drawn as the segmented control of DESIGN.md: one tinted track, the selected segment white with a hairline. Each `ToggleGroupItem` is a button with `aria-pressed`; the group is single choice unless `multiple` is set. `value` is an array of the pressed values. For a choice that always has one, keep the old value when `onValueChange` answers an empty array, as this story does. `size` sets the track height: `sm` (32 px, the default) in a dense place, `md` (36 px from `lg`, 40 px under it) in a row beside md fields and buttons.",
      },
    },
    a11y: { test: "error" },
  },
  render: (args) => (
    <StatusChips {...(args.size === undefined ? {} : { size: args.size })} />
  ),
} satisfies Meta<typeof ToggleGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The track and its segments, in order. */
function segments(canvasElement: HTMLElement) {
  const track = within(canvasElement).getByRole("group", { name: "Status" });

  return { track, items: within(track).getAllByRole("button") };
}

/** 6wz1.105: one tinted track, segments that touch and reach 44 px, the selected one white. */
const segmented: Story["play"] = async ({ canvasElement }) => {
  const { track, items } = segments(canvasElement);

  await expect(getComputedStyle(track).backgroundColor).toBe(
    "rgb(243, 244, 246)"
  );

  for (const [index, item] of items.entries()) {
    const next = items[index + 1];

    if (next !== undefined) {
      // oxlint-disable-next-line no-await-in-loop -- each segment is measured on its own.
      await expect(
        next.getBoundingClientRect().left - item.getBoundingClientRect().right
      ).toBeLessThanOrEqual(0.5);
    }

    // oxlint-disable-next-line no-await-in-loop -- each segment is measured on its own.
    await expect(item.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
  }

  const pressed = within(track).getByRole("button", { pressed: true });

  await expect(getComputedStyle(pressed).backgroundColor).toBe(
    "rgb(255, 255, 255)"
  );
  await expect(getComputedStyle(pressed).color).toBe("rgb(17, 24, 39)");
};

export const Default: Story = { play: segmented };

export const Dark: Story = { globals: { theme: "dark" } };

/** md segments, for a row beside md fields and buttons. */
export const Medium: Story = { args: { size: "md" }, play: segmented };
