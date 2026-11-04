import { describe, expect, it } from "vitest";

import {
  activityThrottleWaitMs,
  announcedSeconds,
  formatCountdown,
  idleExpiry,
  isIdleExpired,
  warningLeadMs,
} from "./idle.ts";

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

describe("warningLeadMs", () => {
  it("is two minutes, or half the idle window when that is shorter (R-33)", () => {
    expect(warningLeadMs(15)).toBe(120_000);
    expect(warningLeadMs(3)).toBe(90_000);
    expect(warningLeadMs(1)).toBe(30_000);
  });
});

describe("formatCountdown", () => {
  it("rounds a partial second up, so the warning never shows 0:00 early", () => {
    expect(formatCountdown(119_500)).toBe("2:00");
    expect(formatCountdown(61_000)).toBe("1:01");
  });

  it("clamps zero and a passed expiry to 0:00", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

/** The live line's answer at each whole second from `fromS` down to `toS`, 400 ms in. */
function spoken(leadMs: number, fromS: number, toS: number): number[] {
  return Array.from({ length: fromS - toS + 1 }, (_, i) =>
    announcedSeconds((fromS - i) * 1000 - 400, leadMs)
  );
}

describe("announcedSeconds", () => {
  it("speaks the lead, then changes only at 60, 30 and 10 seconds (I1)", () => {
    expect(new Set(spoken(120_000, 120, 61))).toEqual(new Set([120]));
    expect(new Set(spoken(120_000, 60, 31))).toEqual(new Set([60]));
    expect(new Set(spoken(120_000, 30, 11))).toEqual(new Set([30]));
    expect(new Set(spoken(120_000, 10, 0))).toEqual(new Set([10]));
  });

  it("speaks a short lead once and never a longer time than remains (I2)", () => {
    expect(new Set(spoken(4_000, 4, 0))).toEqual(new Set([4]));
  });
});
