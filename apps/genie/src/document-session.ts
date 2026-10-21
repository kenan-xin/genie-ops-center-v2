import type { AuthSessionState, RequestPrincipal } from "@genie/core";
import { headers } from "next/headers.js";
import { cache } from "react";

import { requireAuth } from "./auth.ts";
import { requireContext } from "./context.ts";
import { principalForSession } from "./request-principal.ts";

/**
 * The one enforced session read of a server-rendered request (R-14). The root layout and the page
 * render in parallel. Two independent reads could disagree: one made just before the idle
 * boundary says live and one made just after says idle, so the layout and the page would decide
 * differently (genie-ops-center-v2-pt9d). React's request-scoped `cache` hands every server
 * component of one request the first read's promise, so the request makes one decision and pays
 * for one read, and the layout's redirect and the page's principal agree on it.
 *
 * Outside a render (a route handler, a server action) `cache` is a plain call. Route handlers
 * therefore read through the auth member directly: each makes its reads one after another.
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
