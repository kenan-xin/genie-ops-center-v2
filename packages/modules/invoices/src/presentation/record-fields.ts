import type { DeskField } from "./desk-canvas.tsx";
import { formatDay, formatMoney } from "./format.ts";
import type { InvoiceDetail, PaymentRecordView, RecordField } from "./views.ts";

type ShownPayment = Extract<PaymentRecordView, { kind: "shown" }>["payment"];

type Entry = {
  readonly key: RecordField["field"];
  readonly label: string;
  readonly value: string | null;
};

/**
 * The desk fields of a record (R-38a, DK2). A record with no document was entered by hand. On a
 * read document, only an `extracted` row pins at its quote: a `corrected` row keeps the quote of
 * the value a person replaced, and a field with no row shows no tag.
 */
function deskFields(
  entries: readonly Entry[],
  sources: readonly RecordField[],
  hasDocument: boolean
): readonly DeskField[] {
  const byField = new Map(sources.map((row) => [row.field, row]));

  return entries.map(({ key, label, value }): DeskField => {
    const row = byField.get(key);
    const shown = value ?? "None";

    if (!hasDocument) {
      return { key, label, value: shown, tag: "entered", source: null };
    }

    const source =
      row?.origin === "extracted" && row.quote !== null && row.page !== null
        ? { page: row.page, quote: row.quote }
        : null;

    return { key, label, value: shown, tag: row?.origin ?? null, source };
  });
}

/** The invoice's fields in the prototype's order (DK14). */
export function invoiceDeskFields(
  invoice: InvoiceDetail,
  sources: readonly RecordField[],
  hasDocument: boolean
): readonly DeskField[] {
  const due =
    invoice.dueDate === null || invoice.dueDateSource === "unspecified"
      ? null
      : formatDay(invoice.dueDate);

  return deskFields(
    [
      { key: "customer", label: "Customer", value: invoice.customerName },
      {
        key: "number",
        label: "Invoice number",
        value: invoice.invoiceNumber,
      },
      {
        key: "date",
        label: "Invoice date",
        value: formatDay(invoice.invoiceDate),
      },
      { key: "dueDate", label: "Due date", value: due },
      { key: "description", label: "Description", value: invoice.description },
      {
        key: "amount",
        label: "Total",
        value: formatMoney(invoice.totalCents, invoice.currency),
      },
      {
        key: "paymentTerms",
        label: "Payment terms",
        value: invoice.paymentTerms,
      },
    ],
    sources,
    hasDocument
  );
}

/** The payment's fields: the facts its page showed, and Amount for its line (DK14). */
export function paymentDeskFields(
  payment: ShownPayment,
  sources: readonly RecordField[],
  hasDocument: boolean
): readonly DeskField[] {
  return deskFields(
    [
      { key: "customer", label: "Customer", value: payment.customerName },
      {
        key: "date",
        label: "Payment date",
        value: formatDay(payment.paymentDate),
      },
      {
        key: "amount",
        label: "Amount",
        value: formatMoney(payment.amountCents, payment.currency),
      },
      { key: "reference", label: "Reference", value: payment.reference },
      { key: "method", label: "Method", value: payment.method },
    ],
    sources,
    hasDocument
  );
}
