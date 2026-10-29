export type OpenInvoice = {
  readonly invoiceId: string;
  readonly number: string;
  readonly invoiceDate: string;
  readonly currency: string;
  readonly openCents: number;
};

export type PaymentFacts = {
  readonly customerId: string | null;
  readonly currency: string;
  readonly amountCents: number;
  readonly namedInvoiceNumbers: readonly string[];
  readonly factsChecked: boolean;
};

export type MatchPart = {
  readonly invoiceId: string;
  readonly amountCents: number;
};

export type PaymentMatch =
  | {
      readonly kind: "automatic";
      readonly invoiceId: string;
      readonly amountCents: number;
    }
  | {
      readonly kind: "confirm";
      readonly invoiceId: string;
      readonly amountCents: number;
    }
  | {
      readonly kind: "overpayment";
      readonly invoiceId: string;
      readonly amountCents: number;
      readonly unallocatedCents: number;
    }
  | {
      readonly kind: "split";
      readonly parts: readonly MatchPart[];
      readonly unallocatedCents: number;
    }
  | { readonly kind: "suggestions"; readonly invoiceIds: readonly string[] }
  | { readonly kind: "no-match" };

export function normalizeInvoiceNumber(raw: string): string {
  return raw.trim().toUpperCase();
}

export function normalizedInvoiceNumbers(
  raw: readonly string[]
): readonly string[] {
  return [...new Set(raw.map(normalizeInvoiceNumber))]
    .filter((number) => number !== "")
    .toSorted();
}

// Code-unit order, so the answer never depends on the server's locale.
function compareText(a: string, b: string): number {
  if (a === b) return 0;

  return a < b ? -1 : 1;
}

function oldestFirst(a: OpenInvoice, b: OpenInvoice): number {
  return (
    compareText(a.invoiceDate, b.invoiceDate) || compareText(a.number, b.number)
  );
}

export function decidePaymentMatch(
  facts: PaymentFacts,
  openInvoices: readonly OpenInvoice[]
): PaymentMatch {
  if (facts.customerId === null) return { kind: "no-match" };

  const candidates = openInvoices
    .filter(
      (invoice) => invoice.currency === facts.currency && invoice.openCents > 0
    )
    .toSorted(oldestFirst);

  const named = normalizedInvoiceNumbers(facts.namedInvoiceNumbers);

  const found = candidates.filter((invoice) =>
    named.includes(normalizeInvoiceNumber(invoice.number))
  );

  const [only] = found;

  if (named.length === 1 && found.length === 1 && only) {
    if (facts.amountCents > only.openCents) {
      return {
        kind: "overpayment",
        invoiceId: only.invoiceId,
        amountCents: only.openCents,
        unallocatedCents: facts.amountCents - only.openCents,
      };
    }

    return {
      kind: facts.factsChecked ? "automatic" : "confirm",
      invoiceId: only.invoiceId,
      amountCents: facts.amountCents,
    };
  }

  if (found.length > 0) {
    let remaining = facts.amountCents;
    const parts: MatchPart[] = [];

    for (const invoice of found) {
      const amountCents = Math.min(invoice.openCents, remaining);

      if (amountCents === 0) break;

      parts.push({ invoiceId: invoice.invoiceId, amountCents });
      remaining -= amountCents;
    }

    return { kind: "split", parts, unallocatedCents: remaining };
  }

  // Amount on the left: "the amount fits the invoice" (<=) is the likely slip.
  const invoiceIds = candidates.flatMap((invoice) =>
    facts.amountCents === invoice.openCents ? [invoice.invoiceId] : []
  );

  return invoiceIds.length > 0
    ? { kind: "suggestions", invoiceIds }
    : { kind: "no-match" };
}
