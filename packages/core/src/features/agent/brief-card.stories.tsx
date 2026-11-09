import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { HANDOFF_BRIEF } from "./__fixtures__/handoff.ts";
import { BriefCard } from "./brief-card.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * The first message of a handed-over chat (S7-41): what Ask passed, in place of the person's
 * bubble, with a link back to the Ask chat while it exists.
 */
const meta = {
  title: "Core/Agent/Brief card",
  component: BriefCard,
  tags: ["autodocs"],
  parameters: { a11y: { test: "error" } },
  globals: desktop,
  args: {
    brief: HANDOFF_BRIEF,
    askHref: "/ask/00000000-0000-4000-8000-0000000000a0",
  },
  render: (args) => (
    <div className="max-w-180 p-4">
      <BriefCard {...args} />
    </div>
  ),
} satisfies Meta<typeof BriefCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithTheAskChat: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("From Ask")).toBeVisible();
    await expect(canvas.getByText(HANDOFF_BRIEF.goal)).toBeVisible();
    await expect(canvas.getByText("3 records in October")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open the Ask chat" })
    ).toHaveAttribute("href", "/ask/00000000-0000-4000-8000-0000000000a0");
  },
};

export const WithTheAskChatOnAPhone: Story = {
  ...WithTheAskChat,
  globals: phone,
};

// Review Focus 2: no link to an Ask chat that was deleted.
export const TheAskChatWasDeleted: Story = {
  args: { askHref: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("From Ask")).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Open the Ask chat" })
    ).toBeNull();
  },
};

export const TheAskChatWasDeletedOnAPhone: Story = {
  ...TheAskChatWasDeleted,
  globals: phone,
};
