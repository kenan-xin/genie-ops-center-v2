import { describe, expect, it } from "vitest";

import {
  dateOfDay,
  dayFromText,
  dayOfDate,
  formatDayRange,
  quickRanges,
} from "./calendar-day.ts";

// The quick ranges of the list date range (LH25), from the reporting date or today.
describe("quickRanges", () => {
  it("gives the five ranges of the prototype", () => {
    expect(quickRanges("2026-11-03")).toEqual([
      { label: "This month", from: "2026-11-01", to: "2026-11-30" },
      { label: "Last month", from: "2026-10-01", to: "2026-10-31" },
      { label: "Last 30 days", from: "2026-10-05", to: "2026-11-03" },
      { label: "This quarter", from: "2026-10-01", to: "2026-12-31" },
      { label: "Year to date", from: "2026-01-01", to: "2026-11-03" },
    ]);
  });

  it("takes last month from the year before in January", () => {
    expect(quickRanges("2026-01-15")[1]).toEqual({
      label: "Last month",
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

// Design review 4.4: the review writes days as "26 Oct 2026" and still takes the ISO day it read.
describe("dayFromText", () => {
  it.each([
    ["26 Oct 2026", "2026-10-26"],
    [" 26 october 2026 ", "2026-10-26"],
    ["6 Sept 2026", "2026-09-06"],
    ["2026-10-26", "2026-10-26"],
    ["31 Feb 2026", null],
    ["2026-02-31", null],
    ["26 Okt 2026", null],
    ["26/10/2026", null],
    ["", null],
  ] as const)("reads %j as %j", (text, day) => {
    expect(dayFromText(text)).toBe(day);
  });
});

// I9: a picked day must save as the same day east and west of UTC.
describe.each(["Pacific/Kiritimati", "Pacific/Pago_Pago"])(
  "the calendar's day in %s",
  (timeZone) => {
    it("keeps the day both ways", () => {
      const zone = process.env.TZ;

      process.env.TZ = timeZone;

      try {
        expect(dayOfDate(dateOfDay("2026-11-25"))).toBe("2026-11-25");
        expect(dayOfDate(new Date(2026, 10, 25))).toBe("2026-11-25");
      } finally {
        if (zone === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = zone;
        }
      }
    });
  }
);

// Intl puts a thin space (U+2009) on each side of the dash.
describe("formatDayRange", () => {
  it.each([
    ["a shared year", "2026-10-01", "2026-11-03", "1 Oct – 3 Nov 2026"],
    ["two years", "2026-12-28", "2027-01-03", "28 Dec 2026 – 3 Jan 2027"],
    ["one month", "2026-11-01", "2026-11-30", "1 – 30 Nov 2026"],
  ] as const)("writes %s once", (_, from, to, text) =>
    expect(formatDayRange(from, to)).toBe(text)
  );
});
