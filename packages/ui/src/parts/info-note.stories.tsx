import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { InfoNote, WarningNote } from "../index.ts";

const meta = {
  title: "UI/InfoNote",
  component: InfoNote,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The informational callout of tokens.md: a fixed blue tint, not the tenant color, one info icon, `rounded-lg`. It sits beside the amber WarningNote and uses the same two sizes. Pass `role="status"` when the note explains a state, and no role for static prose.',
      },
    },
  },
  args: {
    size: "md",
    role: "status",
    children:
      "You were signed out after 15 minutes of inactivity. Sign in again.",
  },
} satisfies Meta<typeof InfoNote>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Medium: Story = {
  render: (args) => (
    <div className="grid gap-4">
      <InfoNote {...args} />
      <WarningNote size="md">
        Your access to this workspace is disabled.
      </WarningNote>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const note = canvas.getByRole("status");

    await expect(note.querySelectorAll("svg")).toHaveLength(1);
    // tokens.md: md is text-sm on 14 px by 12 px padding, like the warning note.
    await expect(getComputedStyle(note).paddingRight).toBe("14px");
    await expect(getComputedStyle(note).paddingTop).toBe("12px");

    // Information never reads as a warning: the two tints differ.
    const warning = canvasElement.querySelectorAll<HTMLElement>(
      '[data-slot="alert"]'
    )[1];

    if (warning === undefined) throw new Error("No warning note rendered");

    await expect(getComputedStyle(note).backgroundColor).not.toBe(
      getComputedStyle(warning).backgroundColor
    );
  },
};

export const MediumOnDark: Story = {
  ...Medium,
  globals: { theme: "dark" },
};
