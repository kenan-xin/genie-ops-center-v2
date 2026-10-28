import { describe, expect, it } from "vitest";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { reportingDate } from "./reporting-date.ts";

/** The two readers the reporting date needs, holding only the values it reads. */
function readers(stored: string | null, timeZone: string) {
  // SAFETY: the readers serve the whole rows, and this test reads only these two fields.
  return {
    settings: { get: async () => ({ reportingDate: stored }) },
    branding: { get: async () => ({ defaultTimeZone: timeZone }) },
  } as Pick<TenantContext, "settings" | "branding">;
}

describe("the reporting date", () => {
  it.each([
    {
      stored: "2026-02-01",
      zone: "UTC",
      now: "2026-10-27T12:30:00Z",
      expected: "2026-02-01",
    },
    {
      stored: null,
      zone: "Pacific/Auckland",
      now: "2026-10-27T12:30:00Z",
      expected: "2026-10-28",
    },
    {
      stored: null,
      zone: "UTC",
      now: "2026-10-27T12:30:00Z",
      expected: "2026-10-27",
    },
  ])(
    "answers $expected for $stored in $zone",
    async ({ stored, zone, now, expected }) => {
      expect(await reportingDate(readers(stored, zone), new Date(now))).toBe(
        expected
      );
    }
  );
});
