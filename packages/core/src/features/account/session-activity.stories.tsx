import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";

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

/** The stories' window, 7.5 seconds. */
const IDLE_MINUTES = 0.125;

const callActive = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "active", idleMinutes: IDLE_MINUTES })
);

/** The administrator halved the window after the page loaded: 3.75 seconds. */
const callLowered = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "active", idleMinutes: IDLE_MINUTES / 2 })
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

/** The window read that slides no session, answering the window the page loaded with. */
const readSame = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "active", idleMinutes: IDLE_MINUTES })
);

/** A read whose answer is the given window. */
function readAnswers(idleMinutes: number) {
  return fn((): Promise<SessionActivityResult> =>
    Promise.resolve({ kind: "active", idleMinutes })
  );
}

/** The administrator halved the window: 3.75 seconds. */
const readHalved = readAnswers(IDLE_MINUTES / 2);

/** The administrator doubled the window: 15 seconds. */
const readDoubled = readAnswers(IDLE_MINUTES * 2);

/** The administrator cut the window by a quarter: 5.625 seconds, a 2.8125 second warning. */
const readThreeQuarters = readAnswers(IDLE_MINUTES * 0.75);

/** Three quarters at the first read, then the window the page loaded with. */
const readLoweredOnce = readAnswers(IDLE_MINUTES);

/** The page's window at the first two reads, then half of it. */
const readHalvedThird = readAnswers(IDLE_MINUTES / 2);

const readExpired = fn((): Promise<SessionActivityResult> =>
  Promise.resolve({ kind: "unauthenticated" })
);

/** The cross-tab channel of the idle count: react-idle-timer's `name`. */
const IDLE_CHANNEL = "genie-session-idle";

/** A `message({ warnForMs })` post of react-idle-timer 5.7.3: action 13 carries the data. */
const loweredWarningPost = z.object({
  action: z.literal(13),
  data: z.object({ warnForMs: z.number() }),
});

/** The `warnForMs` of each lowered warning the story's own channel heard. */
const heardWarnings: number[] = [];

/** Listens on the story's own channel, as another tab would. */
function hearWarnings(): () => void {
  heardWarnings.length = 0;

  const channel = new BroadcastChannel(IDLE_CHANNEL);

  // The `{ idleMinutes }` posts of the activity answers fail the parse and are left out.
  channel.addEventListener("message", (event: MessageEvent) => {
    const posted = loweredWarningPost.safeParse(event.data);

    if (posted.success) heardWarnings.push(posted.data.data.warnForMs);
  });

  return () => channel.close();
}

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
    idleMinutes: IDLE_MINUTES,
    call: callActive,
    readWindow: readSame,
    onUnauthenticated,
    warning: {
      title: "Still there?",
      signOutIn: "For your security, you will be signed out in {countdown}.",
      announce: (seconds) => `You will be signed out in ${seconds} seconds.`,
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

export const AdoptsTheAnsweredWindow: Story = {
  name: "Warns on the window the activity call answers, not the one the page loaded with",
  args: { call: callLowered },
  play: async () => {
    await waitFor(() => expect(callLowered).toHaveBeenCalledTimes(1));

    // The answered 3.75 second window warns at 1.875 seconds; the loaded one would wait to 3.75.
    await openWarning(2_750);
    await expect(screen.getByRole("timer")).toHaveTextContent(/^0:0[0-2]$/);
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
    callEndsAfterMount.mockResolvedValueOnce({
      kind: "active",
      idleMinutes: IDLE_MINUTES,
    });
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

export const AnnouncesAtCalmIntervals: Story = {
  name: "Speaks the time at open, not at every tick",
  play: async () => {
    const dialog = await openWarning(4_750);

    const live = dialog.querySelector('[aria-live="polite"]');

    await expect(live).toHaveTextContent(
      "You will be signed out in 4 seconds."
    );

    const timer = within(dialog).getByRole("timer");

    const firstTick = timer.textContent;

    // The timer moves twice, and the live line keeps its words: a 3.75 second lead speaks once.
    await sleep(2_000);
    await expect(timer).not.toHaveTextContent(firstTick ?? "");
    await expect(live).toHaveTextContent(
      "You will be signed out in 4 seconds."
    );
  },
};

export const WarningPhone: Story = {
  name: "Warning on a phone",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async () => {
    const dialog = await openWarning(4_750);

    const stay = within(dialog)
      .getByRole("button", { name: "Stay signed in" })
      .getBoundingClientRect();

    const signOut = within(dialog)
      .getByRole("button", { name: "Sign out now" })
      .getBoundingClientRect();

    // Stacked, full width, the primary on top: no cramped pair at 320 px.
    await expect(stay.bottom).toBeLessThanOrEqual(signOut.top);
    await expect(stay.width).toBe(signOut.width);
    await expect(stay.width).toBeGreaterThan(
      dialog.getBoundingClientRect().width * 0.8
    );
  },
};

export const WarningDark: Story = {
  name: "Warning in dark",
  globals: { theme: "dark" },
  play: async () => {
    await openWarning(4_750);
  },
};

export const ReadLowersTheWindow: Story = {
  name: "A read that lowers the window warns on the lowered end and tells the other tabs",
  args: { readWindow: readHalved },
  beforeEach: hearWarnings,
  play: async () => {
    // The read at 1.875 seconds learns 3.75 seconds: the count ends at 3.75, the old one at 7.5.
    await openWarning(3_000 - (performance.now() - startedAt));
    await waitFor(() => expect(submitted).toEqual([idleSignOut]), {
      timeout: Math.max(0, 5_000 - (performance.now() - startedAt)),
    });

    await expect(heardWarnings).toHaveLength(1);

    const [warnForMs] = heardWarnings;

    await expect(warnForMs).toBeGreaterThanOrEqual(1_000);
    await expect(warnForMs).toBeLessThanOrEqual(2_000);
  },
};

export const ReadRaiseWaits: Story = {
  name: "A read that raises the window changes nothing until the next activity answer",
  args: { readWindow: readDoubled },
  play: async () => {
    await at(7_000);
    await expect(submitted).toEqual([]);

    // The count the tab started with still ends at 7.5 seconds.
    await waitFor(() => expect(submitted).toEqual([idleSignOut]), {
      timeout: 1_500,
    });
  },
};

export const ReadRefusalLands: Story = {
  name: "A read that answers unauthenticated lands the expired session",
  args: { readWindow: readExpired },
  play: async () => {
    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledTimes(1), {
      timeout: 3_000,
    });
  },
};

export const LoweredWarningIgnoresInput: Story = {
  name: "Records no activity while the lowered warning is open",
  args: { readWindow: readThreeQuarters },
  play: async () => {
    // The read at 1.875 seconds learns 5.625 seconds, and the warning opens near 2.8 seconds.
    await openWarning(3_000 - (performance.now() - startedAt));

    await at(3_000);
    fire("keydown");

    // A recorded input would make the throttle's trailing call at 3.75 seconds.
    await at(4_500);
    await expect(callActive).toHaveBeenCalledTimes(1);
  },
};

export const StaySignedInEndsTheLoweredCount: Story = {
  name: "Stay signed in ends the lowered count",
  args: { readWindow: readLoweredOnce },
  beforeEach: () => {
    readLoweredOnce.mockResolvedValueOnce({
      kind: "active",
      idleMinutes: IDLE_MINUTES * 0.75,
    });
  },
  play: async () => {
    const dialog = await openWarning(3_500);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Stay signed in" })
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: Math.max(0, 4_000 - (performance.now() - startedAt)),
    });

    // The lowered count would have ended at 5.625 seconds.
    await at(6_500);
    await expect(submitted).toEqual([]);
  },
};

export const InputBeforeTheLoweredWarningMovesIt: Story = {
  name: "Input after the read and before the lowered warning moves the warning",
  args: { readWindow: readThreeQuarters },
  play: async () => {
    // The throttle's trailing call for this input is due at 3.75 seconds.
    await at(100);
    fire("keydown");

    // The read at 1.875 seconds puts its first check near 2.9 seconds.
    await at(2_500);
    fire("keydown");

    // An end fixed at the read would have opened the warning near 2.9 seconds.
    await at(3_500);
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};

export const AnotherTabOpensTheLoweredWarning: Story = {
  name: "A lowered warning another tab opened shows here and signs out on its end",
  play: async () => {
    const channel = new BroadcastChannel(IDLE_CHANNEL);

    try {
      await at(1_000);

      // The wire format of `message()` in react-idle-timer 5.7.3: action 13 carries the data.
      const post = {
        action: 13,
        token: "another-tab",
        data: { warnForMs: 2_000 },
      };

      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel takes no origin.
      channel.postMessage(post);

      await openWarning(600);
      await waitFor(() => expect(submitted).toEqual([idleSignOut]), {
        timeout: Math.max(0, 3_600 - (performance.now() - startedAt)),
      });
    } finally {
      channel.close();
    }
  },
};

export const ClockForwardBeforeTheLoweredCheck: Story = {
  name: "A clock set forward before the lowered check does not sign out",
  args: { readWindow: readThreeQuarters },
  beforeEach: hearWarnings,
  play: async () => {
    // The read at 1.875 seconds puts its first check near 2.8 seconds.
    await at(2_000);
    wallOffset = HOUR;

    // The step reads as no time left: a 0 ms warning here and in every tab, and the sign-out.
    await at(4_000);
    await expect(submitted).toEqual([]);
    await expect(heardWarnings).toEqual([]);

    // The count restarted at the check, so the lowered warning still comes, near 5.6 seconds,
    // before the hook's own warning near 6.56 seconds.
    await openWarning(6_200 - (performance.now() - startedAt));
  },
};

export const ClockForwardWhileTheWarningShows: Story = {
  name: "A clock set forward and a lowering read keep the open warning",
  args: { readWindow: readHalvedThird },
  beforeEach: () => {
    const page = { kind: "active", idleMinutes: IDLE_MINUTES } as const;

    readHalvedThird.mockResolvedValueOnce(page).mockResolvedValueOnce(page);
  },
  play: async () => {
    const dialog = await openWarning(4_750);

    // The read at 5.625 seconds lowers the window after the step.
    await at(5_000);
    wallOffset = HOUR;

    // Only Stay signed in closes the warning (R-33): no restart of the count, no activity call.
    await at(7_000);
    await expect(dialog.isConnected).toBe(true);
    await expect(dialog).toHaveAttribute("data-open");
    await expect(callActive).toHaveBeenCalledTimes(1);
  },
};
