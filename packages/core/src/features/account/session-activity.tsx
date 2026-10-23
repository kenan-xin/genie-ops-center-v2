import { useThrottledCallback } from "@tanstack/react-pacer";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import {
  activityThrottleWaitMs,
  warningLeadMs,
} from "../../services/auth/idle.ts";
import { IdleWarningDialog } from "./idle-warning-dialog.tsx";
import type { IdleWarningStrings } from "./idle-warning-dialog.tsx";

/**
 * What one activity call answered: the live session's new absolute idle expiry (R-15a), or the
 * unauthenticated answer that lands the browser on the session-expired banner (R-14, R-17a).
 */
export type SessionActivityResult =
  | { readonly kind: "active"; readonly idleExpiresAt: string }
  | { readonly kind: "unauthenticated" };

export type SessionActivityProps = {
  /** The tenant's idle window; the throttle wait is half of it (R-15). */
  readonly idleMinutes: number;
  /** The server's read-only initial expiry (R-15a); mounting never records activity. */
  readonly initialIdleExpiresAt: string;
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
  /** Called once when the warning's countdown reaches zero. */
  readonly onIdleExpired: () => void;
};

/**
 * The browser half of the idle rule (R-15). One activity call on pointer, keyboard, or touch
 * input, throttled to half the idle window, plus one unthrottled call on mount so the page that
 * loads already carries the session's idle expiry (R-15a). The calls this component makes are
 * the only writers of the session's last activity time; ordinary request traffic never slides a
 * session, so a background poll cannot keep an unattended browser signed in.
 *
 * An unauthenticated answer navigates once and stops listening: the session is gone, and every
 * later event would only repeat the same answer.
 *
 * The idle warning (R-33) derives from the one expiry this component holds: it opens
 * `warningLeadMs` before it, records no ambient activity while open, and closes only when Stay
 * signed in brings a new expiry.
 */
export function SessionActivity(props: SessionActivityProps): JSX.Element {
  const [idleExpiresAt, setIdleExpiresAt] = useState(
    props.initialIdleExpiresAt
  );

  // The latest transport and navigation, read through refs so the mount effect runs once.
  const transport = useRef(props.call);

  const navigate = useRef(props.onUnauthenticated);

  const expire = useRef(props.onIdleExpired);

  transport.current = props.call;

  navigate.current = props.onUnauthenticated;

  expire.current = props.onIdleExpired;

  const [warning, setWarning] = useState(false);

  // Read by the window listener, which must not rebind on every open and close.
  const warningOpen = useRef(false);

  warningOpen.current = warning;

  const [now, setNow] = useState(Date.now);

  const idleExpired = useRef(false);

  const unauthenticated = useRef(false);

  const call = useCallback(async (): Promise<void> => {
    if (unauthenticated.current) return;

    const result = await transport.current();

    if (result.kind === "active") {
      setIdleExpiresAt(result.idleExpiresAt);

      return;
    }

    // One navigation, ever: the activity route clears the session cookie on its side, and a
    // repeat would reload the page the browser is already on.
    unauthenticated.current = true;

    navigate.current();
  }, []);

  const onActivity = useThrottledCallback(call, {
    wait: activityThrottleWaitMs(props.idleMinutes),
  });

  useEffect(() => {
    const events = ["pointerdown", "keydown", "touchstart"] as const;

    // While the warning is open only Stay signed in extends the session, never ambient input.
    const onWindowActivity = () => {
      if (!warningOpen.current) onActivity();
    };

    for (const event of events) {
      window.addEventListener(event, onWindowActivity, { passive: true });
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, onWindowActivity);
      }
    };
  }, [onActivity]);

  // The one scheduling decision: open now, or once at the warning time. A new expiry reruns it.
  useEffect(() => {
    const wait =
      Date.parse(idleExpiresAt) - warningLeadMs(props.idleMinutes) - Date.now();

    if (wait <= 0) {
      // `now` moves with the opening, so the first frame shows no stale countdown.
      setNow(Date.now());
      setWarning(true);

      return;
    }

    setWarning(false);

    const timer = setTimeout(() => {
      setNow(Date.now());
      setWarning(true);
    }, wait);

    return () => clearTimeout(timer);
  }, [idleExpiresAt, props.idleMinutes]);

  // The countdown: one interval while open. At zero it ends the session once and stops.
  useEffect(() => {
    if (!warning) return;

    const expiresAt = Date.parse(idleExpiresAt);

    let interval: ReturnType<typeof setInterval> | undefined;

    const tick = () => {
      const current = Date.now();

      setNow(current);

      if (current < expiresAt || idleExpired.current) return;

      idleExpired.current = true;

      clearInterval(interval);

      expire.current();
    };

    tick();

    if (idleExpired.current) return;

    interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [warning, idleExpiresAt]);

  const staySignedIn = () => {
    // Direct and unthrottled. A transient failure throws and leaves the warning open, so the
    // person can try again before the countdown ends.
    call().catch(() => undefined);
  };

  // R-15a: the expiry the client holds, as an absolute time, on a hidden element the end-to-end
  // tests read. The warning reads the same value from state, not from this element.
  return (
    <>
      <span data-session-idle-expiry={idleExpiresAt} hidden />
      <IdleWarningDialog
        open={warning}
        remainingMs={Date.parse(idleExpiresAt) - now}
        strings={props.warning}
        signOutAction={props.signOutAction}
        onStaySignedIn={staySignedIn}
      />
    </>
  );
}
