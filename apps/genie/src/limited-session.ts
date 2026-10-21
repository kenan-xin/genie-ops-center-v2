import { isLimitedBreakGlass, type AuthMember } from "@genie/core";

/**
 * The limited-session refusal for the app-owned state-changing routes that do not go through
 * `can()` (R-30): the two own-session routes. The break-glass door and the two clearing endpoints
 * (`/change-password`, `/two-factor/verify-totp`) are the only surfaces that answer while the
 * session is limited; everything else refuses.
 */
export const LIMITED_SESSION_CODE = "limited-session";

export async function refuseLimitedSession(
  auth: AuthMember,
  headers: Headers
): Promise<Response | null> {
  const state = await auth.sessionState({ headers });

  if (
    state.status !== "authenticated" ||
    !isLimitedBreakGlass(state.session.user)
  )
    return null;

  return Response.json(
    {
      code: LIMITED_SESSION_CODE,
      message: "Finish setting up your account before using this.",
    },
    { status: 403, headers: { "cache-control": "no-store" } }
  );
}
