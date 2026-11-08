import { describe, expect, it } from "vitest";

import { splitPaymentReview } from "./__fixtures__/review.ts";
import { formatMoney } from "./format.ts";
import { firstFieldBlocker, splitBlocker } from "./review-blocker.ts";
import { DATE_MESSAGE } from "./review-form.tsx";

const open = splitPaymentReview.payment?.openInvoices ?? [];

const [aug, sep] = open.map((row) => row.invoiceId);

const ready = { kind: "ready" } as const;

const PAYMENT = { open, amountCents: 825_000, currency: "SGD" };

const DUE = "Choose a due date or mark it unspecified to save.";

describe("what blocks a review save", () => {
  // T1.1, T1.2: the first field in list order, and "Enter" only for an empty one.
  it("names the first blocking field, with Enter only when it is empty", () => {
    expect(
      firstFieldBlocker([
        {
          key: "number",
          label: "Invoice number",
          issue: undefined,
          empty: false,
        },
        {
          key: "date",
          label: "Invoice date",
          issue: DATE_MESSAGE,
          empty: true,
        },
        { key: "dueDate", label: "Due date", issue: DUE, empty: false },
      ])
    ).toEqual({
      key: "date",
      reason: "Enter the invoice date to save.",
      focusId: "review-date",
    });

    expect(
      firstFieldBlocker([
        {
          key: "date",
          label: "Invoice date",
          issue: DATE_MESSAGE,
          empty: false,
        },
      ])
    ).toEqual({ key: "date", reason: DATE_MESSAGE, focusId: "review-date" });
  });

  // T1.3: the due choice has no `review-dueDate` control.
  it("focuses the control that the check names", () => {
    expect(
      firstFieldBlocker([
        {
          key: "dueDate",
          label: "Due date",
          issue: DUE,
          empty: false,
          focusId: "review-due-person",
        },
      ])
    ).toEqual({ key: "dueDate", reason: DUE, focusId: "review-due-person" });
  });

  // T1.4: the schema refuses a link of 0, so the review must name it.
  it("blocks a checked link of 0.00 and focuses its amount", () => {
    expect(
      splitBlocker({
        ...PAYMENT,
        status: ready,
        drafts: [{ invoiceId: aug ?? "", amountText: "0.00" }],
      })
    ).toEqual({
      key: "split",
      reason: "Enter the amount for INV-2026-08-04.",
      focusId: `link-${aug}`,
    });
  });

  // T1.5
  it("names the invoice whose link is above its open amount", () => {
    expect(
      splitBlocker({
        ...PAYMENT,
        status: ready,
        drafts: [
          { invoiceId: aug ?? "", amountText: "4,050.00" },
          { invoiceId: sep ?? "", amountText: "4,200.01" },
        ],
      })
    ).toEqual({
      key: "split",
      reason: `The link to INV-2026-09-04 is more than its open ${formatMoney(420_000, "SGD")}.`,
      focusId: `link-${sep}`,
    });
  });

  // T1.6
  it("names the excess over the payment and focuses the first link", () => {
    expect(
      splitBlocker({
        ...PAYMENT,
        amountCents: 800_000,
        status: ready,
        drafts: [
          { invoiceId: aug ?? "", amountText: "4,050.00" },
          { invoiceId: sep ?? "", amountText: "4,200.00" },
        ],
      })
    ).toEqual({
      key: "split",
      reason: `The links add up to ${formatMoney(25_000, "SGD")} more than the payment. Reduce one to save.`,
      focusId: `link-${aug}`,
    });
  });

  // T1.7: the link inputs are not drawn while the open invoices load.
  it("waits for the open invoices with no focus", () => {
    expect(
      splitBlocker({
        ...PAYMENT,
        status: { kind: "loading" },
        drafts: [{ invoiceId: aug ?? "", amountText: "0.00" }],
      })
    ).toEqual({
      key: "split",
      reason: "Save waits for the open invoices to load.",
      focusId: null,
    });
  });
});
