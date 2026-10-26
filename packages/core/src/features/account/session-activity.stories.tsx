import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { SessionActivity } from "./session-activity.tsx";
import type { SessionActivityResult } from "./session-activity.tsx";

/**
 * The browser idle count (Spec 02 R-15, R-15a, Spec 3 R-33) on a 7.5 second window (0.125
 * minutes): the warning opens 3.75 seconds after the last input, the idle sign-out posts 3.75
 * seconds later, and the activity throttle waits 3.75 seconds. The transports are module-level
 * spies. A `submit` listener records each form the component posts and stops the navigation, and
 * `Date.now` carries an offset the plays move to change the browser clock.
 */
const HOUR = 3_600_000;

const IDLE_SIGN_OUT = /\/api\/auth\/sign-out\?idle=1$/;

const STAY_FAILED =
  "We could not reach the server. Check your connection and try again.";

const callActive = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "active" })
);

const callExpired = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "unauthenticated" })
);

const callOffline = fn((): Promise<SessionActivityResult> =>
  Promise.reject(new Error("offline"))
);

/** Unauthenticated unless a story queues a live answer first. */
const callEndsAfterMount = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "unauthenticated" })
);

const onUnauthenticated = fn();

/** The forms the component posted during the story. */
const submitted: { method: string; action: string }[] = [];

/** The unhandled rejections of the story that records them. */
const rejections: unknown[] = [];

/** How far `Date.now` is from the real wall clock. `performance.now` never moves. */
let wallOffset = 0;

/** When the story started, on the monotonic clock. The mount follows within milliseconds. */
let startedAt = 0;

const meta = {
  title: "Core/Account page/Session activity",
  component: SessionActivity,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The browser idle count. It counts the idle window from the last pointer, keyboard, or touch input, warns before the end, and shares one count across the tabs of the browser. Input slides the server session through one throttled activity call with a trailing call, and a load makes the first one. When the count ends, it posts the idle sign-out, which lands on the sign-in page's session-expired state.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    idleMinutes: 0.125,
    call: callActive,
    onUnauthenticated,
    warning: {
      title: "Still there?",
      description:
        "You have been inactive for a while. For your security, this session ends after 15 minutes without activity.",
      countdownLabel: "Signing out in",
      staySignedIn: "Stay signed in",
      signOutNow: "Sign out now",
      stayFailed: STAY_FAILED,
    },
    signOutAction: "/api/auth/sign-out",
    idleSignOutAction: "/api/auth/sign-out?idle=1",
  },
  beforeEach: () => {
    submitted.length = 0;
    wallOffset = 0;
    startedAt = performance.now();

    const realNow = Date.now;

    Date.now = () => realNow.call(Date) + wallOffset;

    const record = (event: SubmitEvent) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) return;

      submitted.push({ method: form.method, action: form.action });
      event.preventDefault();
    };

    document.addEventListener("submit", record);

    return () => {
      Date.now = realNow;
      document.removeEventListener("submit", record);
    };
  },
} satisfies Meta<typeof SessionActivity>;

export default meta;

type Story = StoryObj<typeof meta>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Sleeps until `ms` after the story started. */
function at(ms: number): Promise<void> {
  return sleep(startedAt + ms - performance.now());
}

/** Input on `document`, where the idle hook listens. An event on `window` never reaches it. */
function fire(event: string): void {
  document.dispatchEvent(new Event(event));
}

/** The warning, once it opened within `timeout` and finished its entry fade. */
async function openWarning(timeout: number): Promise<HTMLElement> {
  const dialog = await screen.findByRole(
    "dialog",
    { name: "Still there?" },
    { timeout }
  );

  await waitFor(() => expect(dialog).toBeVisible());

  return dialog;
}

/**
 * The warning is still open, read from state, not looks: the wait outlasts the ui Dialog's close
 * fade, and a closing popup either leaves the document or carries `data-ending-style`.
 */
async function expectStillOpen(dialog: HTMLElement): Promise<void> {
  await sleep(500);

  await expect(dialog.isConnected).toBe(true);
  await expect(dialog).toHaveAttribute("data-open");
  await expect(dialog).not.toHaveAttribute("data-ending-style");
}

const idleSignOut = {
  method: "post",
  action: expect.stringMatching(IDLE_SIGN_OUT),
};

/** A browser clock away from the server's at load: the warning opens on time, nothing posts. */
const warnsOnTime: Story["play"] = async () => {
  await at(3_000);

  await expect(screen.queryByRole("dialog")).toBeNull();
  await expect(submitted).toEqual([]);

  await openWarning(2_250);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Stay signed in" })).toHaveFocus()
  );
  await expect(submitted).toEqual([]);
};

export const ClockAheadAtLoad: Story = {
  name: "A browser clock ahead of the server warns on time",
  beforeEach: () => {
    wallOffset = HOUR;
  },
  play: warnsOnTime,
};

export const ClockBehindAtLoad: Story = {
  name: "A browser clock behind the server warns on time",
  beforeEach: () => {
    wallOffset = -HOUR;
  },
  play: warnsOnTime,
};

export const ClockForwardThenInput: Story = {
  name: "A clock set forward does not sign out at the next input",
  play: async () => {
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(1));

    wallOffset = HOUR;
    fire("pointerdown");

    await sleep(500);
    await expect(screen.queryByRole("dialog")).toBeNull();
    await expect(submitted).toEqual([]);

    // The count restarted at the input.
    await openWarning(4_250);
  },
};

export const ClockForwardWithoutInput: Story = {
  name: "A clock set forward does not sign out without input",
  play: async () => {
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(1));

    wallOffset = HOUR;

    // Past the warning time: the hook reads the step as idle time and skips the warning.
    await at(4_750);
    await expect(screen.queryByRole("dialog")).toBeNull();
    await expect(submitted).toEqual([]);

    // The count restarted, and the tab still hears input.
    fire("pointerdown");
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(2), {
      timeout: 500,
    });
  },
};

export const ClockBackWhileOpen: Story = {
  name: "A clock set back holds neither the activity call nor the countdown",
  play: async () => {
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(1));

    wallOffset = -HOUR;
    fire("pointerdown");

    // A leading call at once. Without the clock check, the throttle waits one more hour.
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(2), {
      timeout: 500,
    });

    await openWarning(4_750);

    // A second step while the warning is open moves neither the countdown nor the sign-out.
    wallOffset = -2 * HOUR;

    await sleep(1_100);
    await expect(screen.getByRole("timer")).toHaveTextContent(/^0:0[0-4]$/);
    await waitFor(() => expect(submitted).toEqual([idleSignOut]), {
      timeout: 4_150,
    });
  },
};

export const ThrottlesWithATrailingCall: Story = {
  name: "Throttles input to half the window, with a trailing call",
  play: async () => {
    // The mount call is the throttle's leading call (R-15a).
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(1));

    await at(1_000);
    fire("pointerdown");
    fire("keydown");
    fire("touchstart");
    fire("pointerdown");

    await sleep(300);
    await expect(callActive).toHaveBeenCalledTimes(1);

    // The trailing call keeps the server window open longer than the browser count.
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(2), {
      timeout: 3_450,
    });
  },
};

export const StaySignedInCallsDirectly: Story = {
  name: "Stay signed in calls at once and restarts the count",
  play: async () => {
    await at(1_000);
    fire("pointerdown");

    // The input's trailing call comes at 3.75 seconds, and the warning opens near 4.75 seconds.
    await openWarning(4_250);
    await expect(callActive).toHaveBeenCalledTimes(2);

    await userEvent.click(
      screen.getByRole("button", { name: "Stay signed in" })
    );

    // Unthrottled: a throttled call would wait until 7.5 seconds.
    await waitFor(() => expect(callActive).toHaveBeenCalledTimes(3), {
      timeout: 300,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The count restarted at the click, so the warning returns one count later.
    await sleep(3_000);
    await expect(screen.queryByRole("dialog")).toBeNull();
    await openWarning(2_250);
  },
};

export const IgnoresActivityWhileWarning: Story = {
  name: "Records no activity while the warning is open",
  play: async () => {
    const dialog = await openWarning(4_750);

    const before = callActive.mock.calls.length;

    // Ambient input must not extend the session silently: only Stay signed in does.
    fire("keydown");
    fire("pointerdown");

    await expectStillOpen(dialog);
    await expect(callActive).toHaveBeenCalledTimes(before);
  },
};

export const StaySignedInFailureShowsAnError: Story = {
  name: "A failed Stay signed in shows an inline error",
  args: { call: callOffline },
  beforeEach: () => {
    rejections.length = 0;

    const record = (event: PromiseRejectionEvent) => {
      rejections.push(event.reason);
      event.preventDefault();
    };

    window.addEventListener("unhandledrejection", record);

    return () => {
      window.removeEventListener("unhandledrejection", record);
    };
  },
  play: async () => {
    const dialog = await openWarning(4_750);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Stay signed in" })
    );

    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      STAY_FAILED
    );
    await expectStillOpen(dialog);

    // The mount call failed too, through the throttle, and its rejection was handled.
    await expect(rejections).toEqual([]);
  },
};

export const StaySignedInAfterTheSessionEnded: Story = {
  name: "Stay signed in after the session ended elsewhere lands once, without an error",
  args: { call: callEndsAfterMount },
  beforeEach: () => {
    callEndsAfterMount.mockResolvedValueOnce({ kind: "active" });
  },
  play: async () => {
    const dialog = await openWarning(4_750);

    // The mount call answered live.
    await expect(onUnauthenticated).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Stay signed in" })
    );

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledTimes(1));
    await sleep(500);
    await expect(within(dialog).queryByRole("alert")).toBeNull();
  },
};

export const WaitsForTheNetworkToSignOut: Story = {
  name: "Posts the idle sign-out once the browser is back online",
  beforeEach: () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });

    return () => {
      Reflect.deleteProperty(navigator, "onLine");
    };
  },
  play: async () => {
    await openWarning(4_750);

    // The count ended at 7.5 seconds, offline.
    await at(8_500);
    await expect(submitted).toEqual([]);

    Reflect.deleteProperty(navigator, "onLine");
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(submitted).toEqual([idleSignOut]));
  },
};

export const SignsOutWhenTheCountEnds: Story = {
  name: "Posts the idle sign-out once when the count ends",
  play: async () => {
    await openWarning(4_750);

    await waitFor(() => expect(submitted).toEqual([idleSignOut]), {
      timeout: 4_800,
    });

    await sleep(1_000);
    await expect(submitted).toHaveLength(1);
  },
};

export const LandsTheExpiredSession: Story = {
  name: "Lands an expired session on the sign-in state, once",
  args: { call: callExpired },
  play: async () => {
    // The mount call answered unauthenticated.
    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledTimes(1));

    // Later input, past the throttle window, neither calls nor navigates: the session is gone.
    fire("pointerdown");
    fire("pointerdown");
    await at(4_250);

    await expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    await expect(callExpired).toHaveBeenCalledTimes(1);
  },
};

export const EscapeIsInert: Story = {
  name: "Escape does not dismiss the warning",
  play: async () => {
    const dialog = await openWarning(4_750);

    await userEvent.keyboard("{Escape}");

    await expectStillOpen(dialog);
  },
};

export const SignOutNowPosts: Story = {
  name: "Sign out now posts the sign-out form",
  play: async () => {
    await openWarning(4_750);

    await userEvent.click(screen.getByRole("button", { name: "Sign out now" }));

    await expect(submitted).toEqual([
      {
        method: "post",
        action: expect.stringMatching(/\/api\/auth\/sign-out$/),
      },
    ]);
  },
};

export const WarningPhone: Story = {
  name: "Warning on a phone",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async () => {
    await openWarning(4_750);
  },
};
