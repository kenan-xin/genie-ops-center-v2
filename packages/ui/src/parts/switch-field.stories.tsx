import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { SwitchField } from "../index.ts";

const meta = {
  title: "UI/SwitchField",
  component: SwitchField,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A labelled switch row (tokens.md, Buttons). The whole row is one `<label>`: it names the switch, and a click on its text toggles it. The row is at least 44 px high below `lg` and 36 px from `lg`, taller when a description adds a line. Space toggles the focused switch.",
      },
    },
  },
  args: {
    label: "Email me a weekly summary",
    description: "Sent on Monday morning.",
    onCheckedChange: fn(),
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta<typeof SwitchField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    const toggle = canvas.getByRole("switch", {
      name: "Email me a weekly summary",
    });

    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(toggle).toHaveAccessibleDescription("Sent on Monday morning.");
    // Two lines of text-sm: 37.5 px, so the exact pin sits on OneLine.
    await expect(
      toggle.closest("label")!.getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(36);

    await userEvent.tab();
    await expect(toggle).toHaveFocus();
    await expect(getComputedStyle(toggle).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );

    await userEvent.keyboard(" ");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(canvas.getByText("Email me a weekly summary"));
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  },
};

// 6wz1.114 (T3-g): a one-line row is the md height from lg, set by the row height alone.
export const OneLine: Story = {
  render: (args) => <SwitchField label={args.label} />,
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("switch", {
      name: "Email me a weekly summary",
    });

    await expect(toggle.closest("label")!.getBoundingClientRect().height).toBe(
      36
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    const toggle = canvas.getByRole("switch", {
      name: "Email me a weekly summary",
    });

    await userEvent.click(canvas.getByText("Email me a weekly summary"), {
      pointerEventsCheck: 0,
    });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};

export const Dark: Story = {
  args: { defaultChecked: true },
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  },
};
