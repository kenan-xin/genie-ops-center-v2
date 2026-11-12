import { MessageParts } from "@genie/core/features/agent";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

const PROSE = "There are 42 example records in this dataset.";

/**
 * The host proof of core's OpenUI devtools guard (xok3.65). In development react-lang mounts its
 * devtools widget from jsDelivr unless a flag is set first, and that widget swallows Escape
 * (xok3.59). The preview sets no flag, so the value here comes from core's guard, which must run
 * before react-lang under Vite; `true` means react-lang ran first.
 */
const meta = {
  title: "Testing/OpenUI devtools",
  tags: ["!dev", "!autodocs"],
  render: () => (
    <MessageParts
      message={{
        id: "answer",
        role: "assistant",
        parts: [{ type: "text", text: PROSE }],
      }}
      streaming={false}
    />
  ),
} satisfies Meta;

export default meta;

export const CoreKeepsTheWidgetOff: StoryObj<typeof meta> = {
  name: "core keeps the OpenUI devtools widget off",
  play: async ({ canvas }) => {
    await canvas.findByText(PROSE);
    await expect(
      // SAFETY: a read of react-lang's global flag, whatever its type; the assertion checks it.
      (globalThis as Record<symbol, string | boolean | undefined>)[
        Symbol.for("openui.devtools.autoMount")
      ]
    ).toBe("off by @genie/core");
  },
};
