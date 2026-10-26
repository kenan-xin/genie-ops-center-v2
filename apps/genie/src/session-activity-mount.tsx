"use client";

import { SessionActivity } from "@genie/core/features/account";
import type { SessionActivityResult } from "@genie/core/features/account";
import { useTranslations } from "next-intl";

/**
 * The application's wiring of the activity client (R-15): the transport posts the real activity
 * route and classifies its status, and an unauthenticated answer lands the browser on the
 * sign-in page's session-expired state (R-14, R-17a). The route clears the session cookie on
 * that answer, so the navigation cannot loop.
 */
async function postActivity(): Promise<SessionActivityResult> {
  const response = await fetch("/api/session/activity", { method: "POST" });

  // Read to the end: Chromium keeps a fetch open while its chunked body is unread, and the open
  // request holds a keep-alive connection.
  await response.arrayBuffer();

  if (response.status === 401) return { kind: "unauthenticated" };

  if (!response.ok) {
    // A transient failure throws: the next throttled call retries, and Stay signed in shows its
    // inline error.
    throw new Error(`the activity call was refused (${response.status}).`);
  }

  return { kind: "active" };
}

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
      onUnauthenticated={() => {
        window.location.assign("/sign-in?error=session_expired");
      }}
      warning={{
        title: t("title"),
        description: t("description", { idleMinutes: props.idleMinutes }),
        countdownLabel: t("countdownLabel"),
        staySignedIn: t("staySignedIn"),
        signOutNow: t("signOutNow"),
        stayFailed: t("stayFailed"),
      }}
      signOutAction="/api/auth/sign-out"
      idleSignOutAction="/api/auth/sign-out?idle=1"
    />
  );
}
