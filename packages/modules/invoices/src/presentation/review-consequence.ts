import { currencyCode } from "../contract.ts";
import { formatDay, formatMoney } from "./format.ts";

/** What Save adds (czjw.193); null while the total or the currency does not read. */
export function consequenceOf(input: {
  readonly kind: "invoice" | "paid-receipt";
  readonly totalCents: number | undefined;
  readonly currency: string;
  /** The due day as ISO once it reads; null before a choice or while it does not read. */
  readonly dueDay: string | null;
  /** The person chose No due date. */
  readonly noDueDate: boolean;
}): string | null {
  const code = currencyCode.safeParse(input.currency.trim().toUpperCase());

  if (input.totalCents === undefined || !code.success) return null;

  const money = formatMoney(input.totalCents, code.data);

  if (input.kind === "paid-receipt")
    return `Saves a paid invoice of ${money}, with its payment and the allocation.`;

  if (input.noDueDate)
    return `Saves an unpaid invoice of ${money} with no due date.`;

  return input.dueDay === null
    ? `Saves an unpaid invoice of ${money}.`
    : `Saves an unpaid invoice of ${money}, due ${formatDay(input.dueDay)}.`;
}
