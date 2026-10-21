/**
 * The idle rule's pure comparisons (R-14, R-15, R-15a). Nothing here reads the database or the
 * clock; every caller passes its own `now`, so the refusal boundary and the throttle window are
 * unit-testable and the request path stays the only place a decision is applied.
 */

/** The idle window's expiry: the last activity plus the tenant's idle minutes. */
export function idleExpiry(input: {
  readonly lastActivityAt: Date;
  readonly idleMinutes: number;
}): Date {
  return new Date(input.lastActivityAt.getTime() + input.idleMinutes * 60_000);
}

/** Half the idle window in milliseconds, the throttle the browser's activity call uses (R-15). */
export function activityThrottleWaitMs(idleMinutes: number): number {
  return (idleMinutes * 60_000) / 2;
}

/**
 * True when the idle window has closed. The boundary is half open: at exactly
 * `last activity + idle minutes` the session is already expired, which is what "refused after
 * the tenant's idle minutes" (AC-5) reads as.
 */
export function isIdleExpired(input: {
  readonly lastActivityAt: Date;
  readonly idleMinutes: number;
  readonly now: Date;
}): boolean {
  return input.now.getTime() >= idleExpiry(input).getTime();
}
