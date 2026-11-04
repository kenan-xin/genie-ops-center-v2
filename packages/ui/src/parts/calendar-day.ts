import { format, parseISO } from "date-fns";

import { formatChartValue } from "./chart-data.ts";

/*
 * A day is a calendar day with no time zone. The fields and filters keep it as an ISO day
 * ("2026-11-25"), the calendar works on local dates, and the text uses the app format
 * ("25 Nov 2026"). Each move between the three keeps the same day in every zone (the I9 class).
 */

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/**
 * The ISO day of a typed day: "26 Oct 2026" (any case, the month's name whole or cut, "Sept" too)
 * or the ISO day itself. A day that does not exist, such as 31 Feb, is null (design review 4.4).
 */
export function dayFromText(text: string): string | null {
  const value = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  const written = /^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/iu.exec(value);

  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : written
      ? [
          Number(written[3]),
          MONTHS.findIndex((month) => month === written[2]?.toLowerCase()) + 1,
          Number(written[1]),
        ]
      : null;

  if (parts === null) return null;

  const [year = 0, month = 0, day = 0] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));

  // Date rolls an impossible day into the next month, so the parts must come back unchanged.
  return month > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}

/** An ISO day in the app format: "25 Nov 2026", "30 Sept 2026". Read in UTC, as chart days. */
export const formatDay = (day: string) =>
  formatChartValue({ key: "day", label: "Day", type: "date" }, day);

/** The local midnight of an ISO day, the date the calendar shows. */
export const dateOfDay = (day: string) => parseISO(day);

/** The ISO day of a date that the calendar picked, from its local fields. */
export const dayOfDate = (date: Date) => format(date, "yyyy-MM-dd");

const rangeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "1 Oct – 3 Nov 2026", with a thin space each side of the dash: the shared month or year shows once. */
export const formatDayRange = (from: string, to: string) =>
  rangeFormat.formatRange(
    new Date(`${from}T00:00:00Z`),
    new Date(`${to}T00:00:00Z`)
  );
