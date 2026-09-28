import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor } from "storybook/test";

import { SessionActivity } from "./session-activity.tsx";
import type { SessionActivityResult } from "./session-activity.tsx";

/**
 * The browser activity call (R-15, R-15a): one unthrottled read on mount that exposes the
 * session's absolute idle expiry, then one call per half idle window no matter how dense the
 * input is, and one navigation to the session-expired state when the answer is unauthenticated.
 * The transports are module-level spies, so the plays assert the call pattern without any
 * network.
 */
const active = (): Promise<SessionActivityResult> =>
  Promise.resolve({
    kind: "active",
    idleExpiresAt: "2026-09-28T12:15:00.000Z",
  });

const callActive = fn(active);

const callExpired = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "unauthenticated" })
);

const onUnauthenticated = fn();

const meta = {
  title: "Core/Account page/Session activity",
  component: SessionActivity,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The client that slides a live session on real browser activity and lands an expired one on the sign-in page's session-expired state. Its calls are the only writers of the session's last activity time.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    idleMinutes: 15,
    call: callActive,
    onUnauthenticated,
  },
} satisfies Meta<typeof SessionActivity>;

export default meta;

type Story = StoryObj<typeof meta>;

function fire(window: Window, event: string): void {
  window.dispatchEvent(new Event(event));
}

export const ExposesTheIdleExpiry: Story = {
  name: "Exposes the idle expiry",
  play: async ({ canvasElement }) => {
    // The mount read answers, and the hidden element carries the absolute expiry (R-15a).
    await waitFor(() =>
      expect(
        canvasElement.querySelector("[data-session-idle-expiry]")
      ).toHaveAttribute("data-session-idle-expiry", "2026-09-28T12:15:00.000Z")
    );

    await expect(callActive).toHaveBeenCalledTimes(1);
  },
};

export const ThrottlesTheBurst: Story = {
  name: "Throttles a burst of input to one call",
  play: async ({ canvasElement }) => {
    const window = canvasElement.ownerDocument.defaultView;

    if (window === null) throw new Error("the story ran without a window");

    // Wait for the mount read to settle before the burst.
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(1));

    // A dense burst of real input: pointer, keyboard, and touch inside one throttle window.
    fire(window, "pointerdown");
    fire(window, "keydown");
    fire(window, "touchstart");
    fire(window, "pointerdown");

    // The leading call fires and the rest of the burst is swallowed: two calls total, the
    // mount read and the one activity call (R-15).
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(2));

    await expect(callActive).toHaveBeenCalledTimes(2);
  },
};

export const LandsTheExpiredSession: Story = {
  name: "Lands an expired session on the sign-in state, once",
  args: {
    call: callExpired,
  },
  play: async ({ canvasElement }) => {
    const window = canvasElement.ownerDocument.defaultView;

    if (window === null) throw new Error("the story ran without a window");

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledTimes(1));

    // Later input does not navigate again: the session is gone.
    fire(window, "pointerdown");
    fire(window, "pointerdown");

    await expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    await expect(callExpired).toHaveBeenCalledTimes(1);
  },
};
