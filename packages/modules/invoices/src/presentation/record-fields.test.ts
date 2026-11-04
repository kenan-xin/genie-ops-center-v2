import { describe, expect, it } from "vitest";

import { partPaidInvoiceRecord } from "./__fixtures__/invoices.ts";
import { invoiceDeskFields } from "./record-fields.ts";

const INVOICE = partPaidInvoiceRecord.invoice;

const byKey = (fields: ReturnType<typeof invoiceDeskFields>) =>
  Object.fromEntries(
    fields.map((field) => [field.key, { tag: field.tag, source: field.source }])
  );

// D15 to D17: which fields of a record pin, and which origin tag each shows (R-38a, DK2).
describe("invoiceDeskFields", () => {
  it("pins an extracted field at its quote, and gives a corrected field its tag and no pin", () => {
    const fields = byKey(
      invoiceDeskFields(
        INVOICE,
        [
          {
            field: "customer",
            origin: "extracted",
            quote: "Bill to: Harbor Foods",
            page: 1,
          },
          {
            field: "amount",
            origin: "corrected",
            quote: "TOTAL (SGD) 7,200.00",
            page: 1,
          },
        ],
        true
      )
    );

    expect(fields.customer).toEqual({
      tag: "extracted",
      source: { page: 1, quote: "Bill to: Harbor Foods" },
    });
    expect(fields.amount).toEqual({ tag: "corrected", source: null });
  });

  it("tags every field of a record with no document as entered, with no pin", () => {
    const fields = invoiceDeskFields(INVOICE, [], false);

    expect(fields).toHaveLength(7);
    expect(fields.filter((field) => field.tag !== "entered")).toEqual([]);
    expect(fields.filter((field) => field.source !== null)).toEqual([]);
  });

  it("shows no tag for a field with no row on a read document", () => {
    expect(byKey(invoiceDeskFields(INVOICE, [], true)).description).toEqual({
      tag: null,
      source: null,
    });
  });
});
