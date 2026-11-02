import { type ChartColumn, formatChartValue } from "@genie/ui";

import { centsOf } from "../services/reading/quote-check.ts";

/** The pages print money and days through the charts' formatter, so both print one format. */
const MONEY: ChartColumn = {
  key: "amount",
  label: "Amount",
  type: "money",
  currencyKey: "currency",
};

const DAY: ChartColumn = { key: "day", label: "Day", type: "date" };

/** Cents in their own currency, never another row's (Review Focus 1). */
export const formatMoney = (cents: number, currency: string) =>
  formatChartValue(MONEY, cents, { row: { currency } });

export const formatDay = (day: string) => formatChartValue(DAY, day);

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

/** A typed day in the app's format once it reads, else the text as typed. */
export function dayText(text: string): string {
  const day = dayFromText(text);

  return day === null ? text : formatDay(day);
}

/** Typed money in cents: "5,000.00" and "5000" read; separators only in groups of three. */
export function centsOfText(text: string): number | undefined {
  const value = text.trim();

  if (value.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/u.test(value))
    return undefined;

  return centsOf(value.replaceAll(",", ""));
}

const AMOUNT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Cents as an input shows them, with separators and no currency: "5,000.00" (design review 4.5). */
export const amountText = (cents: number) => AMOUNT.format(cents / 100);

/** Typed money with its separators once it reads, else the text as typed. */
export function moneyText(text: string): string {
  const cents = centsOfText(text);

  return cents === undefined ? text : amountText(cents);
}

/** A long file name cut in the middle, so its start and its extension stay (design review 4.2). */
export const shortName = (name: string, max = 28) =>
  name.length <= max ? name : `${name.slice(0, max - 10)}…${name.slice(-9)}`;

/** A payment is named by its reference, or by its date when it has none. */
export function paymentLabel(row: {
  readonly reference: string | null;
  readonly paymentDate: string;
}): string {
  return row.reference ?? formatDay(row.paymentDate);
}

/** An instant in the tenant's time zone (P10). */
export const formatInstant = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(instant));
