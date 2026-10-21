import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  DEPLOYMENT_RATE_LIMIT_SUBJECT,
  RATE_LIMIT_RULES,
  windowStartFor,
} from "../src/services/rate-limit/index.ts";
import {
  type DisposableDeployment,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The fixed-window rate limits of R-19 to R-21 (DEC-31), against a real Postgres. The window is
 * driven by an injected `now`, so the suite crosses a window without waiting, and the counter is
 * read back from `rate_limit_window` to prove the next window overwrites the row (AC-6).
 */
describe("the fixed-window rate limit against a real database", () => {
  let deployment: DisposableDeployment;

  beforeAll(async () => {
    deployment = await startDisposableDeployment([]);
  }, 120000);

  afterAll(async () => {
    await deployment?.stop();
  });

  async function rows(
    endpoint: string,
    subject: string
  ): Promise<readonly { window_start: Date; count: number }[]> {
    const result = await deployment.context.db.$client.query<{
      window_start: Date;
      count: number;
    }>(
      "select window_start, count from rate_limit_window where endpoint = $1 and subject = $2",
      [endpoint, subject]
    );

    return result.rows;
  }

  it("counts within one window and refuses past the limit", async () => {
    const now = new Date("2026-09-29T10:00:00.000Z");

    const decisions = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the counter is read-modify-write in order
      const decision = await consumeRateLimit(deployment.context, {
        endpoint: "break_glass_sign_in",
        subject: DEPLOYMENT_RATE_LIMIT_SUBJECT,
        now,
      });

      decisions.push(decision);
    }

    // The first ten are allowed and count up; the eleventh is refused (R-19, R-20).
    expect(decisions.slice(0, 10).every((decision) => decision.allowed)).toBe(
      true
    );
    expect(decisions[9]).toMatchObject({ allowed: true, count: 10 });

    const refused = decisions[10];
    expect(refused?.allowed).toBe(false);
    expect(refused).toMatchObject({
      allowed: false,
      subjectKind: "deployment",
      limit: RATE_LIMIT_RULES.break_glass_sign_in.limit,
    });
    // The window is fifteen minutes, and the refusal names the whole minutes left.
    expect(refused?.allowed === false ? refused.retryAfterMinutes : 0).toBe(15);

    const counters = await rows(
      "break_glass_sign_in",
      DEPLOYMENT_RATE_LIMIT_SUBJECT
    );

    expect(counters).toHaveLength(1);
    expect(Number(counters[0]?.count)).toBe(11);
  });

  it("overwrites the counter row when the next window begins", async () => {
    const endpoint = "add_person";
    const subject = "person-1";
    const firstWindow = new Date("2026-09-29T11:00:00.000Z");
    const windowMs = RATE_LIMIT_RULES.add_person.windowMs;

    await consumeRateLimit(deployment.context, {
      endpoint,
      subject,
      now: firstWindow,
    });
    await consumeRateLimit(deployment.context, {
      endpoint,
      subject,
      now: firstWindow,
    });

    expect(await rows(endpoint, subject)).toHaveLength(1);

    // The next window: the same statement clears the subject's other windows first, so the row
    // is overwritten rather than a second one created, and the count restarts (AC-6).
    const nextWindow = new Date(firstWindow.getTime() + windowMs);

    const decision = await consumeRateLimit(deployment.context, {
      endpoint,
      subject,
      now: nextWindow,
    });

    expect(decision).toMatchObject({ allowed: true, count: 1 });

    const counters = await rows(endpoint, subject);

    expect(counters).toHaveLength(1);
    expect(counters[0]?.window_start.toISOString()).toBe(
      windowStartFor(nextWindow, windowMs).toISOString()
    );
    expect(Number(counters[0]?.count)).toBe(1);
  });

  it("holds the documented window and count for all four endpoints (R-19, R-20)", () => {
    expect(RATE_LIMIT_RULES.break_glass_sign_in).toMatchObject({
      limit: 10,
      windowMs: 15 * 60_000,
      subjectKind: "deployment",
    });
    expect(RATE_LIMIT_RULES.add_person).toMatchObject({
      limit: 30,
      windowMs: 60 * 60_000,
      subjectKind: "actor",
    });
    expect(RATE_LIMIT_RULES.resend_set_password).toMatchObject({
      limit: 3,
      windowMs: 60 * 60_000,
      subjectKind: "target",
    });
    expect(RATE_LIMIT_RULES.resend_invitation).toMatchObject({
      limit: 3,
      windowMs: 60 * 60_000,
      subjectKind: "target",
    });
  });
});
