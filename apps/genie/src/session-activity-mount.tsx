"use client";

import { SessionActivity } from "@genie/core/features/account";
import type { SessionActivityResult } from "@genie/core/features/account";
import { z } from "zod";

/** The activity route's answer, parsed at the boundary. */
const activityAnswer = z.object({ idleExpiresAt: z.string() });

/**
 * The application's wiring of the activity client (R-15): the transport posts the real activity
 * route and classifies its answer, and an unauthenticated answer lands the browser on the
 * sign-in page's session-expired state (R-14, R-17a). The route clears the session cookie on
 * that answer, so the navigation cannot loop.
 */
async function postActivity(): Promise<SessionActivityResult> {
  const response = await fetch("/api/session/activity", { method: "POST" });

  if (response.status === 401) return { kind: "unauthenticated" };

  if (!response.ok) {
    // A transient failure reads as no answer: the client keeps its last expiry and the next
    // throttled activity call retries.
    throw new Error(`the activity call was refused (${response.status}).`);
  }

  // The route's own handler answers `{ idleExpiresAt }` as JSON, parsed here at the boundary.
  const parsed = activityAnswer.safeParse(await response.json());

  if (!parsed.success) {
    throw new Error("the activity call answered no idle expiry.");
  }

  return { kind: "active", idleExpiresAt: parsed.data.idleExpiresAt };
}

export function SessionActivityMount(props: { readonly idleMinutes: number }) {
  return (
    <SessionActivity
      idleMinutes={props.idleMinutes}
      call={postActivity}
      onUnauthenticated={() => {
        window.location.assign("/sign-in?error=session_expired");
      }}
    />
  );
}
