"use client";

import { idleWindow, SessionActivity } from "@genie/core/features/account";
import type { SessionActivityResult } from "@genie/core/features/account";
import { useTranslations } from "next-intl";

/**
 * The application's wiring of the activity client (R-15): the transports reach the real session
 * routes and classify their status, a live answer carries the tenant's current idle window, and
 * an unauthenticated answer lands the browser on the
 * sign-in page's session-expired state (R-14, R-17a). Both routes clear the session cookie on
 * that answer, so the navigation cannot loop.
 */
async function classify(response: Response): Promise<SessionActivityResult> {
  // Read to the end: Chromium keeps a fetch open while its chunked body is unread, and the open
  // request holds a keep-alive connection.
  const body = await response.text();

  if (response.status === 401) return { kind: "unauthenticated" };

  if (!response.ok) {
    // A transient failure throws: the next throttled call or read retries, and Stay signed in
    // shows its inline error.
    throw new Error(`the session call was refused (${response.status}).`);
  }

  return { kind: "active", ...idleWindow.parse(JSON.parse(body)) };
}

const postActivity = async () =>
  classify(await fetch("/api/session/activity", { method: "POST" }));

/** The read of the window that slides no session (d8l5.53). */
const readWindow = async () => classify(await fetch("/api/session/window"));

/**
 * Sign out now posts the ordinary sign-out (R-17). The idle sign-out carries the idle flag, so
 * the route ends a live session and lands on the session-expired banner (R-15a).
 */
export function SessionActivityMount(props: { readonly idleMinutes: number }) {
  const t = useTranslations("idle");

  return (
    <SessionActivity
      idleMinutes={props.idleMinutes}
      call={postActivity}
      readWindow={readWindow}
      onUnauthenticated={() => {
        window.location.assign("/sign-in?error=session_expired");
      }}
      warning={{
        title: t("title"),
        // The dialog puts its live timer where `{countdown}` stands.
        signOutIn: t("signOutIn", { countdown: "{countdown}" }),
        announce: (seconds) => t("announce", { seconds }),
        staySignedIn: t("staySignedIn"),
        signOutNow: t("signOutNow"),
        stayFailed: t("stayFailed"),
      }}
      signOutAction="/api/auth/sign-out"
      idleSignOutAction="/api/auth/sign-out?idle=1"
    />
  );
}
