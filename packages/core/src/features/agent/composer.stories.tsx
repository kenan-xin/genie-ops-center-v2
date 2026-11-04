import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";

import { Composer } from "./composer.tsx";

/** The composer keeps its own text in the story, as `Conversation` does. */
function ComposerWithText(
  props: Omit<Parameters<typeof Composer>[0], "value" | "onChange">
) {
  const [value, setValue] = useState("");

  return <Composer {...props} value={value} onChange={setValue} />;
}

/**
 * The agent composer of the panel and of Ask: one bordered group with the only focus ring, the
 * textbox, an optional model picker, and Send, which is Stop while an answer streams.
 */
const meta = {
  title: "Core/Agent/Composer",
  component: Composer,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The agent composer (I18, AG20). The group draws the one focus ring; the textbox draws none. Send is disabled until the text holds more than spaces, and Enter sends. While `busy`, the round button is "Stop the answer". A `picker` sits inside the composer, left of the button.',
      },
    },
    a11y: { test: "error" },
  },
  args: {
    value: "",
    onChange: fn(),
    onSend: fn(),
    onStop: fn(),
    busy: false,
  },
  render: (args) => (
    <ComposerWithText
      onSend={args.onSend}
      onStop={args.onStop}
      busy={args.busy}
      picker={args.picker}
    />
  ),
} satisfies Meta<typeof Composer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SendNeedsText: Story = {
  name: "Send needs text",
  play: async ({ args, canvas }) => {
    const box = canvas.getByRole("textbox", { name: "Message" });

    const send = canvas.getByRole("button", { name: "Send" });

    await expect(send).toBeDisabled();

    // Spaces alone send nothing, by the button or by Enter.
    await userEvent.type(box, "   ");
    await expect(send).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSend).not.toHaveBeenCalled();

    await userEvent.clear(box);
    await userEvent.type(box, "Hi");
    await expect(send).toBeEnabled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSend).toHaveBeenCalledTimes(1);
  },
};

export const OneFocusRing: Story = {
  name: "One focus ring",
  play: async ({ canvas }) => {
    const box = canvas.getByRole("textbox", { name: "Message" });

    await userEvent.click(box);
    await expect(box).toHaveFocus();

    const own = getComputedStyle(box);

    await expect(own.boxShadow).toBe("none");
    await expect(own.outlineStyle).toBe("none");

    // The ring is the group's, drawn as a box shadow around the whole composer.
    const group = box.closest('[data-slot="input-group"]');

    await expect(group).not.toBeNull();
    // SAFETY: the line above proved that the group exists.
    await expect(getComputedStyle(group as Element).boxShadow).not.toBe("none");
  },
};

export const Busy: Story = {
  args: { busy: true },
  play: async ({ args, canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Send" })).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "Stop the answer" })
    );
    await expect(args.onStop).toHaveBeenCalledTimes(1);
  },
};
