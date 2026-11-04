import {
  type ChartColumn,
  dayFromText,
  formatChartValue,
  formatDay,
} from "@genie/ui";

import { centsOf } from "../services/reading/quote-check.ts";

/** The pages print money and days through the charts' formatter, so both print one format. */
const MONEY: ChartColumn = {
  key: "amount",
  label: "Amount",
  type: "money",
  currencyKey: "currency",
};

// The day helpers live with the date picker; the pages keep importing them from here.
export { dayFromText, formatDay };

/** Cents in their own currency, never another row's (Review Focus 1). */
export const formatMoney = (cents: number, currency: string) =>
  formatChartValue(MONEY, cents, { row: { currency } });

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
