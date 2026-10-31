import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
  seedRoles,
  withTransaction,
} from "@genie/core";
import {
  assignRole,
  enableModules,
  insertPersonWith,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StoredReading } from "../src/contract.ts";
import { invoicesModule } from "../src/module.ts";
import { invoicesRouter } from "../src/router.ts";
import { readDemoFile } from "./demo-pack.ts";
import {
  insertAllocation,
  insertCustomer,
  insertDocument,
  insertInvoice,
  insertPayment,
} from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The review read of one document on a real Postgres (R-30, R-38, DEC-39, decisions 3 and 5). A
 * document has no customer before a save, so only a tenant-wide reader reads its review.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const t = () => deployment.context;

async function personWithSeededRole(name: string): Promise<string> {
  const { rows } = await t().db.$client.query<{ id: string }>(
    "select id from role where name = $1",
    [name]
  );
  const roleId = rows[0]?.id;

  if (roleId === undefined) throw new Error(`no seeded role ${name}`);

  const userId = await insertUser(t());

  await assignRole(t(), { roleId, principal: { type: "user", id: userId } });

  return userId;
}

let finance: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  await markSetupDone(t());
  await enableModules(t(), ["invoices"]);
  await seedRoles(t(), [invoicesModule]);
  registerModuleRuntime(t(), [invoicesModule]);
  finance = await personWithSeededRole("Finance");
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const as = (userId: string): ModuleRequestContext => ({
  tenant: t(),
  caller: principalFor({
    tenant: t(),
    modules: [invoicesModule],
    userId,
    authenticated: true,
  }),
});

const api = (userId: string) => callProcedure(invoicesRouter, as(userId));

const onPage1 = (value: string, quote = value) => ({ value, quote, page: 1 });

/** The values and quotes of `model-recordings/read-01-invoice.json`. */
const READING_01: StoredReading = {
  fields: {
    customer: onPage1("ABC Trading", "Bill to: ABC Trading"),
    number: onPage1("INV-LIVE-001", "Invoice number INV-LIVE-001"),
    date: onPage1("2026-10-26", "Invoice date 2026-10-26"),
    currency: onPage1("SGD", "Currency: SGD"),
    amount: onPage1("5000.00", "TOTAL (SGD) 5,000.00"),
    description: onPage1("Additional consulting project - October 2026"),
  },
  invoiceNumbers: [],
  dropped: [],
};

/** A payment reading of Orchid Retail in SGD. */
const orchidReading = (
  amount: string,
  numbers: readonly string[],
  date: string
): StoredReading => ({
  fields: {
    customer: onPage1("Orchid Retail"),
    currency: onPage1("SGD"),
    amount: onPage1(amount),
    date: onPage1(date),
  },
  invoiceNumbers: numbers.map((number) => onPage1(number)),
  dropped: [],
});

const FILE_01 = "01_Invoice_Missing_Due_Date.pdf";

async function storedFile(name: string, bytes: Buffer): Promise<string> {
  const { id } = await withTransaction(t(), (tx) =>
    t().fileStorage.store(
      {
        fileName: name,
        mimeType: "application/pdf",
        bytes,
        uploadedByUserId: finance,
      },
      tx
    )
  );

  return id;
}

describe("the document review", () => {
  it("answers a read invoice document with its reading, a link to its own bytes and the customer it names", async () => {
    const bytes = readDemoFile(`03_Live_Upload_Documents/${FILE_01}`);
    const { id: customerId } = await insertCustomer(t(), {
      name: "ABC TRADING ",
    });
    const { id } = await insertDocument(t(), {
      kind: "invoice",
      fileId: await storedFile(FILE_01, bytes),
      fileName: FILE_01,
      reading: READING_01,
    });

    const review = await api(finance).getDocumentReview({ id });

    expect(review).toMatchObject({
      document: {
        id,
        label: FILE_01,
        kind: "invoice",
        status: "needs-input",
        reason: null,
      },
      reading: READING_01,
      canWrite: true,
      customerMatch: { id: customerId, name: "ABC TRADING " },
      payment: null,
      saved: null,
    });
    expect(review.customers).toContainEqual({
      id: customerId,
      name: "ABC TRADING ",
    });

    const token = new URL(review.document.fileUrl).searchParams.get("token");
    const fetched = await t().fileStorage.fetchLink({
      token: token ?? "",
      principal: as(finance).caller,
    });
    expect(fetched.bytes.equals(bytes)).toBe(true);

    await expect(
      as(finance).caller.recordOf({ type: "invoices-document", id })
    ).resolves.toEqual({
      label: FILE_01,
      path: `/m/invoices/documents/${id}`,
    });
  });

  it("refuses a reader scoped to one customer, gives a Viewer no write, and lists open invoices only to a reader of the customer", async () => {
    const { id: customerA } = await insertCustomer(t());
    const { id: customerB } = await insertCustomer(t());
    const open = await insertInvoice(t(), {
      customerId: customerA,
      number: "INV-A-1",
      totalCents: 30_000,
    });
    const { id } = await insertDocument(t(), { kind: "invoice" });
    const { userId: scoped } = await insertPersonWith(
      t(),
      ["invoices:use", "invoices:read"],
      { type: "invoices-customer", id: customerA }
    );

    await expect(api(scoped).getDocumentReview({ id })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      api(scoped).listOpenInvoices({ customerId: customerA, currency: "SGD" })
    ).resolves.toEqual({
      rows: [
        {
          invoiceId: open.id,
          number: "INV-A-1",
          invoiceDate: "2026-10-01",
          dueDate: "2026-10-15",
          currency: "SGD",
          openCents: 30_000,
        },
      ],
      truncated: false,
    });
    await expect(
      api(scoped).listOpenInvoices({ customerId: customerB, currency: "SGD" })
    ).rejects.toMatchObject({ code: "forbidden" });

    const viewer = await personWithSeededRole("Viewer");

    await expect(api(viewer).getDocumentReview({ id })).resolves.toMatchObject({
      canWrite: false,
    });
  });

  describe("proposes the R-30 match over the open amounts after all links", () => {
    const invoices: Record<string, string> = {};
    let orchid: string;

    beforeAll(async () => {
      ({ id: orchid } = await insertCustomer(t(), { name: "Orchid Retail" }));

      const add = async (number: string, date: string, total: number) => {
        invoices[number] = (
          await insertInvoice(t(), {
            customerId: orchid,
            number,
            invoiceDate: date,
            totalCents: total,
          })
        ).id;
      };
      await add("INV-2026-07-01", "2026-07-01", 100_000);
      await add("INV-2026-08-04", "2026-08-04", 520_000);
      await add("INV-2026-09-04", "2026-09-04", 420_000);

      // One earlier payment pays 07-01 in full and 115,000 of 08-04, so 405,000 of it stays open.
      const { id: paymentId } = await insertPayment(t(), {
        customerId: orchid,
        amountCents: 215_000,
      });
      await insertAllocation(t(), {
        invoiceId: invoices["INV-2026-07-01"] ?? "",
        paymentId,
        amountCents: 100_000,
      });
      await insertAllocation(t(), {
        invoiceId: invoices["INV-2026-08-04"] ?? "",
        paymentId,
        amountCents: 115_000,
      });
    });

    it.each([
      {
        name: "two named invoices split",
        reading: () =>
          orchidReading(
            "8250.00",
            ["INV-2026-08-04", "INV-2026-09-04"],
            "2026-10-28"
          ),
        proposal: () => ({
          kind: "split",
          parts: [
            { invoiceId: invoices["INV-2026-08-04"], amountCents: 405_000 },
            { invoiceId: invoices["INV-2026-09-04"], amountCents: 420_000 },
          ],
          unallocatedCents: 0,
        }),
        duplicate: false,
      },
      {
        name: "no number suggests by amount",
        reading: () => orchidReading("4200.00", [], "2026-10-28"),
        proposal: () => ({
          kind: "suggestions",
          invoiceIds: [invoices["INV-2026-09-04"]],
        }),
        duplicate: false,
      },
      {
        name: "the facts of a saved payment",
        reading: () => orchidReading("8250.00", [], "2026-10-27"),
        proposal: () => ({ kind: "no-match" }),
        duplicate: true,
      },
    ])("$name", async ({ reading: readingOf, proposal, duplicate }) => {
      const earlier = duplicate
        ? await insertPayment(t(), {
            customerId: orchid,
            paymentDate: "2026-10-27",
            currency: "SGD",
            amountCents: 825_000,
          })
        : undefined;
      const { id } = await insertDocument(t(), {
        kind: "payment",
        reading: readingOf(),
      });

      const review = await api(finance).getDocumentReview({ id });

      expect(review.customerMatch).toEqual({
        id: orchid,
        name: "Orchid Retail",
      });
      expect(review.payment).toEqual({
        openInvoices: [
          {
            invoiceId: invoices["INV-2026-08-04"],
            number: "INV-2026-08-04",
            invoiceDate: "2026-08-04",
            dueDate: "2026-10-15",
            currency: "SGD",
            openCents: 405_000,
          },
          {
            invoiceId: invoices["INV-2026-09-04"],
            number: "INV-2026-09-04",
            invoiceDate: "2026-09-04",
            dueDate: "2026-10-15",
            currency: "SGD",
            openCents: 420_000,
          },
        ],
        proposal: proposal(),
        possibleDuplicateOf: earlier?.id ?? null,
      });
    });
  });

  it("answers the records saved from a payment document and its automatic link", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id } = await insertDocument(t(), { kind: "payment" });
    const { id: invoiceId } = await insertInvoice(t(), {
      customerId,
      number: "INV-AUTO-1",
    });
    const { id: paymentId } = await insertPayment(t(), {
      customerId,
      reference: "TRF-AUTO-1",
      paymentDate: "2026-10-20",
      amountCents: 61_000,
      documentId: id,
    });
    const link = await insertAllocation(t(), {
      invoiceId,
      paymentId,
      amountCents: 60_000,
      automatic: true,
    });
    // A link the person made from the same payment is not offered for Undo.
    const { id: other } = await insertInvoice(t(), { customerId });
    await insertAllocation(t(), {
      invoiceId: other,
      paymentId,
      amountCents: 1_000,
    });

    const review = await api(finance).getDocumentReview({ id });

    expect(review.document.status).toBe("linked-automatically");
    expect(review.payment).toBeNull();
    expect(review.saved).toEqual({
      invoice: null,
      payment: {
        id: paymentId,
        reference: "TRF-AUTO-1",
        paymentDate: "2026-10-20",
      },
      automaticLinks: [
        {
          allocationId: link.id,
          invoiceId,
          invoiceNumber: "INV-AUTO-1",
          paymentId,
          paymentReference: "TRF-AUTO-1",
          paymentDate: "2026-10-20",
          currency: "SGD",
          amountCents: 60_000,
        },
      ],
    });
  });
});
