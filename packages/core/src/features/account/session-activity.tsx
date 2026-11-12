import { useThrottler } from "@tanstack/react-pacer";
import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { useIdleTimer } from "react-idle-timer";
import { z } from "zod";

import {
  activityThrottleWaitMs,
  loweredEndsInMs,
  warningLeadMs,
  windowReadMs,
} from "../../services/auth/idle.ts";
import { IdleWarningDialog } from "./idle-warning-dialog.tsx";
import type { IdleWarningStrings } from "./idle-warning-dialog.tsx";

/**
 * What one activity call answered: the live session slid (R-15), with the tenant's current idle
 * window, or the unauthenticated answer that lands the browser on the session-expired banner
 * (R-14, R-17a).
 */
export type SessionActivityResult =
  | { readonly kind: "active"; readonly idleMinutes: number }
  | { readonly kind: "unauthenticated" };

export type SessionActivityProps = {
  /**
   * The tenant's idle window when the page loaded. Each live activity answer replaces it in every
   * tab, so a window an administrator changes reaches the tabs that are already open (`6wz1.92`).
   * The throttle wait is half of it, at most 150 seconds (R-15).
   */
  readonly idleMinutes: number;
  /**
   * The transport, injected so the Storybook host asserts the call pattern without a network:
   * the application posts `/api/session/activity` and classifies the answer.
   */
  readonly call: () => Promise<SessionActivityResult>;
  /**
   * The read of the tenant's current window that slides no session (d8l5.53): the application
   * sends `GET /api/session/window`. A lower window moves the warning sooner; a raise waits for
   * the next activity answer.
   */
  readonly readWindow: () => Promise<SessionActivityResult>;
  /** Where an unauthenticated answer lands the browser: the sign-in page's expired state. */
  readonly onUnauthenticated: () => void;
  /** The idle warning's copy (R-33, R-41). */
  readonly warning: IdleWarningStrings;
  /** The sign-out route Sign out now posts to. */
  readonly signOutAction: string;
  /** Where the idle sign-out posts when the count ends (R-17). */
  readonly idleSignOutAction: string;
};

/** A wall-clock step larger than this is a changed clock, not elapsed time. */
const CLOCK_STEP_MS = 1_000;

/**
 * The tenant's current idle window: the body of a live activity answer, and the message one tab
 * sends the others after its answer.
 */
export const idleWindow = z.object({ idleMinutes: z.number().positive() });

/** A tab opened the lowered warning, so every tab shows it with this countdown. */
const loweredWarning = z.object({ warnForMs: z.number().nonnegative() });

/**
 * The browser half of the idle rule (R-15, R-15a). The browser counts the idle window from the
 * last pointer, keyboard, or touch input on its own clock, and one count serves every tab of the
 * browser. Input slides the server session through one activity call, throttled to half the
 * window, at most 150 seconds, with a trailing call, so the server window never closes before
 * the browser count. The mount makes the throttle's leading call, so a document load starts both
 * counts together. These calls are the only writers of the session's last activity time.
 *
 * The warning (R-33) opens before the count ends, records no ambient input, and closes only when
 * Stay signed in reaches the server. When the count ends, the idle sign-out posts once the
 * browser is online (R-17). The server's own idle rule (R-14) stays the backstop.
 *
 * Both libraries measure time with `Date.now()`, so a changed wall clock reads as idle time or as
 * no time at all. The clock check restarts the count after such a step instead.
 *
 * The shared count warns and ends only when every tab agrees, so every tab must count the same
 * window. Each live activity answer carries the tenant's current window, and the tab sends it to
 * the other tabs. A changed window restarts the shared count, which is right, because the answer
 * just slid the server session.
 */
export function SessionActivity(props: SessionActivityProps): JSX.Element {
  // The latest transport and navigation, read through refs by handlers that outlive a render.
  const transport = useRef(props.call);

  const read = useRef(props.readWindow);

  const navigate = useRef(props.onUnauthenticated);

  transport.current = props.call;

  read.current = props.readWindow;

  navigate.current = props.onUnauthenticated;

  const unauthenticated = useRef(false);

  const [open, setOpen] = useState(false);

  const [remainingMs, setRemainingMs] = useState(0);

  const [failed, setFailed] = useState(false);

  const [idleMinutes, setIdleMinutes] = useState(props.idleMinutes);

  // The window the count runs on, for handlers that run before a new window renders.
  const countedMinutes = useRef(idleMinutes);

  // The dialog's countdown when it opened (R-41 speaks it once).
  const [openedLeadMs, setOpenedLeadMs] = useState(0);

  // The end of the hook's warning, on the monotonic clock; undefined while it is closed.
  const promptEndsAt = useRef<number | undefined>(undefined);

  // The lower window a read answered, and the end of its warning once it opened (d8l5.53).
  const loweredMinutes = useRef<number | undefined>(undefined);

  const loweredEndsAt = useRef<number | undefined>(undefined);

  // The lowered check, then the lowered warning's end: one at a time.
  const loweredTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // Wall clock minus monotonic clock. It moves only when the wall clock is set, or while some
  // devices sleep.
  const wallOffset = useRef(Date.now() - performance.now());

  const idleForm = useRef<HTMLFormElement>(null);

  const postIdleSignOut = () => idleForm.current?.requestSubmit();

  const signOutWhenOnline = () => {
    if (navigator.onLine) postIdleSignOut();
    else window.addEventListener("online", postIdleSignOut, { once: true });
  };

  const leadMs = warningLeadMs(idleMinutes);

  const warningShows = () =>
    promptEndsAt.current !== undefined || loweredEndsAt.current !== undefined;

  // The sooner of the hook's end and the lowered end, on the monotonic clock.
  const warningEndsAt = () =>
    Math.min(
      loweredEndsAt.current ?? Infinity,
      promptEndsAt.current ?? Infinity
    );

  /** Opens the warning, or shortens an open one, after `mark` recorded its end. */
  const showWarning = (mark: () => void) => {
    const opening = !warningShows();

    mark();

    const countdown = warningEndsAt() - performance.now();

    if (opening) {
      setOpenedLeadMs(countdown);
      setFailed(false);
    }

    setRemainingMs(countdown);
    setOpen(true);
  };

  const closeUnlessPrompted = () => {
    if (isPrompted()) return;

    promptEndsAt.current = undefined;

    setOpen(false);
  };

  const clearLowered = () => {
    clearTimeout(loweredTimer.current);

    loweredMinutes.current = undefined;
    loweredEndsAt.current = undefined;
  };

  const adoptWindow = (minutes: number) => {
    countedMinutes.current = minutes;

    setIdleMinutes(minutes);
    clearLowered();
    closeUnlessPrompted();
  };

  // One navigation, ever: the routes clear the session cookie on their side, and a repeat would
  // reload the page the browser is already on.
  const land = () => {
    if (unauthenticated.current) return;

    unauthenticated.current = true;

    navigate.current();
  };

  const send = async (): Promise<SessionActivityResult["kind"]> => {
    if (unauthenticated.current) return "unauthenticated";

    const result = await transport.current();

    if (result.kind === "active") {
      adoptWindow(result.idleMinutes);
      // Every answer, not only a change: this tab can hold the new window since its load while
      // an older tab still counts the old one.
      message({ idleMinutes: result.idleMinutes });
    } else {
      clearLowered();
      land();
    }

    return result.kind;
  };

  /** Opens the lowered warning with `endsIn` left, or keeps this tab's sooner end. */
  const openLowered = (endsIn: number) => {
    showWarning(() => {
      loweredEndsAt.current = Math.min(
        loweredEndsAt.current ?? Infinity,
        performance.now() + endsIn
      );
    });

    clearTimeout(loweredTimer.current);

    loweredTimer.current = setTimeout(
      signOutWhenOnline,
      (loweredEndsAt.current ?? 0) - performance.now()
    );
  };

  // Derived at each check from the shared count, because input in any tab restarts it.
  const loweredEndsIn = (lowered: number) =>
    loweredEndsInMs({
      remainingMs: getRemainingTime(),
      countedMinutes: countedMinutes.current,
      loweredMinutes: lowered,
    });

  const checkLowered = () => {
    const lowered = loweredMinutes.current;

    if (lowered === undefined || loweredEndsAt.current !== undefined) return;

    // `getRemainingTime()` runs on `Date.now()`: a clock set forward with no warning shown reads as
    // no time left, so restart the count as `onIdle` does. A step back stays for `onAction`, which
    // also resets the throttle. An open warning closes only on Stay signed in (R-33).
    const offset = Date.now() - performance.now();

    if (!warningShows() && offset - wallOffset.current > CLOCK_STEP_MS) {
      wallOffset.current = offset;

      reset();
    }

    const endsIn = loweredEndsIn(lowered);

    const lead = warningLeadMs(lowered);

    if (endsIn > lead + 1_000) {
      loweredTimer.current = setTimeout(checkLowered, endsIn - lead);

      return;
    }

    openLowered(endsIn);
    message({ warnForMs: endsIn });
  };

  const readAnswered = (result: SessionActivityResult) => {
    if (result.kind === "unauthenticated") {
      land();

      return;
    }

    // A raise waits for the next activity answer, which slides the server session.
    if (
      result.idleMinutes >= (loweredMinutes.current ?? countedMinutes.current)
    )
      return;

    // Only the window, never `setIdleMinutes`: a new `timeout` restarts the shared count from now
    // in every tab, which would end the browser count after the server.
    loweredMinutes.current = result.idleMinutes;

    if (loweredEndsAt.current !== undefined) return;

    // Checked again when it runs, because input in any tab moves the shared count.
    clearTimeout(loweredTimer.current);

    loweredTimer.current = setTimeout(
      checkLowered,
      Math.max(
        0,
        loweredEndsIn(result.idleMinutes) - warningLeadMs(result.idleMinutes)
      )
    );
  };

  const answerRead = useRef(readAnswered);

  answerRead.current = readAnswered;

  const clockStepped = (): boolean => {
    const offset = Date.now() - performance.now();

    const stepped = Math.abs(offset - wallOffset.current) > CLOCK_STEP_MS;

    wallOffset.current = offset;

    return stepped;
  };

  // The next input retries a failed call, so its rejection ends here.
  const throttler = useThrottler(
    () => {
      send().catch(() => undefined);
    },
    { wait: activityThrottleWaitMs(idleMinutes) }
  );

  const { activate, getRemainingTime, isPrompted, message, reset } =
    useIdleTimer({
      timeout: idleMinutes * 60_000,
      promptBeforeIdle: leadMs,
      crossTab: true,
      syncTimers: 200,
      events: ["pointerdown", "keydown", "touchstart"],
      eventsThrottle: 0,
      stopOnIdle: true,
      name: "genie-session-idle",
      onPrompt: () => {
        showWarning(() => {
          promptEndsAt.current = performance.now() + leadMs;
        });
      },
      onMessage: (data) => {
        const sent = idleWindow.safeParse(data);

        if (sent.success) {
          adoptWindow(sent.data.idleMinutes);

          return;
        }

        const warned = loweredWarning.safeParse(data);

        if (warned.success) openLowered(warned.data.warnForMs);
      },
      onActive: () => {
        promptEndsAt.current = undefined;

        setFailed(false);

        if (loweredEndsAt.current === undefined) setOpen(false);
      },
      onAction: () => {
        // While a warning is open, only Stay signed in extends the session (R-33).
        if (isPrompted() || loweredEndsAt.current !== undefined) return;

        if (clockStepped()) {
          reset();
          throttler.cancel();
          throttler.reset();
        }

        throttler.maybeExecute();
      },
      onIdle: () => {
        // A clock step and no warning shown: restart the count and let the server rule decide. The
        // hook marks itself idle after this handler returns, so the reset waits for a microtask.
        if (!warningShows() && clockStepped()) {
          queueMicrotask(reset);

          return;
        }

        signOutWhenOnline();
      },
    });

  // The read of the window, until a navigation (d8l5.53). The next tick retries a rejection.
  useEffect(() => {
    const interval = setInterval(() => {
      if (unauthenticated.current) return;

      read.current().then(
        (result) => answerRead.current(result),
        () => undefined
      );
    }, windowReadMs(idleMinutes));

    return () => clearInterval(interval);
  }, [idleMinutes]);

  useEffect(() => () => clearTimeout(loweredTimer.current), []);

  // The throttle's leading call, so a document load starts both counts together (R-15a).
  useEffect(() => {
    throttler.maybeExecute();
  }, [throttler]);

  // The countdown, on the monotonic clock. A tab that opens restarts the count of the others
  // without `onActive`, so the tick also closes a warning the hook no longer shows.
  useEffect(() => {
    if (!open) return;

    const interval = setInterval(() => {
      if (!isPrompted()) promptEndsAt.current = undefined;

      if (!warningShows()) {
        setOpen(false);

        return;
      }

      setRemainingMs(warningEndsAt() - performance.now());
    }, 1_000);

    return () => clearInterval(interval);
  }, [open, isPrompted]);

  const staySignedIn = () => {
    setFailed(false);

    // Direct and unthrottled. A failure keeps the warning open with an inline error.
    send().then(
      (kind) => {
        if (kind === "active") activate();
      },
      () => setFailed(true)
    );
  };

  return (
    <>
      <IdleWarningDialog
        open={open}
        remainingMs={remainingMs}
        leadMs={openedLeadMs}
        strings={props.warning}
        signOutAction={props.signOutAction}
        failed={failed}
        onStaySignedIn={staySignedIn}
      />
      {/* Outside the dialog, so it stays mounted when no warning is open. */}
      <form
        ref={idleForm}
        method="post"
        action={props.idleSignOutAction}
        hidden
      />
    </>
  );
}
