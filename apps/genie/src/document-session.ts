import type { AuthSessionState, RequestPrincipal } from "@genie/core";
import { headers } from "next/headers.js";
import { cache } from "react";

import { requireAuth } from "./auth.ts";
import { requireContext } from "./context.ts";
import { principalForSession } from "./request-principal.ts";

/**
 * The one enforced session read of a server-rendered request (R-14). The root layout and the page
 * render in parallel, and the read that finds a session past the idle window deletes its row. Two
 * independent reads therefore race: the one that selects after the other deleted finds no row and
 * answers anonymous, and when that loser is the layout it renders the document instead of
 * redirecting to the session-expired route (genie-ops-center-v2-pt9d). React's request-scoped
 * `cache` hands every server component of one request the first read's promise, so the request
 * makes one decision, and the layout's redirect and the page's principal agree on it.
 *
 * Route handlers read through the auth member directly: each makes one read per request.
 */
export const documentSessionState = cache(async (): Promise<AuthSessionState> =>
  requireAuth(requireContext().tenant).sessionState({
    headers: await headers(),
  })
);

/** The request principal (R-27) built from the request's one enforced read. */
export async function documentPrincipal(): Promise<RequestPrincipal> {
  const state = await documentSessionState();

  return principalForSession(
    requireContext().tenant,
    state.status === "authenticated" ? state.session : null
  );
}
