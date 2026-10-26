import { useThrottler } from "@tanstack/react-pacer";
import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { useIdleTimer } from "react-idle-timer";

import {
  activityThrottleWaitMs,
  warningLeadMs,
} from "../../services/auth/idle.ts";
import { IdleWarningDialog } from "./idle-warning-dialog.tsx";
import type { IdleWarningStrings } from "./idle-warning-dialog.tsx";

/**
 * What one activity call answered: the live session slid (R-15), or the unauthenticated answer
 * that lands the browser on the session-expired banner (R-14, R-17a).
 */
export type SessionActivityResult =
  | { readonly kind: "active" }
  | { readonly kind: "unauthenticated" };

export type SessionActivityProps = {
  /** The tenant's idle window; the throttle wait is half of it (R-15). */
  readonly idleMinutes: number;
  /**
   * The transport, injected so the Storybook host asserts the call pattern without a network:
   * the application posts `/api/session/activity` and classifies the answer.
   */
  readonly call: () => Promise<SessionActivityResult>;
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
 * The browser half of the idle rule (R-15, R-15a). The browser counts the idle window from the
 * last pointer, keyboard, or touch input on its own clock, and one count serves every tab of the
 * browser. Input slides the server session through one activity call, throttled to half the
 * window with a trailing call, so the server window never closes before the browser count. The
 * mount makes the throttle's leading call, so a document load starts both counts together. These
 * calls are the only writers of the session's last activity time.
 *
 * The warning (R-33) opens before the count ends, records no ambient input, and closes only when
 * Stay signed in reaches the server. When the count ends, the idle sign-out posts once the
 * browser is online (R-17). The server's own idle rule (R-14) stays the backstop.
 *
 * Both libraries measure time with `Date.now()`, so a changed wall clock reads as idle time or as
 * no time at all. The clock check restarts the count after such a step instead.
 */
export function SessionActivity(props: SessionActivityProps): JSX.Element {
  // The latest transport and navigation, read through refs by handlers that outlive a render.
  const transport = useRef(props.call);

  const navigate = useRef(props.onUnauthenticated);

  transport.current = props.call;

  navigate.current = props.onUnauthenticated;

  const unauthenticated = useRef(false);

  const [open, setOpen] = useState(false);

  const [remainingMs, setRemainingMs] = useState(0);

  const [failed, setFailed] = useState(false);

  // When this tab opened the warning, on the monotonic clock; undefined while it is closed.
  const promptedAt = useRef<number | undefined>(undefined);

  // Wall clock minus monotonic clock. It moves only when the wall clock is set, or while some
  // devices sleep.
  const wallOffset = useRef(Date.now() - performance.now());

  const idleForm = useRef<HTMLFormElement>(null);

  const postIdleSignOut = () => idleForm.current?.requestSubmit();

  const leadMs = warningLeadMs(props.idleMinutes);

  const send = async (): Promise<SessionActivityResult["kind"]> => {
    if (unauthenticated.current) return "unauthenticated";

    const { kind } = await transport.current();

    // One navigation, ever: the activity route clears the session cookie on its side, and a
    // repeat would reload the page the browser is already on.
    if (kind === "unauthenticated" && !unauthenticated.current) {
      unauthenticated.current = true;

      navigate.current();
    }

    return kind;
  };

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
    { wait: activityThrottleWaitMs(props.idleMinutes) }
  );

  const { activate, isPrompted, reset } = useIdleTimer({
    timeout: props.idleMinutes * 60_000,
    promptBeforeIdle: leadMs,
    crossTab: true,
    syncTimers: 200,
    events: ["pointerdown", "keydown", "touchstart"],
    eventsThrottle: 0,
    stopOnIdle: true,
    name: "genie-session-idle",
    onPrompt: () => {
      promptedAt.current = performance.now();

      setRemainingMs(leadMs);
      setFailed(false);
      setOpen(true);
    },
    onActive: () => {
      promptedAt.current = undefined;

      setFailed(false);
      setOpen(false);
    },
    onAction: () => {
      // While the warning is open, only Stay signed in extends the session (R-33).
      if (isPrompted()) return;

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
      if (promptedAt.current === undefined && clockStepped()) {
        queueMicrotask(reset);

        return;
      }

      if (navigator.onLine) postIdleSignOut();
      else window.addEventListener("online", postIdleSignOut, { once: true });
    },
  });

  // The throttle's leading call, so a document load starts both counts together (R-15a).
  useEffect(() => {
    throttler.maybeExecute();
  }, [throttler]);

  // The countdown, on the monotonic clock. A tab that opens restarts the count of the others
  // without `onActive`, so the tick also closes a warning the hook no longer shows.
  useEffect(() => {
    if (!open) return;

    const interval = setInterval(() => {
      if (!isPrompted()) {
        promptedAt.current = undefined;

        setOpen(false);

        return;
      }

      setRemainingMs(
        leadMs - (performance.now() - (promptedAt.current ?? performance.now()))
      );
    }, 1_000);

    return () => clearInterval(interval);
  }, [open, leadMs, isPrompted]);

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
