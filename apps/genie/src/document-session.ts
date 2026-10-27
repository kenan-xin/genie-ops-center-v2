import {
  isLimitedBreakGlass,
  type AuthSession,
  type AuthSessionState,
  type RequestPrincipal,
} from "@genie/core";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";
import { cache } from "react";

import { requireAuth, SESSION_EXPIRED_ROUTE, SIGN_IN_PATH } from "./auth.ts";
import { requireContext } from "./context.ts";
import { principalForSession } from "./request-principal.ts";

/**
 * The one enforced session read of a server-rendered request (R-14). The page's guard, the shell
 * and the root layout's favicon render in parallel. Two independent reads could disagree: one made
 * just before the idle boundary says live and one made just after says idle
 * (genie-ops-center-v2-pt9d). React's request-scoped `cache` hands every server component of one
 * request the first read's promise, so the request makes one decision and pays for one read. The
 * root layout decides nothing with it (ARCH-1).
 *
 * Outside a render (a route handler, a server action) `cache` is a plain call. Route handlers
 * therefore read through the auth member directly: each makes its reads one after another.
 */
export const documentSessionState = cache(async (): Promise<AuthSessionState> =>
  requireAuth(requireContext().tenant).sessionState({
    headers: await headers(),
  })
);

/**
 * The page's session check, the Next.js guide's `verifySession()` (ARCH-1). An idle session goes
 * to the route that clears its cookie, a request without a session goes to the sign-in page, and
 * a limited break-glass session goes to the door, which shows its next unmet step (R-65).
 * Otherwise it returns the session. The door must not call it, or it would redirect to itself. Every page of one request shares one read and one decision,
 * on a full load and on a client-side navigation alike. Route handlers do not call it.
 */
export const requireSession = cache(
  async (
    read: () => Promise<AuthSessionState> = documentSessionState
  ): Promise<AuthSession> => {
    const state = await read();

    if (state.status === "idle-expired") redirect(SESSION_EXPIRED_ROUTE);

    if (state.status === "anonymous") redirect(SIGN_IN_PATH);

    if (isLimitedBreakGlass(state.session.user)) redirect("/admin/login");

    return state.session;
  }
);

/**
 * The request principal (R-27) of the session that `requireSession()` returns, so a page reaches
 * `can()` only with a live session and redirects like `requireSession()` otherwise.
 */
export async function documentPrincipal(): Promise<RequestPrincipal> {
  return principalForSession(requireContext().tenant, await requireSession());
}
