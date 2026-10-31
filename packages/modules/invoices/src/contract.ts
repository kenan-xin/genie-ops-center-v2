import { oc } from "@genie/core/rpc";
import { z } from "zod";

/**
 * The module's API, published as `@genie/module-invoices/contract` (ADR 0011). It imports only zod
 * and the browser-safe `@genie/core/rpc`, so the browser client types its calls from this file
 * without pulling any server code. Every procedure declares its route, and every path starts with
 * the module id.
 */

/** Where an invoice's due date came from. `unspecified` has no due date and is never overdue (R-29). */
export const DUE_DATE_SOURCES = ["document", "person", "unspecified"] as const;

export type DueDateSource = (typeof DUE_DATE_SOURCES)[number];

export const DOCUMENT_KINDS = [
  "invoice",
  "payment",
  "paid-receipt",
  "purchase-order",
] as const;

/** A document's status in the inbox, in the order it is decided (R-37, decision 11). */
export const INBOX_STATUSES = [
  "reading",
  "could-not-read",
  "needs-input",
  "linked-automatically",
  "confirm-split",
  "possible-duplicate",
  "no-match",
  "kept-as-reference",
  "saved",
] as const;

export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const recordId = z.uuid();

/** A positive amount in integer cents that fits the `integer` amount columns. */
export const cents = z.number().int().min(1).max(2_147_483_647);

export const currencyCode = z.string().regex(/^[A-Z]{3}$/);

export const isoDate = z.iso.date();

/** The fields a reading may return, each with its value, its quote and its page (R-24). */
export const READING_FIELDS = [
  "customer",
  "number",
  "date",
  "dueDate",
  "paymentTerms",
  "currency",
  "amount",
  "reference",
  "method",
  "description",
] as const;

export type ReadingField = (typeof READING_FIELDS)[number];

export const quotedValue = z.object({
  value: z.string(),
  quote: z.string(),
  page: z.number().int().positive(),
});

export type QuotedValue = z.infer<typeof quotedValue>;

/**
 * The checked reading on `document.reading`. A field in `fields` passed the quote check; a field
 * in `dropped` had a value that failed it ("check this", R-25); a field in neither was not on the
 * document.
 */
export const storedReading = z.object({
  fields: z.partialRecord(z.enum(READING_FIELDS), quotedValue),
  invoiceNumbers: z.array(quotedValue),
  dropped: z.array(z.enum([...READING_FIELDS, "invoiceNumbers"])),
});

export type StoredReading = z.infer<typeof storedReading>;

export const matchPart = z.object({
  invoiceId: z.string(),
  amountCents: cents,
});

export type MatchPart = z.infer<typeof matchPart>;

/** What R-30 decides for a payment over the open amounts of its customer. */
export const paymentMatch = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("automatic"),
    invoiceId: z.string(),
    amountCents: cents,
  }),
  z.object({
    kind: z.literal("confirm"),
    invoiceId: z.string(),
    amountCents: cents,
  }),
  z.object({
    kind: z.literal("overpayment"),
    invoiceId: z.string(),
    amountCents: cents,
    unallocatedCents: cents,
  }),
  z.object({
    kind: z.literal("split"),
    parts: z.array(matchPart),
    unallocatedCents: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("suggestions"),
    invoiceIds: z.array(z.string()),
  }),
  z.object({ kind: z.literal("no-match") }),
]);

export type PaymentMatch = z.infer<typeof paymentMatch>;

/** An existing customer by id, or a new one that the person confirmed (R-33: created only on confirmation). */
export const customerChoice = z.union([
  z.strictObject({ id: recordId }),
  z.strictObject({
    name: z.string().trim().min(1).max(200),
    email: z.email().nullable(),
    confirmed: z.literal(true),
  }),
]);

export const saveInvoiceInput = z
  .object({
    documentId: recordId.nullable(),
    customer: customerChoice,
    number: z.string().trim().min(1).max(64),
    invoiceDate: isoDate,
    dueDate: isoDate.nullable(),
    dueDateSource: z.enum(DUE_DATE_SOURCES),
    paymentTerms: z.string().trim().min(1).max(500).nullable(),
    currency: currencyCode,
    totalCents: cents,
    description: z.string().trim().min(1).max(1000).nullable(),
    keepPossibleDuplicate: z.boolean(),
  })
  .refine(
    (input) =>
      (input.dueDate === null) === (input.dueDateSource === "unspecified"),
    {
      path: ["dueDate"],
      message:
        "A due date is given exactly when its source is not unspecified.",
    }
  );

export type SaveInvoiceInput = z.infer<typeof saveInvoiceInput>;

/** `possible-duplicate` is the person's decision to make, not an error (decision 16). */
export const saveInvoiceOutput = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("saved"),
    invoiceId: z.string(),
    customerId: z.string(),
    linkedPayments: z.array(
      z.object({
        paymentId: z.string(),
        allocationId: z.string(),
        amountCents: cents,
      })
    ),
  }),
  z.object({
    outcome: z.literal("possible-duplicate"),
    duplicateOf: z.string(),
  }),
]);

export type SaveInvoiceOutput = z.infer<typeof saveInvoiceOutput>;

/** The most invoices one payment save links. */
export const MAX_PAYMENT_LINKS = 20;

export const savePaymentInput = z.object({
  documentId: recordId.nullable(),
  customer: customerChoice,
  paymentDate: isoDate,
  currency: currencyCode,
  amountCents: cents,
  reference: z.string().trim().min(1).max(200).nullable(),
  method: z.string().trim().min(1).max(100).nullable(),
  namedInvoiceNumbers: z.array(z.string().trim().min(1).max(64)).max(20),
  /** The links the person chose. The browser save never links by itself (decision 4). */
  allocations: z
    .array(z.strictObject({ invoiceId: recordId, amountCents: cents }))
    .max(MAX_PAYMENT_LINKS),
  keepPossibleDuplicate: z.boolean(),
});

export type SavePaymentInput = z.infer<typeof savePaymentInput>;

export const savePaymentOutput = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("saved"),
    paymentId: z.string(),
    customerId: z.string(),
    allocations: z.array(
      z.object({
        allocationId: z.string(),
        invoiceId: z.string(),
        amountCents: cents,
      })
    ),
  }),
  z.object({
    outcome: z.literal("possible-duplicate"),
    duplicateOf: z.string(),
  }),
]);

export type SavePaymentOutput = z.infer<typeof savePaymentOutput>;

/** A paid receipt: one invoice, one payment of its total and one link between them (R-33). */
export const savePaidReceiptInput = z
  .object({
    documentId: recordId.nullable(),
    customer: customerChoice,
    number: z.string().trim().min(1).max(64),
    date: isoDate,
    dueDate: isoDate.nullable(),
    dueDateSource: z.enum(DUE_DATE_SOURCES),
    currency: currencyCode,
    totalCents: cents,
    description: z.string().trim().min(1).max(1000).nullable(),
    reference: z.string().trim().min(1).max(200).nullable(),
    method: z.string().trim().min(1).max(100).nullable(),
    keepPossibleDuplicate: z.boolean(),
  })
  .refine(
    (input) =>
      (input.dueDate === null) === (input.dueDateSource === "unspecified"),
    {
      path: ["dueDate"],
      message:
        "A due date is given exactly when its source is not unspecified.",
    }
  );

export type SavePaidReceiptInput = z.infer<typeof savePaidReceiptInput>;

export const savePaidReceiptOutput = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("saved"),
    invoiceId: z.string(),
    paymentId: z.string(),
    allocationId: z.string(),
    customerId: z.string(),
  }),
  z.object({
    outcome: z.literal("possible-duplicate"),
    duplicateOf: z.string(),
  }),
]);

export type SavePaidReceiptOutput = z.infer<typeof savePaidReceiptOutput>;

/** Each reduction is the new amount of one link of this invoice; 0 removes it (decision 9). */
export const correctInvoiceTotalInput = z.object({
  id: recordId,
  totalCents: cents,
  reductions: z
    .array(
      z.strictObject({
        allocationId: recordId,
        amountCents: z.number().int().min(0),
      })
    )
    .max(20),
});

export type CorrectInvoiceTotalInput = z.infer<typeof correctInvoiceTotalInput>;

/** `choose-links` asks the person which links to reduce, and nothing is written (R-32). */
export const correctInvoiceTotalOutput = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("corrected") }),
  z.object({
    outcome: z.literal("choose-links"),
    excessCents: z.number().int(),
    allocations: z.array(
      z.object({
        allocationId: z.string(),
        paymentId: z.string(),
        amountCents: cents,
      })
    ),
  }),
]);

export type CorrectInvoiceTotalOutput = z.infer<
  typeof correctInvoiceTotalOutput
>;

/** `duplicate` is an exact copy of a stored document: nothing is added (R-23, decision 10). */
export const uploadDocumentOutput = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("uploaded"), documentId: z.string() }),
  z.object({
    outcome: z.literal("duplicate"),
    documentId: z.string(),
    label: z.string(),
  }),
]);

export type UploadDocumentOutput = z.infer<typeof uploadDocumentOutput>;

/** One inbox row. `found` holds the checked values of a stored reading, else null. */
export const documentInboxRow = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(DOCUMENT_KINDS).nullable(),
  status: z.enum(INBOX_STATUSES),
  reason: z.enum(["ai-off", "no-text-layer"]).nullable(),
  found: z
    .object({
      customer: z.string().nullable(),
      currency: z.string().nullable(),
      amountCents: z.number().int().nullable(),
      invoiceNumbers: z.array(z.string()),
    })
    .nullable(),
});

export const documentInboxView = z.object({
  rows: z.array(documentInboxRow),
  truncated: z.boolean(),
  ai: z.enum(["on", "no-key", "no-models"]),
  canUpload: z.boolean(),
});

export type DocumentInboxRow = z.infer<typeof documentInboxRow>;

export type DocumentInboxView = z.infer<typeof documentInboxView>;

/** An invoice of a customer whose total exceeds all its links. */
export const openInvoiceRow = z.object({
  invoiceId: z.string(),
  number: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  currency: z.string(),
  openCents: z.number().int(),
});

export type OpenInvoiceRow = z.infer<typeof openInvoiceRow>;

export const openInvoicesView = z.object({
  rows: z.array(openInvoiceRow),
  truncated: z.boolean(),
});

/** A link the reading made by itself, which the review offers to undo (R-32). */
export const automaticLink = z.object({
  allocationId: z.string(),
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  paymentId: z.string(),
  paymentReference: z.string().nullable(),
  paymentDate: z.string(),
  currency: z.string(),
  amountCents: cents,
});

export const documentReviewView = z.object({
  document: z.object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(DOCUMENT_KINDS).nullable(),
    status: z.enum(INBOX_STATUSES),
    reason: z.enum(["ai-off", "no-text-layer"]).nullable(),
    fileUrl: z.string(),
  }),
  reading: storedReading.nullable(),
  canWrite: z.boolean(),
  customers: z.array(z.object({ id: z.string(), name: z.string() })),
  customerMatch: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** A payment document with no saved record; null for every other document. */
  payment: z
    .object({
      openInvoices: z.array(openInvoiceRow),
      proposal: paymentMatch,
      possibleDuplicateOf: z.string().nullable(),
    })
    .nullable(),
  /** The records saved from the document; null when none is. */
  saved: z
    .object({
      invoice: z.object({ id: z.string(), number: z.string() }).nullable(),
      payment: z
        .object({
          id: z.string(),
          reference: z.string().nullable(),
          paymentDate: z.string(),
        })
        .nullable(),
      automaticLinks: z.array(automaticLink),
    })
    .nullable(),
});

export type DocumentReviewView = z.infer<typeof documentReviewView>;

export const invoiceStatus = z.union([
  z.object({ kind: z.enum(["paid", "open", "no-due-date"]) }),
  z.object({ kind: z.literal("overdue"), daysOverdue: z.number().int() }),
]);

export type InvoiceStatus = z.infer<typeof invoiceStatus>;

export const invoiceListRow = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  customerName: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  currency: z.string(),
  totalCents: z.number().int(),
  outstandingCents: z.number().int(),
  status: invoiceStatus,
});

export type InvoiceListRow = z.infer<typeof invoiceListRow>;

export const invoiceDetail = invoiceListRow.extend({
  dueDateSource: z.enum(DUE_DATE_SOURCES),
  paymentTerms: z.string().nullable(),
  description: z.string().nullable(),
  allocatedCents: z.number().int(),
});

export type InvoiceDetail = z.infer<typeof invoiceDetail>;

/** One payment's three states, in the words of R-31. */
export const PAYMENT_STATUSES = [
  "allocated",
  "part-allocated",
  "unallocated",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** One payment as the list shows it, its unallocated money read into its status. */
export const paymentListRow = z.object({
  id: z.string(),
  reference: z.string().nullable(),
  customerName: z.string(),
  paymentDate: z.string(),
  method: z.string().nullable(),
  currency: z.string(),
  amountCents: z.number().int(),
  unallocatedCents: z.number().int(),
  status: z.enum(PAYMENT_STATUSES),
});

export type PaymentListRow = z.infer<typeof paymentListRow>;

/** One link of a payment to an invoice, as `invoices.allocations` answers it. */
export const allocationRow = z.object({
  id: z.string(),
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  paymentId: z.string(),
  paymentReference: z.string().nullable(),
  paymentDate: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
  automatic: z.boolean(),
});

export type AllocationRow = z.infer<typeof allocationRow>;

/** One change of a link, oldest first. An unlinked link keeps its events. */
export const historyRow = allocationRow.omit({ amountCents: true }).extend({
  action: z.enum(["linked", "changed", "unlinked"]),
  occurredAt: z.string(),
  amountBeforeCents: z.number().int(),
  amountAfterCents: z.number().int(),
});

export type HistoryRow = z.infer<typeof historyRow>;

/** A record dated after the reporting date is in no balance yet, so it shows a note (P7). */
const afterReportingDate = z.object({
  kind: z.literal("after-reporting-date"),
  asOf: z.string(),
  label: z.string(),
});

/** `canWrite` is `invoices:write` on the record, which shows the link controls (R-32). */
const shownRecord = z.object({
  kind: z.literal("shown"),
  asOf: z.string(),
  timeZone: z.string(),
  canWrite: z.boolean(),
  allocations: z.array(allocationRow),
  history: z.array(historyRow),
  documentUrl: z.string().nullable(),
});

export const invoiceRecordView = z.discriminatedUnion("kind", [
  shownRecord.extend({ invoice: invoiceDetail }),
  afterReportingDate,
]);

export type InvoiceRecordView = z.infer<typeof invoiceRecordView>;

export const paymentRecordView = z.discriminatedUnion("kind", [
  shownRecord.extend({
    payment: paymentListRow.extend({
      allocatedCents: z.number().int(),
      customerId: z.string(),
    }),
  }),
  afterReportingDate,
]);

export type PaymentRecordView = z.infer<typeof paymentRecordView>;

export const invoicesContract = {
  /** Every document, newest first, for a tenant-wide reader (R-37, decision 12). */
  listDocuments: oc
    .route({ method: "GET", path: "/invoices/documents" })
    .output(documentInboxView),
  /** One document with its reading, file link, customer and payment proposal (R-30, R-38). */
  getDocumentReview: oc
    .route({ method: "GET", path: "/invoices/documents/{id}" })
    .input(z.object({ id: recordId }))
    .output(documentReviewView),
  /** One invoice as of the reporting date, for a reader of it; the record page refetches it (decision 4). */
  getInvoiceRecord: oc
    .route({ method: "GET", path: "/invoices/invoices/{id}" })
    .input(z.object({ id: recordId }))
    .output(invoiceRecordView),
  /** One payment as of the reporting date, for a reader of it; the record page refetches it (decision 4). */
  getPaymentRecord: oc
    .route({ method: "GET", path: "/invoices/payments/{id}" })
    .input(z.object({ id: recordId }))
    .output(paymentRecordView),
  /** Changes the type of a read document with no saved record, for a tenant-wide writer (R-27). */
  setDocumentKind: oc
    .route({ method: "PATCH", path: "/invoices/documents/{id}" })
    .input(z.object({ id: recordId, kind: z.enum(DOCUMENT_KINDS) }))
    .output(z.object({ documentId: z.string(), kind: z.enum(DOCUMENT_KINDS) })),
  /** Deletes a document with no saved record, its field origins and its file (R-33). */
  discardDocument: oc
    .route({ method: "DELETE", path: "/invoices/documents/{id}" })
    .input(z.object({ id: recordId }))
    .output(z.object({ documentId: z.string() })),
  /** A customer's open invoices in one currency, oldest first, for a reader of the customer. */
  listOpenInvoices: oc
    .route({
      method: "GET",
      path: "/invoices/customers/{customerId}/open-invoices",
    })
    .input(z.object({ customerId: recordId, currency: currencyCode }))
    .output(openInvoicesView),
  /** Stores one PDF once per exact file, for the reading job (R-23, decisions 9 and 10). */
  uploadDocument: oc
    .route({ method: "POST", path: "/invoices/documents" })
    .input(z.object({ file: z.file() }))
    .output(uploadDocumentOutput),
  /** Reads a Could not read document again, from its first attempt (R-26). */
  retryReading: oc
    .route({ method: "POST", path: "/invoices/documents/{id}/retry" })
    .input(z.object({ id: recordId }))
    .output(z.object({ documentId: z.string() })),
  /** Saves an invoice as unpaid, then links the saved payments that name it (R-29, R-31, R-33). */
  saveInvoice: oc
    .route({ method: "POST", path: "/invoices/invoices" })
    .input(saveInvoiceInput)
    .output(saveInvoiceOutput),
  /** Saves a payment with the links the person chose, all or nothing (R-33, R-34). */
  savePayment: oc
    .route({ method: "POST", path: "/invoices/payments" })
    .input(savePaymentInput)
    .output(savePaymentOutput),
  /** Saves a paid receipt as one invoice, one payment and one link of the full amount (R-33). */
  savePaidReceipt: oc
    .route({ method: "POST", path: "/invoices/receipts" })
    .input(savePaidReceiptInput)
    .output(savePaidReceiptOutput),
  /** Corrects an invoice total. Below its allocations, it asks which links to reduce (R-32). */
  correctInvoiceTotal: oc
    .route({ method: "PATCH", path: "/invoices/invoices/{id}" })
    .input(correctInvoiceTotalInput)
    .output(correctInvoiceTotalOutput),
  /** Links an amount of a payment to an invoice of the same customer and currency (R-32, R-34). */
  linkPayment: oc
    .route({ method: "POST", path: "/invoices/allocations" })
    .input(
      z.object({ invoiceId: recordId, paymentId: recordId, amountCents: cents })
    )
    .output(z.object({ allocationId: z.string() })),
  /** Changes the amount of one link. A changed automatic link becomes a person's link. */
  changeAllocation: oc
    .route({ method: "PATCH", path: "/invoices/allocations/{id}" })
    .input(z.object({ id: recordId, amountCents: cents }))
    .output(z.object({ allocationId: z.string() })),
  /** Removes one link. Its amount returns to the payment as unallocated. */
  unlinkAllocation: oc
    .route({ method: "DELETE", path: "/invoices/allocations/{id}" })
    .input(z.object({ id: recordId }))
    .output(z.object({ unlinkedCents: z.number() })),
};

export type InvoicesContract = typeof invoicesContract;
