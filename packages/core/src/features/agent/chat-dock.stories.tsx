import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import { ChatDock } from "./chat-dock.tsx";
import { ChatPanel } from "./chat-panel.tsx";

/**
 * Where a chat panel lives. The stories put a placeholder in the panel; the Conversation stories
 * cover the chat itself.
 */
const meta = {
  title: "Core/Agent/Chat dock",
  component: ChatDock,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The place of a chat panel (Section 7 redesign, choice 2): from 1280 px a fixed 400 px column `[data-chat-docked]`, from 768 px a 480 px sheet, below that the whole screen. A round 48 px button 'Open <label>' opens it, and Escape or Close hand focus back to the button. `page` marks a page's own chat, so the shell hides its general chat button; `dockedByDefault` opens the column on a wide screen. The panel is `ChatPanel`: a title with a status dot, an optional 'About ...' line, actions and Close.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    label: "Chat",
    children: (close) => (
      <ChatPanel title="Chat" about="About this example page" onClose={close}>
        <p className="p-4">The conversation renders here.</p>
      </ChatPanel>
    ),
  },
} satisfies Meta<typeof ChatDock>;

export default meta;

type Story = StoryObj<typeof meta>;

/** On a phone the chat is its own screen, and Escape hands focus back to the chat button. */
export const PhoneFullScreen: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Open Chat" });

    await userEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Chat" });

    await waitFor(() =>
      expect(dialog.getBoundingClientRect()).toMatchObject({
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      })
    );

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** On a wide screen the chat opens docked, and Close hands focus back to the chat button. */
export const DockedCloseReturnsFocus: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  args: { dockedByDefault: true },
  play: async ({ canvas, canvasElement }) => {
    const column = await waitFor(() => {
      const found = canvasElement.querySelector("[data-chat-docked]");

      if (found === null) throw new Error("The chat did not dock.");

      return found;
    });

    await expect(column.getBoundingClientRect().width).toBe(400);

    await userEvent.click(
      canvas.getByRole("button", { name: "Close the chat" })
    );

    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Open Chat" })).toHaveFocus()
    );
  },
};
