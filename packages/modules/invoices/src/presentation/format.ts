import { type ChartColumn, formatChartValue } from "@genie/ui";

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

/** An instant in the tenant's time zone (P10). */
export const formatInstant = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(instant));
