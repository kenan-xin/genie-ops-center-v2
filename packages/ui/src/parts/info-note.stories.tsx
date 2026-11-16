import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { Button, InfoNote, WarningNote } from "../index.ts";

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
        This account cannot sign in. Ask your administrator.
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

const RECOLOR = "Text colors changed to stay readable.";

/** T7-a: the action sits in the alert action slot, inside the note, and the text wraps before it. */
async function actionInsideNote(canvas: ReturnType<typeof within>) {
  const note: HTMLElement = canvas.getByRole("status");
  const slot = note.querySelector<HTMLElement>('[data-slot="alert-action"]');

  if (slot === null) throw new Error("InfoNote rendered no action slot");

  await expect(
    within(slot).getByRole("button", { name: "Undo" })
  ).toBeVisible();

  const box = note.getBoundingClientRect();
  const action = slot.getBoundingClientRect();

  await expect(action.top).toBeGreaterThanOrEqual(box.top);
  await expect(action.bottom).toBeLessThanOrEqual(box.bottom);
  await expect(action.right).toBeLessThanOrEqual(box.right);

  const range = document.createRange();
  range.selectNodeContents(canvas.getByText(RECOLOR));

  const textRight = Math.max(
    ...[...range.getClientRects()].map((r) => r.right)
  );

  await expect(textRight).toBeLessThanOrEqual(action.left);

  return { box, action };
}

export const WithAction: Story = {
  args: {
    children: RECOLOR,
    action: (
      <Button variant="secondary" size="sm">
        Undo
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    const { box, action } = await actionInsideNote(canvas);

    // P07-67: in a one-line note the button sits as far from the bottom edge as from the top.
    await expect(
      Math.abs(action.top - box.top - (box.bottom - action.bottom))
    ).toBeLessThanOrEqual(1);
  },
};

export const WithActionOnPhone: Story = {
  ...WithAction,
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await actionInsideNote(canvas);
  },
};
