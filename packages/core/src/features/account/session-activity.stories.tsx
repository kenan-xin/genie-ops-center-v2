import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { JSX } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import { SessionActivity } from "./session-activity.tsx";
import type {
  SessionActivityProps,
  SessionActivityResult,
} from "./session-activity.tsx";

/**
 * The browser activity call (R-15, R-15a): the server supplies the read-only initial expiry, then
 * one call per half idle window no matter how dense the
 * input is, and one navigation to the session-expired state when the answer is unauthenticated.
 * The idle warning (R-33) opens two minutes before the expiry, or at half the window when that
 * is shorter. The transports are module-level spies, so the plays assert the call pattern
 * without any network.
 */
const MINUTE = 60_000;

const inMs = (ms: number): string => new Date(Date.now() + ms).toISOString();

const callActive = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "active", idleExpiresAt: inMs(15 * MINUTE) })
);

const callExpired = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "unauthenticated" })
);

const onUnauthenticated = fn();

const onIdleExpired = fn();

/** Each story's expiry is computed when it renders, so no story runs against a past date. */
function expiringIn(ms: number): (args: SessionActivityProps) => JSX.Element {
  return (args: SessionActivityProps) => (
    <SessionActivity {...args} initialIdleExpiresAt={inMs(ms)} />
  );
}

/** The expiry the hidden span holds, as milliseconds from now. */
function expiryFromNow(canvasElement: HTMLElement): number {
  const value = canvasElement
    .querySelector("[data-session-idle-expiry]")
    ?.getAttribute("data-session-idle-expiry");

  if (value === null || value === undefined)
    throw new Error("the expiry span is missing");

  return Date.parse(value) - Date.now();
}

const meta = {
  title: "Core/Account page/Session activity",
  component: SessionActivity,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The client that slides a live session on real browser activity, warns before the idle expiry, and lands an expired one on the sign-in page's session-expired state. Its calls are the only writers of the session's last activity time.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    idleMinutes: 15,
    initialIdleExpiresAt: "2026-09-28T12:15:00.000Z",
    call: callActive,
    onUnauthenticated,
    warning: {
      title: "Still there?",
      description:
        "You have been inactive for a while. For your security, this session ends after 15 minutes without activity.",
      countdownLabel: "Signing out in",
      staySignedIn: "Stay signed in",
      signOutNow: "Sign out now",
    },
    signOutAction: "/api/auth/sign-out",
    onIdleExpired,
  },
  render: expiringIn(15 * MINUTE),
} satisfies Meta<typeof SessionActivity>;

export default meta;

type Story = StoryObj<typeof meta>;

function fire(window: Window, event: string): void {
  window.dispatchEvent(new Event(event));
}

function windowOf(canvasElement: HTMLElement): Window {
  const window = canvasElement.ownerDocument.defaultView;

  if (window === null) throw new Error("the story ran without a window");

  return window;
}

/** The open warning, once its entry transition (opacity from 0) has finished. */
async function warningDialog(): Promise<HTMLElement> {
  const dialog = await screen.findByRole("dialog", { name: "Still there?" });

  await waitFor(() => expect(dialog).toBeVisible());

  return dialog;
}

/**
 * The warning is still open, read from state, not looks: the wait outlasts the ui Dialog's close
 * fade, and a closing popup either leaves the document or carries `data-ending-style`.
 */
async function expectStillOpen(dialog: HTMLElement): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  await expect(dialog.isConnected).toBe(true);
  await expect(dialog).toHaveAttribute("data-open");
  await expect(dialog).not.toHaveAttribute("data-ending-style");
}

export const ExposesTheIdleExpiry: Story = {
  name: "Exposes the idle expiry",
  play: async ({ canvasElement }) => {
    // The server read supplied the expiry; mount does not call the activity writer (R-15).
    const fromNow = expiryFromNow(canvasElement);

    await expect(fromNow).toBeGreaterThan(14 * MINUTE);
    await expect(fromNow).toBeLessThanOrEqual(15 * MINUTE);
    await expect(callActive).not.toHaveBeenCalled();
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};

export const ThrottlesTheBurst: Story = {
  name: "Throttles a burst of input to one call",
  play: async ({ canvasElement }) => {
    const window = windowOf(canvasElement);

    // A dense burst of real input: pointer, keyboard, and touch inside one throttle window.
    fire(window, "pointerdown");
    fire(window, "keydown");
    fire(window, "touchstart");
    fire(window, "pointerdown");

    // The leading call fires and the rest of the burst is swallowed (R-15).
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(1));

    await expect(callActive).toHaveBeenCalledTimes(1);
  },
};

export const LandsTheExpiredSession: Story = {
  name: "Lands an expired session on the sign-in state, once",
  args: {
    call: callExpired,
  },
  play: async ({ canvasElement }) => {
    const window = windowOf(canvasElement);

    await expect(onUnauthenticated).not.toHaveBeenCalled();

    // Later input does not navigate again: the session is gone.
    fire(window, "pointerdown");
    fire(window, "pointerdown");

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledTimes(1));
    await expect(callExpired).toHaveBeenCalledTimes(1);
  },
};

export const WarnsBeforeExpiry: Story = {
  name: "Warns before the idle expiry",
  render: expiringIn(90_000),
  play: async () => {
    await warningDialog();

    await expect(screen.getByRole("timer")).toHaveTextContent(/^1:[23]\d$/);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Stay signed in" })
      ).toHaveFocus()
    );
  },
};

export const EscapeIsInert: Story = {
  name: "Escape does not dismiss the warning",
  render: expiringIn(90_000),
  play: async () => {
    const dialog = await warningDialog();

    await userEvent.keyboard("{Escape}");

    await expectStillOpen(dialog);
  },
};

const callSpy = fn();

export const IgnoresActivityWhileWarning: Story = {
  name: "Records no activity while the warning is open",
  args: { call: callSpy },
  render: expiringIn(90_000),
  play: async ({ canvasElement }) => {
    const window = windowOf(canvasElement);

    const dialog = await warningDialog();

    // Ambient input must not extend the session silently: only Stay signed in does.
    fire(window, "keydown");
    fire(window, "pointerdown");

    await expectStillOpen(dialog);
    await expect(callSpy).not.toHaveBeenCalled();
  },
};

let extendedTo = "";

const callExtends = fn((): Promise<SessionActivityResult> => {
  extendedTo = inMs(15 * MINUTE);

  return Promise.resolve({ kind: "active", idleExpiresAt: extendedTo });
});

export const StaySignedInExtends: Story = {
  name: "Stay signed in extends the session and closes the warning",
  args: { call: callExtends },
  render: expiringIn(90_000),
  play: async ({ canvasElement }) => {
    await warningDialog();

    await userEvent.click(
      screen.getByRole("button", { name: "Stay signed in" })
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(callExtends).toHaveBeenCalledTimes(1);
    await expect(
      canvasElement.querySelector("[data-session-idle-expiry]")
    ).toHaveAttribute("data-session-idle-expiry", extendedTo);
  },
};

export const SignOutNowPosts: Story = {
  name: "Sign out now posts the sign-out form",
  render: expiringIn(90_000),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const submitted: { method: string; action: string }[] = [];

    const record = (event: Event) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) return;

      submitted.push({ method: form.method, action: form.action });
      event.preventDefault();
    };

    document.addEventListener("submit", record);

    try {
      await warningDialog();
      await userEvent.click(
        screen.getByRole("button", { name: "Sign out now" })
      );

      await expect(submitted).toHaveLength(1);
      await expect(submitted[0]?.method).toBe("post");
      await expect(submitted[0]?.action).toMatch(/\/api\/auth\/sign-out$/);
    } finally {
      document.removeEventListener("submit", record);
    }
  },
};

export const ExpiresAtZero: Story = {
  name: "Ends the session when the countdown reaches zero",
  render: expiringIn(1_500),
  play: async () => {
    await warningDialog();

    await waitFor(() => expect(onIdleExpired).toHaveBeenCalledTimes(1), {
      timeout: 3_000,
    });
  },
};

export const WarningPhone: Story = {
  name: "Warning on a phone",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: expiringIn(90_000),
};
