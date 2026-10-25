import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { WarningNote } from "../index.ts";

const meta = {
  title: "UI/WarningNote",
  component: WarningNote,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The one amber block of tokens.md, Warning note. `md` is the block at the top of a card or a sheet, `sm` the inline note under a control. Pass `role="status"` when the note explains a state, and no role for static prose. Amber is only ever a real warning.',
      },
    },
  },
  args: {
    size: "md",
    children: (
      <>
        <p className="font-semibold">Expense approvals is switched off.</p>
        <p>
          Its settings stay editable, so the tenant can be prepared before the
          module is enabled.
        </p>
      </>
    ),
  },
} satisfies Meta<typeof WarningNote>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Medium: Story = {
  args: { role: "status" },
  play: async ({ canvas }) => {
    const note = canvas.getByRole("status");

    await expect(note).toHaveTextContent("Expense approvals is switched off.");
    await expect(note.querySelectorAll("svg")).toHaveLength(1);
    // tokens.md: md is text-sm on 14 px by 12 px padding.
    await expect(getComputedStyle(note).paddingRight).toBe("14px");
    await expect(getComputedStyle(note).paddingTop).toBe("12px");
  },
};

export const Small: Story = {
  args: {
    size: "sm",
    children: "Changing the root size moves every text size with it.",
  },
  play: async ({ canvas, canvasElement }) => {
    // Static prose carries no role, and never the alert role of the primitive.
    await expect(canvas.queryByRole("status")).toBeNull();
    await expect(canvas.queryByRole("alert")).toBeNull();

    const note = canvasElement.querySelector<HTMLElement>(
      '[data-slot="alert"]'
    );

    if (note === null) throw new Error("WarningNote rendered no alert slot");

    await expect(note.querySelectorAll("svg")).toHaveLength(1);
    // tokens.md: sm is text-xs on 10 px by 6 px padding.
    await expect(getComputedStyle(note).paddingRight).toBe("10px");
    await expect(getComputedStyle(note).paddingTop).toBe("6px");
    await expect(getComputedStyle(note).fontSize).toBe("12px");
  },
};

export const MediumOnDark: Story = {
  ...Medium,
  globals: { theme: "dark" },
};

export const SmallOnDark: Story = {
  ...Small,
  globals: { theme: "dark" },
};
