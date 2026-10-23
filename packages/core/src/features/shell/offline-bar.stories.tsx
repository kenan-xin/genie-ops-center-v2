import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { OfflineBar } from "./offline-bar.tsx";

const MESSAGE =
  "You are offline. Changes will not be saved until the connection returns.";

/**
 * The offline bar (R-35). Its live region is always mounted, so a screen reader announces the
 * message when the browser fires `offline`; the message leaves on `online`.
 */
const meta = {
  title: "Core/Shell/Offline bar",
  component: OfflineBar,
  tags: ["autodocs"],
  args: { message: MESSAGE },
} satisfies Meta<typeof OfflineBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Online: Story = {
  play: async ({ canvas }) => {
    const regions = canvas.getAllByRole("status");

    await expect(regions).toHaveLength(1);
    await expect(regions[0]).toBeEmptyDOMElement();
  },
};

export const GoesOfflineAndBack: Story = {
  play: async ({ canvas }) => {
    const region = canvas.getByRole("status");

    window.dispatchEvent(new Event("offline"));
    await waitFor(() => expect(region).toHaveTextContent(MESSAGE));

    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(region).toBeEmptyDOMElement());
  },
};
