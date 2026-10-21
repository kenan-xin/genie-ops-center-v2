/**
 * The limited-session rule of R-30 and R-65, shared by the request path (which refuses a limited
 * break-glass session) and the pages (which show the limited-session page and pick the next
 * break-glass card). It is pure, so both the server and the browser feature can read it.
 */

/** The three account flags the limited rule reads (R-30). */
export type BreakGlassFacts = {
  readonly isBreakGlass: boolean;
  readonly mustChangePassword: boolean;
  readonly twoFactorEnabled: boolean;
};

/**
 * True while the break-glass account still has to change its password or enroll an authenticator.
 * Until both are done its session is limited: `can()` refuses everything and every route answers
 * the limited-session page except the two endpoints that clear the conditions (R-30, R-65).
 */
export function isLimitedBreakGlass(input: BreakGlassFacts): boolean {
  if (!input.isBreakGlass) return false;

  return input.mustChangePassword || !input.twoFactorEnabled;
}

/**
 * The four cards the break-glass door can show, and the door's order (design B9). They live here,
 * apart from the browser components, so a server component can read the order without importing a
 * client module.
 */
export type BreakGlassStep =
  | "credentials"
  | "authenticator-code"
  | "change-password"
  | "authenticator-enroll";

/** The door order: credentials, then the code or the two forced steps. */
export function breakGlassSteps(input: {
  readonly mustChangePassword: boolean;
  readonly mustEnrollAuthenticator: boolean;
}): BreakGlassStep[] {
  return [
    "credentials",
    ...(input.mustEnrollAuthenticator
      ? ([] as const)
      : (["authenticator-code"] as const)),
    ...(input.mustChangePassword ? (["change-password"] as const) : []),
    ...(input.mustEnrollAuthenticator
      ? (["authenticator-enroll"] as const)
      : []),
  ];
}

/**
 * The two endpoints that clear a limited break-glass session (R-30, DEC-24): the password change
 * and the authenticator confirmation. Every other route refuses while the session is limited, and
 * the member's hooks allow only these two plus the enrollment start they depend on.
 */
export const LIMITED_SESSION_CLEARING_ENDPOINTS = [
  "/change-password",
  "/two-factor/verify-totp",
] as const;

/** The first step a limited break-glass session still has to pass (R-65). */
export function breakGlassNextStep(
  input: BreakGlassFacts
): "password" | "enroll" | "done" {
  if (input.mustChangePassword) return "password";

  if (!input.twoFactorEnabled) return "enroll";

  return "done";
}
