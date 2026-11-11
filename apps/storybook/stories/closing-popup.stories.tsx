import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * The fixture for the preview's closing-popup wait (xok3.73). Its play ends while a Base UI style
 * popup still closes: an unnamed listbox marked `data-closed` in a portal, removed 300 ms later.
 * axe fails that listbox, so the story passes only when the wait holds axe until it is gone.
 */
const meta = {
  title: "Testing/Closing popup",
  tags: ["!dev", "!autodocs"],
  render: () => <p>The popup closed.</p>,
} satisfies Meta;

export default meta;

export const PlayEndsWhileAPopupCloses: StoryObj<typeof meta> = {
  name: "axe waits until a closing popup is gone",
  play: ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const portal = document.createElement("div");
    const popup = document.createElement("div");

    portal.setAttribute("data-base-ui-portal", "");
    popup.setAttribute("role", "listbox");
    popup.setAttribute("data-closed", "");
    popup.textContent = "Closing";
    portal.append(popup);
    document.body.append(portal);
    setTimeout(() => portal.remove(), 300);
  },
};
