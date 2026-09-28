import { describe, expect, it } from "vitest";

import { activityThrottleWaitMs, idleExpiry, isIdleExpired } from "./idle.ts";

/**
 * The idle rule's pure comparisons (R-14, R-15, R-15a): the expiry an activity timestamp holds,
 * the refusal at and past the window, and the throttle wait the browser's activity call uses.
 */
const LAST_ACTIVITY = new Date("2026-09-28T10:00:00.000Z");

describe("idleExpiry", () => {
  it("is the last activity plus the tenant's idle minutes", () => {
    expect(
      idleExpiry({
        lastActivityAt: LAST_ACTIVITY,
        idleMinutes: 15,
      }).toISOString()
    ).toBe("2026-09-28T10:15:00.000Z");
  });

  it("serves the smallest tenant window unchanged", () => {
    expect(
      idleExpiry({
        lastActivityAt: LAST_ACTIVITY,
        idleMinutes: 5,
      }).toISOString()
    ).toBe("2026-09-28T10:05:00.000Z");
  });
});

describe("isIdleExpired", () => {
  it("keeps a session inside the window", () => {
    expect(
      isIdleExpired({
        lastActivityAt: LAST_ACTIVITY,
        idleMinutes: 15,
        now: new Date("2026-09-28T10:14:59.999Z"),
      })
    ).toBe(false);
  });

  it("refuses exactly at the expiry, so the window is half open", () => {
    expect(
      isIdleExpired({
        lastActivityAt: LAST_ACTIVITY,
        idleMinutes: 15,
        now: new Date("2026-09-28T10:15:00.000Z"),
      })
    ).toBe(true);
  });

  it("refuses past the expiry", () => {
    expect(
      isIdleExpired({
        lastActivityAt: LAST_ACTIVITY,
        idleMinutes: 15,
        now: new Date("2026-09-28T11:00:00.000Z"),
      })
    ).toBe(true);
  });
});

describe("activityThrottleWaitMs", () => {
  it("is half the idle window (R-15)", () => {
    expect(activityThrottleWaitMs(15)).toBe(450_000);
    expect(activityThrottleWaitMs(5)).toBe(150_000);
  });
});
