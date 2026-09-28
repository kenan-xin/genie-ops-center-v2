import { useThrottledCallback } from "@tanstack/react-pacer";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import { activityThrottleWaitMs } from "../../services/auth/idle.ts";

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
  /**
   * The transport, injected so the Storybook host asserts the call pattern without a network:
   * the application posts `/api/session/activity` and classifies the answer.
   */
  readonly call: () => Promise<SessionActivityResult>;
  /** Where an unauthenticated answer lands the browser: the sign-in page's expired state. */
  readonly onUnauthenticated: () => void;
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
 */
export function SessionActivity(props: SessionActivityProps): JSX.Element {
  const [idleExpiresAt, setIdleExpiresAt] = useState<string | null>(null);

  // The latest transport and navigation, read through refs so the mount effect runs once.
  const transport = useRef(props.call);

  const navigate = useRef(props.onUnauthenticated);

  transport.current = props.call;

  navigate.current = props.onUnauthenticated;

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

  // The one read on mount exposes the absolute expiry to the client (R-15a).
  useEffect(() => {
    void call();
  }, [call]);

  const onActivity = useThrottledCallback(call, {
    wait: activityThrottleWaitMs(props.idleMinutes),
  });

  useEffect(() => {
    const events = ["pointerdown", "keydown", "touchstart"] as const;

    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [onActivity]);

  // R-15a: the expiry the client holds, as an absolute time, on a hidden element Section 3's
  // warning and the tests read. Nothing visible renders.
  return <span data-session-idle-expiry={idleExpiresAt ?? undefined} hidden />;
}
