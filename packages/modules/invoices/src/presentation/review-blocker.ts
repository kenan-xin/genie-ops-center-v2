import { MAX_PAYMENT_LINKS, type OpenInvoiceRow } from "../contract.ts";
import { centsOfText, formatMoney } from "./format.ts";
import type { LinkDraft } from "./payment-links.ts";
import type { OpenStatus } from "./payment-links.tsx";
import type { ReviewFieldKey } from "./review-fields.tsx";

/** What keeps Save disabled, in words beside it, and the control that Save focuses (czjw.65). */
export type Blocker = {
  readonly key: ReviewFieldKey | "split";
  readonly reason: string;
  /** The control that takes focus; null while the person has nothing to fix there. */
  readonly focusId: string | null;
};

export type FieldCheck = {
  readonly key: ReviewFieldKey;
  readonly label: string;
  /** The field's message while its value cannot save; undefined when it can. */
  readonly issue: string | undefined;
  readonly empty: boolean;
  /** Default `review-<key>`. */
  readonly focusId?: string;
};

export const FALLBACK_REASON = "Fix the marked fields to save.";

const block = (reason: string, invoiceId?: string): Blocker => ({
  key: "split",
  reason,
  focusId: invoiceId === undefined ? null : `link-${invoiceId}`,
});

/** The first field in list order that cannot save (P09-11). */
export function firstFieldBlocker(
  fields: readonly FieldCheck[]
): Blocker | null {
  const field = fields.find((item) => item.issue !== undefined);

  if (field?.issue === undefined) return null;

  return {
    key: field.key,
    reason: field.empty
      ? `Enter the ${field.label.toLowerCase()} to save.`
      : field.issue,
    focusId: field.focusId ?? `review-${field.key}`,
  };
}

/** What blocks the split of a payment, in the order the person meets it. */
export function splitBlocker(input: {
  readonly status: OpenStatus;
  readonly drafts: readonly LinkDraft[];
  readonly open: readonly OpenInvoiceRow[];
  readonly amountCents: number;
  readonly currency: string;
}): Blocker | null {
  const { status, drafts, open, amountCents, currency } = input;

  if (status.kind === "loading")
    return block("Save waits for the open invoices to load.");

  if (status.kind === "failed")
    return block("The open invoices did not load. Press Load again to save.");

  if (drafts.length > MAX_PAYMENT_LINKS)
    return block(`Link at most ${MAX_PAYMENT_LINKS} invoices in one save.`);

  const rows = drafts.map((draft) => ({
    draft,
    cents: centsOfText(draft.amountText),
    row: open.find((item) => item.invoiceId === draft.invoiceId),
  }));

  const numberOf = (item: (typeof rows)[number]) =>
    item.row?.number ?? "this invoice";

  // `centsOfText` reads 0.00 as undefined, because the schema's `cents` is min 1.
  const unread = rows.find((item) => item.cents === undefined);

  if (unread !== undefined)
    return block(
      `Enter the amount for ${numberOf(unread)}.`,
      unread.draft.invoiceId
    );

  const above = rows.find(
    (item) => item.row !== undefined && (item.cents ?? 0) > item.row.openCents
  );

  if (above?.row !== undefined)
    return block(
      `The link to ${above.row.number} is more than its open ${formatMoney(above.row.openCents, currency)}.`,
      above.draft.invoiceId
    );

  const sum = rows.reduce((total, item) => total + (item.cents ?? 0), 0);

  if (sum > amountCents)
    return block(
      `The links add up to ${formatMoney(sum - amountCents, currency)} more than the payment. Reduce one to save.`,
      drafts[0]?.invoiceId
    );

  return null;
}
