import type { OpenInvoiceRow, PaymentMatch } from "../contract.ts";
import { normalizeInvoiceNumber } from "../services/matching/decide.ts";
import { amountText, centsOfText } from "./format.ts";

/** One link the person keeps checked: the invoice and the amount as typed. */
export type LinkDraft = {
  readonly invoiceId: string;
  readonly amountText: string;
};

export type LinksCheck = {
  /** The sum of the drafts whose amount parses, in cents. */
  readonly allocatedCents: number;
  /** The payment amount minus allocatedCents, never below 0. */
  readonly unallocatedCents: number;
  readonly abovePayment: boolean;
  /** Invoice ids whose draft is above their open amount. */
  readonly aboveOpen: readonly string[];
  /** Invoice ids whose amount text does not parse. */
  readonly unreadable: readonly string[];
};

/** The checks the save would refuse on, in integer cents (R-34). */
export function checkLinks(
  amountCents: number,
  drafts: readonly LinkDraft[],
  open: readonly OpenInvoiceRow[]
): LinksCheck {
  let allocatedCents = 0;
  const aboveOpen: string[] = [];
  const unreadable: string[] = [];

  for (const draft of drafts) {
    const cents = centsOfText(draft.amountText);

    if (cents === undefined) {
      unreadable.push(draft.invoiceId);
      continue;
    }

    allocatedCents += cents;

    const row = open.find((item) => item.invoiceId === draft.invoiceId);

    if (row !== undefined && cents > row.openCents) {
      aboveOpen.push(draft.invoiceId);
    }
  }

  return {
    allocatedCents,
    unallocatedCents: Math.max(0, amountCents - allocatedCents),
    abovePayment: allocatedCents > amountCents,
    aboveOpen,
    unreadable,
  };
}

/** The open invoices that the payment names, apart from the customer's other open invoices (czjw.69). */
export type SplitGroups = {
  readonly named: readonly OpenInvoiceRow[];
  readonly others: readonly OpenInvoiceRow[];
};

/** Splits `open` by the numbers the payment names, as the matcher compares them, keeping its order. */
export function splitGroupsOf(
  open: readonly OpenInvoiceRow[],
  namedNumbers: readonly string[]
): SplitGroups {
  const named = new Set(namedNumbers.map(normalizeInvoiceNumber));

  const isNamed = (row: OpenInvoiceRow) =>
    named.has(normalizeInvoiceNumber(row.number));

  return {
    named: open.filter(isNamed),
    others: open.filter((row) => !isNamed(row)),
  };
}

/** The drafts a proposal starts with, amounts as `amountText`. Suggestions and no-match start with none. */
export function draftsOfProposal(proposal: PaymentMatch): readonly LinkDraft[] {
  switch (proposal.kind) {
    case "split":
      return proposal.parts.map((part) => ({
        invoiceId: part.invoiceId,
        amountText: amountText(part.amountCents),
      }));
    case "automatic":
    case "confirm":
    case "overpayment":
      return [
        {
          invoiceId: proposal.invoiceId,
          amountText: amountText(proposal.amountCents),
        },
      ];
    case "suggestions":
    case "no-match":
      return [];
  }
}

/**
 * The amount a newly checked link starts with: its open amount, or the payment's rest when that is
 * smaller. Empty when nothing is left or the payment amount does not parse yet.
 */
export function fillOf(
  amountCents: number | undefined,
  others: readonly LinkDraft[],
  row: OpenInvoiceRow
): string {
  const rest =
    amountCents === undefined
      ? row.openCents
      : amountCents - checkLinks(amountCents, others, []).allocatedCents;

  const cents = Math.min(row.openCents, rest);

  return cents > 0 ? amountText(cents) : "";
}
