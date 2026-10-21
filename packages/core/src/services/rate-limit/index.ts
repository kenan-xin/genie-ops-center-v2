import type { TenantContext } from "../../lib/tenant-context/index.ts";

/**
 * The fixed-window rate limits of R-19 to R-21 (DEC-31). Four endpoints are limited: add person,
 * resend set-password email, resend invitation, and break-glass sign-in. The window length and the
 * count are constants here, not tenant settings, because no document sets them and they are
 * reversible (Spec 2 assumptions).
 *
 * The counter row is `rate_limit_window`, keyed on `(endpoint, subject, window_start)`. A consume
 * clears the subject's rows for any other window and then upserts the current one, so exactly one
 * row exists per `(endpoint, subject)` and the next window overwrites it rather than creating a
 * second; that is why no sweeper job exists (AC-6).
 */

/** The four limited endpoints. */
export type RateLimitEndpoint =
  | "add_person"
  | "resend_set_password"
  | "resend_invitation"
  | "break_glass_sign_in"
  | "break_glass_password";

/** What a subject names, recorded in the `auth:rate_limited` audit row (R-21). */
export type RateLimitSubjectKind = "actor" | "target" | "deployment";

export type RateLimitRule = {
  readonly endpoint: RateLimitEndpoint;
  readonly limit: number;
  readonly windowMs: number;
  readonly subjectKind: RateLimitSubjectKind;
};

const MINUTE_MS = 60_000;

const HOUR_MS = 60 * MINUTE_MS;

/**
 * The four rules and their defaults (Spec 2 assumptions): add person 30 in one hour per acting
 * person, resend set-password 3 in one hour per target person, resend invitation 3 in one hour per
 * target person, and break-glass sign-in 10 in fifteen minutes per deployment.
 */
export const RATE_LIMIT_RULES: Readonly<
  Record<RateLimitEndpoint, RateLimitRule>
> = {
  add_person: {
    endpoint: "add_person",
    limit: 30,
    windowMs: HOUR_MS,
    subjectKind: "actor",
  },
  resend_set_password: {
    endpoint: "resend_set_password",
    limit: 3,
    windowMs: HOUR_MS,
    subjectKind: "target",
  },
  resend_invitation: {
    endpoint: "resend_invitation",
    limit: 3,
    windowMs: HOUR_MS,
    subjectKind: "target",
  },
  break_glass_sign_in: {
    endpoint: "break_glass_sign_in",
    limit: 10,
    windowMs: 15 * MINUTE_MS,
    subjectKind: "deployment",
  },
  // S2-09 review S3: the break-glass password checks (change password, enable and disable the
  // authenticator) are refused past their own per-account window, so a held break-glass session
  // cannot brute-force the current password at Better Auth's endpoints.
  break_glass_password: {
    endpoint: "break_glass_password",
    limit: 5,
    windowMs: 15 * MINUTE_MS,
    subjectKind: "target",
  },
};

/** Break-glass sign-in is limited per deployment, not per person or address (R-20). */
export const DEPLOYMENT_RATE_LIMIT_SUBJECT = "deployment";

/** The window a moment falls in: `now` floored to the window length (R-19). */
export function windowStartFor(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** What one consume answers. A refused consume names the whole minutes until the window ends. */
export type RateLimitDecision =
  | {
      readonly allowed: true;
      readonly endpoint: RateLimitEndpoint;
      readonly count: number;
      readonly limit: number;
    }
  | {
      readonly allowed: false;
      readonly endpoint: RateLimitEndpoint;
      readonly subjectKind: RateLimitSubjectKind;
      readonly count: number;
      readonly limit: number;
      readonly retryAfterMinutes: number;
      readonly windowMinutes: number;
    };

/**
 * The one delete-and-upsert the fixed window uses. The data-modifying CTE runs even though the
 * primary query does not read it, so stale windows for the subject go and exactly one row remains.
 */
const CONSUME_SQL = `
  with cleared as (
    delete from rate_limit_window
     where endpoint = $1 and subject = $2 and window_start <> $3
  )
  insert into rate_limit_window (endpoint, subject, window_start, count)
  values ($1, $2, $3, 1)
  on conflict (endpoint, subject, window_start)
  do update set count = rate_limit_window.count + 1
  returning count`;

/**
 * Consumes one attempt against the endpoint's fixed window, and answers whether it is allowed.
 * The read-modify-write is one statement, so two concurrent attempts cannot both read the same
 * count. `now` is injectable so a test can cross a window without waiting.
 */
export async function consumeRateLimit(
  context: Pick<TenantContext, "db">,
  input: {
    readonly endpoint: RateLimitEndpoint;
    readonly subject: string;
    readonly now?: Date;
  }
): Promise<RateLimitDecision> {
  const rule = RATE_LIMIT_RULES[input.endpoint];
  const now = input.now ?? new Date();
  const windowStart = windowStartFor(now, rule.windowMs);

  const result = await context.db.$client.query<{ count: number }>(
    CONSUME_SQL,
    [rule.endpoint, input.subject, windowStart]
  );

  const count = Number(result.rows[0]?.count ?? 0);

  if (count <= rule.limit) {
    return {
      allowed: true,
      endpoint: rule.endpoint,
      count,
      limit: rule.limit,
    };
  }

  const windowEnd = windowStart.getTime() + rule.windowMs;

  const retryAfterMinutes = Math.max(
    1,
    Math.ceil((windowEnd - now.getTime()) / MINUTE_MS)
  );

  return {
    allowed: false,
    endpoint: rule.endpoint,
    subjectKind: rule.subjectKind,
    count,
    limit: rule.limit,
    retryAfterMinutes,
    windowMinutes: Math.round(rule.windowMs / MINUTE_MS),
  };
}
