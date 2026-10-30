import {
  callProcedure,
  createTenantContext,
  type DatasetQuery,
  type ModuleRequestContext,
  principalFor,
  queryDataset,
  registerModuleRuntime,
  type TenantContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  type JsonValue,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import { invoicesRouter } from "../src/router.ts";
import { MATCH_FACT_FIELDS } from "../src/services/ledger/documents.ts";
import { recordPaymentFromReading } from "../src/services/ledger/payments.ts";
import { type DemoHistoryIds, readDemoJson, toCents } from "./demo-pack.ts";
import { seedDemoHistory } from "./demo-seed.ts";
import { insertDocument, insertFieldOrigin } from "./factories.ts";
import { runningTotals } from "./live-totals.ts";

/**
 * The seven live uploads of the demo pack replayed at the record level, because reading the PDFs
 * is S7-08's job (B9.1). The pack's history is saved first, then each upload runs through the
 * procedures, and the four running totals after every step are compared with
 * `expected_live_running_totals.json`. No figure comes from this module's formulas.
 */
type LiveTotals = {
  readonly steps: readonly {
    readonly after_upload: string;
    readonly total_invoiced_sales: number;
    readonly total_collected: number;
    readonly outstanding: number;
    readonly overdue: number;
  }[];
};

type Rows = readonly Readonly<Record<string, JsonValue>>[];

// SAFETY: the demo pack's expected file is read verbatim and this test owns its shape.
const LIVE_TOTALS = readDemoJson(
  "04_Demo_Guide/expected_live_running_totals.json"
) as LiveTotals;

// Uploads 02 and 04 are the same bytes, so they carry the same SHA-256. Reading the PDFs is
// S7-08's job, so the replay names the hash instead.
const DUPLICATE_PAYMENT_SHA = "02".repeat(32);

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** Built after the reporting date was set, so its settings reader sees it (DEC-46). */
let tenant: TenantContext;

let financeUserId: string;

let ids: DemoHistoryIds;

function contextFor(userId: string): ModuleRequestContext {
  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [invoicesModule],
      userId,
      authenticated: true,
    }),
  };
}

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  const setup = deployment.context;

  await markSetupDone(setup);
  await enableModules(setup, ["invoices"]);
  await setup.db.$client.query(
    "update tenant_settings set reporting_date = '2026-10-27'"
  );
  tenant = createTenantContext(
    {
      DATABASE_URL: setup.env.databaseUrl,
      PUBLIC_URL: setup.env.publicUrl,
    },
    { error: () => {}, info: () => {}, debug: () => {} },
    ["invoices"]
  );
  registerModuleRuntime(tenant, [invoicesModule]);
  ({ userId: financeUserId } = await insertPersonWith(tenant, [
    "invoices:read",
    "invoices:write",
  ]));
  ({ ids } = await seedDemoHistory(tenant, { userId: financeUserId }));
}, 120000);

afterAll(async () => {
  await tenant?.db.$client.end();
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function demoId(map: ReadonlyMap<string, string>, key: string): string {
  const id = map.get(key);

  if (id === undefined) {
    throw new Error(`The demo history saved no ${key}.`);
  }

  return id;
}

async function rows(dataset: string, query: DatasetQuery): Promise<Rows> {
  return (await queryDataset(contextFor(financeUserId), { dataset, query }))
    .rows;
}

/** Compares the four totals with the guide's step for this upload, both as integer cents. */
async function expectTotalsAfter(upload: string): Promise<void> {
  const step = LIVE_TOTALS.steps.find(
    (candidate) => candidate.after_upload === upload
  );

  if (step === undefined) {
    throw new Error(`The guide has no running totals after ${upload}.`);
  }

  expect(await runningTotals(contextFor(financeUserId))).toEqual({
    invoicedCents: toCents(step.total_invoiced_sales),
    collectedCents: toCents(step.total_collected),
    outstandingCents: toCents(step.outstanding),
    overdueCents: toCents(step.overdue),
  });
}

async function outstandingOf(invoiceNumber: string): Promise<number> {
  const [row] = await rows("invoices.invoices", {
    select: ["outstandingCents"],
    filters: [{ field: "invoiceNumber", op: "eq", value: invoiceNumber }],
  });

  return Number(row?.outstandingCents ?? 0);
}

async function paidLateOf(invoiceNumber: string): Promise<JsonValue> {
  const [row] = await rows("invoices.invoices", {
    select: ["paidLate"],
    filters: [{ field: "invoiceNumber", op: "eq", value: invoiceNumber }],
  });

  return row?.paidLate ?? null;
}

async function paymentsOf(
  customerName: string,
  amountCents: number
): Promise<number> {
  const [row] = await rows("invoices.payments", {
    filters: [
      { field: "customerName", op: "eq", value: customerName },
      { field: "amountCents", op: "eq", value: amountCents },
    ],
    aggregates: [{ fn: "count", as: "count" }],
  });

  return Number(row?.count ?? 0);
}

/** A payment document whose customer, invoice numbers and amount all passed the quote check. */
async function extractedPaymentDocument(sha256?: string): Promise<string> {
  const document = await insertDocument(
    tenant,
    sha256 === undefined ? { kind: "payment" } : { kind: "payment", sha256 }
  );

  await Promise.all(
    MATCH_FACT_FIELDS.map((field) =>
      insertFieldOrigin(tenant, { documentId: document.id, field })
    )
  );

  return document.id;
}

describe("live uploads", () => {
  it("replays the seven live uploads to expected_live_running_totals.json after each step", async () => {
    const procedures = callProcedure(invoicesRouter, contextFor(financeUserId));
    const abcTrading = demoId(ids.customers, "C001");

    // 01: an invoice without a due date, whose date the person enters for the walkthrough.
    const invoiceDocument = await insertDocument(tenant, { kind: "invoice" });

    await expect(
      procedures.saveInvoice({
        documentId: invoiceDocument.id,
        customer: { id: abcTrading },
        number: "INV-LIVE-001",
        invoiceDate: "2026-10-26",
        dueDate: "2026-11-25",
        dueDateSource: "person",
        paymentTerms: null,
        currency: "SGD",
        totalCents: 500_000,
        description: null,
        keepPossibleDuplicate: false,
      })
    ).resolves.toMatchObject({ outcome: "saved" });

    await expectTotalsAfter("01_Invoice_Missing_Due_Date.pdf");

    // 02: a partial payment that names one invoice alone, so R-30 links it by itself.
    const partialDocument = await extractedPaymentDocument(
      DUPLICATE_PAYMENT_SHA
    );

    const partialReading = {
      documentId: partialDocument,
      customerName: "Harbor Foods",
      paymentDate: "2026-10-26",
      currency: "SGD",
      amountCents: 300_000,
      reference: "HF-SEP-FINAL-PART",
      method: null,
      namedInvoiceNumbers: ["INV-2026-09-03"],
    };

    await expect(
      recordPaymentFromReading(contextFor(financeUserId), partialReading)
    ).resolves.toEqual({
      outcome: "saved",
      paymentId: expect.any(String),
      customerId: demoId(ids.customers, "C003"),
      allocationId: expect.any(String),
      invoiceId: demoId(ids.invoices, "INV-2026-09-03"),
      amountCents: 300_000,
    });
    expect(await outstandingOf("INV-2026-09-03")).toBe(220_000);

    await expectTotalsAfter("02_Payment_Partial_Existing_Invoice.pdf");

    // 03: one payment covering two invoices waits for the person, who confirms the split.
    const orchidDocument = await extractedPaymentDocument();

    const orchidReading = {
      documentId: orchidDocument,
      customerName: "Orchid Retail",
      paymentDate: "2026-10-27",
      currency: "SGD",
      amountCents: 825_000,
      reference: "OR-AUG-SEP-BUNDLE",
      method: null,
      namedInvoiceNumbers: ["INV-2026-08-04", "INV-2026-09-04"],
    };

    const orchid = demoId(ids.customers, "C004");
    const orchidAugust = demoId(ids.invoices, "INV-2026-08-04");
    const orchidSeptember = demoId(ids.invoices, "INV-2026-09-04");

    await expect(
      recordPaymentFromReading(contextFor(financeUserId), orchidReading)
    ).resolves.toEqual({
      outcome: "needs-review",
      customerId: orchid,
      match: {
        kind: "split",
        parts: [
          { invoiceId: orchidAugust, amountCents: 405_000 },
          { invoiceId: orchidSeptember, amountCents: 420_000 },
        ],
        unallocatedCents: 0,
      },
    });
    await expect(
      procedures.savePayment({
        documentId: orchidDocument,
        customer: { id: orchid },
        paymentDate: "2026-10-27",
        currency: "SGD",
        amountCents: 825_000,
        reference: "OR-AUG-SEP-BUNDLE",
        method: null,
        namedInvoiceNumbers: ["INV-2026-08-04", "INV-2026-09-04"],
        allocations: [
          { invoiceId: orchidAugust, amountCents: 405_000 },
          { invoiceId: orchidSeptember, amountCents: 420_000 },
        ],
        keepPossibleDuplicate: false,
      })
    ).resolves.toMatchObject({ outcome: "saved" });
    expect(await paidLateOf("INV-2026-08-04")).toBe(true);
    expect(await paidLateOf("INV-2026-09-04")).toBe(true);

    await expectTotalsAfter("03_Payment_Covers_Two_Invoices.pdf");

    // 04: the bytes of upload 02 again, so the document hash refuses a second row and the
    // reading of the saved document answers already-saved.
    await expect(
      insertDocument(tenant, {
        kind: "payment",
        sha256: DUPLICATE_PAYMENT_SHA,
      })
    ).rejects.toThrow();
    await expect(
      recordPaymentFromReading(contextFor(financeUserId), partialReading)
    ).resolves.toEqual({
      outcome: "already-saved",
      paymentId: expect.any(String),
    });
    expect(await paymentsOf("Harbor Foods", 300_000)).toBe(1);

    await expectTotalsAfter("04_Duplicate_of_Partial_Payment.pdf");

    // 05: an unreferenced payment matching no open balance is kept unallocated.
    const meridianDocument = await extractedPaymentDocument();

    const meridianReading = {
      documentId: meridianDocument,
      customerName: "Meridian Labs",
      paymentDate: "2026-10-27",
      currency: "SGD",
      amountCents: 222_200,
      reference: "ML-UNREFERENCED",
      method: null,
      namedInvoiceNumbers: [],
    };

    const meridian = demoId(ids.customers, "C006");

    await expect(
      recordPaymentFromReading(contextFor(financeUserId), meridianReading)
    ).resolves.toEqual({
      outcome: "needs-review",
      customerId: meridian,
      match: { kind: "no-match" },
    });
    await expect(
      procedures.savePayment({
        documentId: meridianDocument,
        customer: { id: meridian },
        paymentDate: "2026-10-27",
        currency: "SGD",
        amountCents: 222_200,
        reference: "ML-UNREFERENCED",
        method: null,
        namedInvoiceNumbers: [],
        allocations: [],
        keepPossibleDuplicate: false,
      })
    ).resolves.toMatchObject({ outcome: "saved" });

    await expectTotalsAfter("05_Payment_Unmatched.pdf");

    // 06: a paid sales receipt is one invoice, one payment and one link.
    const receiptDocument = await insertDocument(tenant, {
      kind: "paid-receipt",
    });

    await expect(
      procedures.savePaidReceipt({
        documentId: receiptDocument.id,
        customer: { id: demoId(ids.customers, "C005") },
        number: "RCPT-LIVE-001",
        date: "2026-10-27",
        dueDate: null,
        dueDateSource: "unspecified",
        currency: "SGD",
        totalCents: 180_000,
        description: null,
        reference: null,
        method: null,
        keepPossibleDuplicate: false,
      })
    ).resolves.toMatchObject({ outcome: "saved" });

    await expectTotalsAfter("06_Paid_Sales_Receipt.pdf");

    // 07: a purchase order is not proof of an invoice, so the save is refused and no figure moves.
    const purchaseOrderDocument = await insertDocument(tenant, {
      kind: "purchase-order",
    });

    await expect(
      procedures.saveInvoice({
        documentId: purchaseOrderDocument.id,
        customer: { id: abcTrading },
        number: "PO-LIVE-001",
        invoiceDate: "2026-10-27",
        dueDate: null,
        dueDateSource: "unspecified",
        paymentTerms: null,
        currency: "SGD",
        totalCents: 100_000,
        description: null,
        keepPossibleDuplicate: false,
      })
    ).rejects.toMatchObject({ code: "invoices:document-kind-mismatch" });

    await expectTotalsAfter("07_Purchase_Order_Not_Proof_of_Payment.pdf");
  });
});
