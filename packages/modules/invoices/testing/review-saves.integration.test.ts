import { createHash, randomUUID } from "node:crypto";

import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
  withTransaction,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StoredReading } from "../src/contract.ts";
import { invoicesModule } from "../src/module.ts";
import { invoicesRouter } from "../src/router.ts";
import {
  insertCustomer,
  insertDocument,
  insertFieldOrigin,
  insertInvoice,
} from "./factories.ts";
import { untilWaiting } from "./locks.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The review writes on a real Postgres (R-27, R-30, R-31, R-33, czjw.27, decisions 6 to 8): the
 * origin marks of a person's save, a type change, a discard, and the document row as the first
 * lock of each. Every case makes its own customer and document, so the cases share one deployment.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let finance: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["invoices"]);
  ({ userId: finance } = await insertPersonWith(deployment.context, [
    "invoices:use",
    "invoices:read",
    "invoices:write",
  ]));
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const t = () => deployment.context;

const api = () =>
  callProcedure(invoicesRouter, {
    tenant: t(),
    caller: principalFor({
      tenant: t(),
      modules: [invoicesModule],
      userId: finance,
      authenticated: true,
    }),
  } satisfies ModuleRequestContext);

const onPage1 = (value: string, quote = `Found: ${value}`) => ({
  value,
  quote,
  page: 1,
});

/** A read document with its reading and one `extracted` row per kept value, as the reading job stores them. */
async function readDocument(
  kind: "invoice" | "payment" | "paid-receipt",
  reading: StoredReading
): Promise<string> {
  const { id } = await insertDocument(t(), { kind, reading });
  const [firstNumber] = reading.invoiceNumbers;

  await Promise.all([
    ...Object.entries(reading.fields).map(([field, read]) =>
      insertFieldOrigin(t(), { documentId: id, field, ...read })
    ),
    ...(firstNumber === undefined
      ? []
      : [
          insertFieldOrigin(t(), {
            documentId: id,
            field: "invoiceNumbers",
            quote: firstNumber.quote,
            page: firstNumber.page,
          }),
        ]),
  ]);

  return id;
}

/** The document's origin rows by field, read with SQL. */
async function originsOf(documentId: string) {
  const { rows } = await t().db.$client.query<{
    field: string;
    origin: string;
    quote: string | null;
    page: number | null;
  }>(
    "select field, origin, quote, page from field_origin where document_id = $1 order by field",
    [documentId]
  );

  return Object.fromEntries(
    rows.map(({ field, ...row }) => [field, row] as const)
  );
}

async function auditsOf(documentId: string) {
  const { rows } = await t().db.$client.query(
    "select action, metadata from audit_event where target_id::text = $1 order by occurred_at",
    [documentId]
  );

  return rows;
}

/** The document row, its origins, its records, its file and its audit rows, read with SQL. */
async function documentState(documentId: string) {
  const { rows } = await t().db.$client.query(
    `select (select row_to_json(d) from document d where d.id = $1) as document,
      (select count(*)::int from field_origin where document_id = $1) as origins,
      (select count(*)::int from invoice where document_id = $1) as invoices,
      (select count(*)::int from payment where document_id = $1) as payments,
      (select count(*)::int from file f join document d on d.file_id = f.id where d.id = $1) as files,
      (select count(*)::int from audit_event where target_id::text = $1::text) as audits`,
    [documentId]
  );

  return rows[0];
}

const anInvoiceSave = (
  documentId: string,
  customerId: string,
  totalCents = 500_000
) => ({
  documentId,
  customer: { id: customerId },
  number: "INV-REVIEW-1",
  invoiceDate: "2026-10-26",
  dueDate: null,
  dueDateSource: "unspecified" as const,
  paymentTerms: null,
  currency: "SGD",
  totalCents,
  description: null,
  keepPossibleDuplicate: false,
});

const SAVES = {
  saveInvoice: (documentId: string, customerId: string, totalCents: number) =>
    api().saveInvoice(anInvoiceSave(documentId, customerId, totalCents)),
  savePaidReceipt: (
    documentId: string,
    customerId: string,
    totalCents: number
  ) =>
    api().savePaidReceipt({
      documentId,
      customer: { id: customerId },
      number: "INV-REVIEW-1",
      date: "2026-10-26",
      dueDate: null,
      dueDateSource: "unspecified",
      currency: "SGD",
      totalCents,
      description: null,
      reference: null,
      method: null,
      keepPossibleDuplicate: false,
    }),
} as const;

async function savedDocument(): Promise<string> {
  const { id } = await insertDocument(t(), { kind: "invoice" });
  const { id: customerId } = await insertCustomer(t());

  await insertInvoice(t(), { customerId, documentId: id });

  return id;
}

async function documentInReading(): Promise<string> {
  return (await insertDocument(t(), { kind: null, readingStatus: "reading" }))
    .id;
}

describe("review saves", () => {
  it("a payment saved from its reading with a changed amount marks only the amount corrected, and a method typed in entered", async () => {
    const { id: customerId } = await insertCustomer(t(), {
      name: "Orchid Retail",
    });
    const documentId = await readDocument("payment", {
      fields: {
        customer: onPage1("Orchid Retail"),
        date: onPage1("2026-10-20"),
        currency: onPage1("SGD"),
        amount: onPage1("8250.00", "Amount paid SGD 8,250.00"),
      },
      invoiceNumbers: [onPage1("INV-2026-08-04"), onPage1("INV-2026-09-04")],
      dropped: [],
    });

    await expect(
      api().savePayment({
        documentId,
        customer: { id: customerId },
        paymentDate: "2026-10-20",
        currency: "SGD",
        amountCents: 800_000,
        reference: null,
        method: "Bank transfer",
        namedInvoiceNumbers: ["INV-2026-09-04", "INV-2026-08-04"],
        allocations: [],
        keepPossibleDuplicate: false,
      })
    ).resolves.toMatchObject({ outcome: "saved" });

    expect(await originsOf(documentId)).toEqual({
      amount: {
        origin: "corrected",
        quote: "Amount paid SGD 8,250.00",
        page: 1,
      },
      currency: expect.objectContaining({ origin: "extracted" }),
      customer: expect.objectContaining({ origin: "extracted" }),
      date: expect.objectContaining({ origin: "extracted" }),
      invoiceNumbers: expect.objectContaining({ origin: "extracted" }),
      method: { origin: "entered", quote: null, page: null },
    });
  });

  it.each(["saveInvoice", "savePaidReceipt"] as const)(
    "an invoice and a paid receipt saved with a changed total mark the total corrected and keep the rest (%s)",
    async (save) => {
      const name = `Lotus Foods ${randomUUID()}`;
      const { id: customerId } = await insertCustomer(t(), { name });
      const documentId = await readDocument(
        save === "saveInvoice" ? "invoice" : "paid-receipt",
        {
          fields: {
            customer: onPage1(name),
            number: onPage1("INV-REVIEW-1"),
            date: onPage1("2026-10-26"),
            currency: onPage1("SGD"),
            amount: onPage1("5000.00", "TOTAL (SGD) 5,000.00"),
          },
          invoiceNumbers: [],
          dropped: [],
        }
      );

      await expect(
        SAVES[save](documentId, customerId, 400_000)
      ).resolves.toMatchObject({ outcome: "saved" });

      const extracted = expect.objectContaining({ origin: "extracted" });

      expect(await originsOf(documentId)).toEqual({
        amount: { origin: "corrected", quote: "TOTAL (SGD) 5,000.00", page: 1 },
        currency: extracted,
        customer: extracted,
        date: extracted,
        number: extracted,
      });
    }
  );

  it("a type change lets a hand save of an AI-off document go through, and is audited", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id } = await insertDocument(t(), {
      kind: null,
      readingOutcome: "ai-off",
    });

    await expect(
      api().setDocumentKind({ id, kind: "invoice" })
    ).resolves.toEqual({ documentId: id, kind: "invoice" });
    await expect(
      api().saveInvoice(anInvoiceSave(id, customerId))
    ).resolves.toMatchObject({ outcome: "saved" });

    expect(await documentState(id)).toMatchObject({
      document: { kind: "invoice", reading_outcome: "ai-off" },
      origins: 0,
    });
    expect(await auditsOf(id)).toEqual([
      {
        action: "invoices:document-kind-changed",
        metadata: { from: "none", to: "invoice" },
      },
    ]);
  });

  it("a type change clears a stale match outcome", async () => {
    const { id } = await insertDocument(t(), {
      kind: "payment",
      readingOutcome: "no-match",
    });

    await api().setDocumentKind({ id, kind: "invoice" });

    expect(await documentState(id)).toMatchObject({
      document: { kind: "invoice", reading_outcome: null },
    });
    expect(
      (await api().listDocuments()).rows.find((row) => row.id === id)
    ).toMatchObject({ kind: "invoice", status: "needs-input" });
  });

  it.each([
    [
      "a type change",
      "a saved document",
      savedDocument,
      "invoices:document-already-saved",
    ],
    [
      "a type change",
      "a document still being read",
      documentInReading,
      "invoices:document-not-read",
    ],
    [
      "a discard",
      "a saved document",
      savedDocument,
      "invoices:document-already-saved",
    ],
    [
      "a discard",
      "a document still being read",
      documentInReading,
      "invoices:document-not-read",
    ],
  ] as const)(
    "refuses a type change or a discard of a saved document, or of one still being read: %s of %s",
    async (action, _, documentOf, code) => {
      const id = await documentOf();
      const before = await documentState(id);

      await expect(
        action === "a type change"
          ? api().setDocumentKind({ id, kind: "purchase-order" })
          : api().discardDocument({ id })
      ).rejects.toMatchObject({ code });
      expect(await documentState(id)).toEqual(before);
    }
  );

  it("a discard removes the document, its origins and its file, is audited, and the same file uploads again as new", async () => {
    const bytes = Buffer.from(`%PDF-1.7 ${randomUUID()}`);
    const { id: fileId } = await withTransaction(t(), (tx) =>
      t().fileStorage.store(
        {
          fileName: "receipt.pdf",
          mimeType: "application/pdf",
          bytes,
          uploadedByUserId: finance,
        },
        tx
      )
    );
    const { id } = await insertDocument(t(), {
      kind: "invoice",
      fileId,
      fileName: "receipt.pdf",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      readingOutcome: "possible-duplicate",
    });
    await insertFieldOrigin(t(), { documentId: id, field: "amount" });

    await expect(api().discardDocument({ id })).resolves.toEqual({
      documentId: id,
    });

    const { rows } = await t().db.$client.query(
      "select (select count(*)::int from document where id = $1) as documents, (select count(*)::int from field_origin where document_id = $1) as origins, (select count(*)::int from file where id = $2) as files",
      [id, fileId]
    );
    expect(rows[0]).toEqual({ documents: 0, origins: 0, files: 0 });
    expect(await auditsOf(id)).toEqual([
      {
        action: "invoices:document-discarded",
        metadata: { fileName: "receipt.pdf" },
      },
    ]);
    await expect(
      api().uploadDocument({
        file: new File([bytes], "receipt.pdf", { type: "application/pdf" }),
      })
    ).resolves.toMatchObject({ outcome: "uploaded" });
  });

  it.each([
    [
      "a type change waits for a save that holds the document and is refused",
      "invoice",
      [
        "insert into invoice (document_id, customer_id, number, invoice_date, due_date_source, currency, total_cents) values ($1, $2, 'INV-HELD', '2026-10-26', 'unspecified', 'SGD', 1000)",
        true,
      ],
      (documentId: string) =>
        api().setDocumentKind({ id: documentId, kind: "purchase-order" }),
      "invoices:document-already-saved",
      { kind: "invoice", invoices: 1 },
    ],
    [
      "a save waits for a type change to purchase-order and is refused",
      "invoice",
      ["update document set kind = 'purchase-order' where id = $1", false],
      (documentId: string, customerId: string) =>
        api().saveInvoice(anInvoiceSave(documentId, customerId)),
      "invoices:document-kind-mismatch",
      { kind: "purchase-order", invoices: 0 },
    ],
  ] as const)(
    "two people on one document: the second waits for the first and is refused (%s)",
    async (_, kind, [held, withCustomer], call, code, after) => {
      const { id: customerId } = await insertCustomer(t());
      const { id } = await insertDocument(t(), { kind });
      const hold = await t().db.$client.connect();

      try {
        await hold.query("begin");
        await hold.query("select 1 from document where id = $1 for update", [
          id,
        ]);
        await hold.query(held, withCustomer ? [id, customerId] : [id]);

        const second = call(id, customerId);
        const waited = await untilWaiting(t().db, 1);
        await hold.query("commit");

        await expect(second).rejects.toMatchObject({ code });
        // The second call really waited on the document, so the case is a race.
        expect(waited).toBe(1);

        const state = await documentState(id);
        expect({
          kind: state?.document.kind,
          invoices: state?.invoices,
        }).toEqual(after);
      } finally {
        // Destroyed, not pooled: a hold that failed before its commit still owns the lock.
        hold.release(true);
      }
    },
    30000
  );
});
