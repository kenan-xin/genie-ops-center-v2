import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createTenantContext,
  JOB_STARTER_KEY,
  principalFor,
  type ModuleRequestContext,
  withTransaction,
} from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  useModelTransport,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import {
  type DocumentKind,
  fieldOrigin,
  type ReadingStatus,
  sourceDocument,
} from "../src/schema.ts";
import { loadDocumentInbox } from "../src/services/documents/inbox.ts";
import { uploadDocument } from "../src/services/documents/upload.ts";
import {
  READING_STALLS_AFTER_MINUTES,
  readingJob,
  retryReading,
} from "../src/services/reading/job.ts";
import type {
  ReadingField,
  StoredReading,
} from "../src/services/reading/stored-reading.ts";
import { LIVE_UPLOADS, readDemoFile } from "./demo-pack.ts";
import { insertDocument } from "./factories.ts";
import { INVOICES_READING_RECORDINGS } from "./index.ts";
import { BROKEN_PDF, NO_TEXT_PDF, withNewId } from "./pdf-fixtures.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The reading job on a real Postgres, the real file store and the real queue (R-12, R-26). The
 * tests call the handler as the worker does; the worker's retry mapping is core's (S7-03, AC-3).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let uploaderId: string;

let retrierId: string;

let recorded: ReturnType<typeof useRecordedModel>;

const t = () => deployment.context;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  // markSetupDone inserts the settings row that writeModelConnection updates.
  await markSetupDone(deployment.context);
  // Before the first settings read, which caches for 10 s (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["deepseek/deepseek-v4.1-flash-1017", "anthropic/claude-opus-5.5"],
    chat: "deepseek/deepseek-v4.1-flash-1017",
    document: "deepseek/deepseek-v4.1-flash-1017",
  });
  recorded = useRecordedModel(deployment.context, INVOICES_READING_RECORDINGS);
  await enableModules(deployment.context, ["invoices"]);
  const writer = ["invoices:use", "invoices:read", "invoices:write"];
  ({ userId: uploaderId } = await insertPersonWith(deployment.context, writer));
  ({ userId: retrierId } = await insertPersonWith(deployment.context, writer));
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

const ago = (minutes: number) => sql`now() - make_interval(mins => ${minutes})`;

const run = (documentId: string) =>
  readingJob.handler(as(uploaderId), { documentId });

const live01 = () =>
  withNewId(
    readDemoFile("03_Live_Upload_Documents/01_Invoice_Missing_Due_Date.pdf")
  );

const file01 = (bytes: Buffer) =>
  new File([new Uint8Array(bytes)], "01.pdf", { type: "application/pdf" });

/** Uploads a live document as the uploader and answers its id. */
async function uploaded(bytes: Buffer, name = "document.pdf") {
  const answer = await uploadDocument(
    as(uploaderId),
    new File([new Uint8Array(bytes)], name, { type: "application/pdf" })
  );

  expect(answer.outcome).toBe("uploaded");

  return answer.documentId;
}

async function originsOf(documentId: string) {
  const rows = await t()
    .db.select({
      field: fieldOrigin.field,
      origin: fieldOrigin.origin,
      quote: fieldOrigin.quote,
      page: fieldOrigin.page,
    })
    .from(fieldOrigin)
    .where(eq(fieldOrigin.documentId, documentId));

  return rows.toSorted((a, b) => a.field.localeCompare(b.field));
}

type Quoted = readonly [value: string, quote: string];

/** What the page and the demo pack's expected entities state for each live upload (S7-08 plan, "Recordings"). */
const READINGS: readonly (readonly [
  string,
  DocumentKind,
  Partial<Record<ReadingField, Quoted>>,
  readonly Quoted[],
])[] = [
  [
    "01",
    "invoice",
    {
      customer: ["ABC Trading", "Bill to: ABC Trading"],
      number: ["INV-LIVE-001", "Invoice number INV-LIVE-001"],
      date: ["2026-10-26", "Invoice date 2026-10-26"],
      currency: ["SGD", "Currency: SGD"],
      amount: ["5000.00", "TOTAL (SGD) 5,000.00"],
      description: [
        "Additional consulting project - October 2026",
        "Additional consulting project - October 2026",
      ],
    },
    [],
  ],
  [
    "02",
    "payment",
    {
      customer: ["Harbor Foods", "Harbor Foods"],
      date: ["2026-10-26", "Payment date 2026-10-26"],
      currency: ["SGD", "Currency SGD"],
      amount: ["3000.00", "TOTAL (SGD) 3,000.00"],
      reference: ["HF-SEP-FINAL-PART", "Payment reference HF-SEP-FINAL-PART"],
      method: ["Bank transfer", "Payment method Bank transfer"],
    },
    [["INV-2026-09-03", "Invoice reference INV-2026-09-03 | SGD 3,000.00"]],
  ],
  [
    "03",
    "payment",
    {
      customer: ["Orchid Retail", "Orchid Retail"],
      date: ["2026-10-27", "Payment date 2026-10-27"],
      currency: ["SGD", "Currency SGD"],
      amount: ["8250.00", "TOTAL (SGD) 8,250.00"],
      reference: ["OR-AUG-SEP-BUNDLE", "Payment reference OR-AUG-SEP-BUNDLE"],
      method: ["Bank transfer", "Payment method Bank transfer"],
    },
    [
      ["INV-2026-08-04", "Invoice reference INV-2026-08-04 | SGD 4,050.00"],
      ["INV-2026-09-04", "Invoice reference INV-2026-09-04 | SGD 4,200.00"],
    ],
  ],
  [
    "05",
    "payment",
    {
      customer: ["Meridian Labs", "Meridian Labs"],
      date: ["2026-10-27", "Payment date 2026-10-27"],
      currency: ["SGD", "Currency SGD"],
      amount: ["2222.00", "TOTAL (SGD) 2,222.00"],
      reference: ["ML-UNREFERENCED", "Payment reference ML-UNREFERENCED"],
      method: ["Bank transfer", "Payment method Bank transfer"],
    },
    [],
  ],
  [
    "06",
    "paid-receipt",
    {
      customer: ["Lumi Design", "Customer: Lumi Design"],
      number: ["RCPT-LIVE-001", "Receipt number RCPT-LIVE-001"],
      date: ["2026-10-27", "Purchase / payment date 2026-10-27"],
      currency: ["SGD", "Currency: SGD"],
      amount: ["1800.00", "TOTAL (SGD) 1,800.00"],
      reference: ["LD-PURCHASE-1800", "Payment reference LD-PURCHASE-1800"],
      method: ["Card", "Payment method Card"],
    },
    [],
  ],
  [
    "07",
    "purchase-order",
    {
      customer: ["MERIDIAN LABS", "MERIDIAN LABS"],
      number: ["PO-LIVE-001", "Purchase order number PO-LIVE-001"],
      date: ["2026-10-27", "Order date 2026-10-27"],
      currency: ["SGD", "Currency: SGD"],
      amount: ["2200.00", "TOTAL (SGD) 2,200.00"],
    },
    [],
  ],
];

const onPage1 = ([value, quote]: Quoted) => ({ value, quote, page: 1 });

/** A document whose stored file holds these bytes, in the given reading state. */
async function aDocument(
  bytes: Buffer,
  readingStatus: ReadingStatus,
  readingAttempts = 0
): Promise<string> {
  const { id: fileId } = await withTransaction(t(), (tx) =>
    t().fileStorage.store(
      {
        fileName: "document.pdf",
        mimeType: "application/pdf",
        bytes,
        uploadedByUserId: uploaderId,
      },
      tx
    )
  );

  return (
    await insertDocument(t(), {
      kind: null,
      fileId,
      readingStatus,
      readingAttempts,
    })
  ).id;
}

async function documentRow(id: string) {
  const [row] = await t()
    .db.select()
    .from(sourceDocument)
    .where(eq(sourceDocument.id, id));

  return row;
}

type JobRow = {
  readonly data: {
    readonly documentId: string;
    readonly [JOB_STARTER_KEY]?: string;
  };
  readonly retry_limit: number;
  readonly retry_backoff: boolean;
};

async function jobsOf(documentId: string): Promise<readonly JobRow[]> {
  const { rows } = await t().db.$client.query<JobRow>(
    "select data, retry_limit, retry_backoff from pgboss.job where name = 'invoices.read-document' and data->>'documentId' = $1",
    [documentId]
  );

  return rows;
}

describe("the reading job", () => {
  it("an upload enqueues one reading job as the uploader with two retries and backoff", async () => {
    const answer = await uploadDocument(as(uploaderId), file01(live01()));

    expect(answer.outcome).toBe("uploaded");
    const jobs = await jobsOf(answer.documentId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ retry_limit: 2, retry_backoff: true });
    expect(jobs[0]?.data[JOB_STARTER_KEY]).toBe(uploaderId);
  });

  it("a document that cannot be read fails twice, then shows Could not read", async () => {
    const id = await aDocument(BROKEN_PDF, "reading");

    await expect(run(id)).rejects.toThrow();
    expect(await documentRow(id)).toMatchObject({
      readingStatus: "reading",
      readingAttempts: 1,
    });
    await expect(run(id)).rejects.toThrow();
    expect(await documentRow(id)).toMatchObject({
      readingStatus: "reading",
      readingAttempts: 2,
    });
    await expect(run(id)).resolves.toBeUndefined();
    expect(await documentRow(id)).toMatchObject({
      readingStatus: "could-not-read",
      readingAttempts: 3,
    });
  });

  it("a run for a read document changes nothing", async () => {
    const id = await aDocument(NO_TEXT_PDF, "read");
    const before = await documentRow(id);

    await run(id);

    expect(await documentRow(id)).toEqual(before);
  });

  it("a run without a starter reads nothing and ends Could not read", async () => {
    const id = await aDocument(NO_TEXT_PDF, "reading");

    await readingJob.handler({ tenant: t() }, { documentId: id });

    expect(await documentRow(id)).toMatchObject({
      readingStatus: "could-not-read",
      readingAttempts: 0,
    });
  });

  it("a reading no run ended within the bound shows Could not read and takes Retry", async () => {
    const stalled = await aDocument(BROKEN_PDF, "reading", 1);
    const running = await aDocument(BROKEN_PDF, "reading", 1);
    await t()
      .db.update(sourceDocument)
      .set({ updatedAt: ago(READING_STALLS_AFTER_MINUTES + 1) })
      .where(eq(sourceDocument.id, stalled));
    await t()
      .db.update(sourceDocument)
      .set({ updatedAt: ago(READING_STALLS_AFTER_MINUTES - 1) })
      .where(eq(sourceDocument.id, running));

    const { rows } = await loadDocumentInbox(as(retrierId));
    const statusOf = (id: string) => rows.find((row) => row.id === id)?.status;
    expect(statusOf(stalled)).toBe("could-not-read");
    expect(statusOf(running)).toBe("reading");

    await expect(retryReading(as(retrierId), running)).rejects.toMatchObject({
      code: "invoices:document-not-retryable",
    });
    await expect(retryReading(as(retrierId), stalled)).resolves.toEqual({
      documentId: stalled,
    });
    expect(await documentRow(stalled)).toMatchObject({
      readingStatus: "reading",
      readingAttempts: 0,
    });
    expect(await jobsOf(stalled)).toHaveLength(1);
  });

  it("a reading no run claimed yet stays Reading for a day while its job waits in the queue", async () => {
    const queued = await aDocument(BROKEN_PDF, "reading");
    const lost = await aDocument(BROKEN_PDF, "reading");
    await t()
      .db.update(sourceDocument)
      .set({ updatedAt: ago(READING_STALLS_AFTER_MINUTES + 1) })
      .where(eq(sourceDocument.id, queued));
    await t()
      .db.update(sourceDocument)
      .set({ updatedAt: ago(24 * 60 + 1) })
      .where(eq(sourceDocument.id, lost));

    const { rows } = await loadDocumentInbox(as(retrierId));
    const statusOf = (id: string) => rows.find((row) => row.id === id)?.status;
    expect(statusOf(queued)).toBe("reading");
    expect(statusOf(lost)).toBe("could-not-read");

    await expect(retryReading(as(retrierId), queued)).rejects.toMatchObject({
      code: "invoices:document-not-retryable",
    });
    expect(await jobsOf(queued)).toHaveLength(0);
  });

  it("Retry reads a document that could not be read again, once", async () => {
    const id = await aDocument(BROKEN_PDF, "could-not-read", 3);

    await expect(retryReading(as(retrierId), id)).resolves.toEqual({
      documentId: id,
    });

    expect(await documentRow(id)).toMatchObject({
      readingStatus: "reading",
      readingAttempts: 0,
    });
    const jobs = await jobsOf(id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data[JOB_STARTER_KEY]).toBe(retrierId);
    await expect(retryReading(as(retrierId), id)).rejects.toMatchObject({
      code: "invoices:document-not-retryable",
    });
    expect(await jobsOf(id)).toHaveLength(1);
  });

  it("a failed enqueue leaves the uploaded document Could not read", async () => {
    // `withTransaction` accepts only a context that `createTenantContext` built, so a spread copy
    // cannot carry the queue: a context of its own gets a copy that `createJobQueue` did not
    // build, and `enqueueJob` throws on it.
    const tenant = createTenantContext(
      { DATABASE_URL: t().env.databaseUrl, PUBLIC_URL: t().env.publicUrl },
      silentLogger(),
      ["invoices"]
    );
    Object.assign(tenant, { jobQueue: { ...tenant.jobQueue } });
    const { caller } = as(uploaderId);

    const answer = await uploadDocument(
      { tenant, caller },
      file01(live01())
    ).finally(() => tenant.db.$client.end());

    expect(answer.outcome).toBe("uploaded");
    expect(await documentRow(answer.documentId)).toMatchObject({
      readingStatus: "could-not-read",
    });
  });

  it.each(READINGS)(
    "reads each live upload into its kind and its checked fields: %s",
    async (upload, kind, fields, invoiceNumbers) => {
      const id = await uploaded(
        readDemoFile(
          `03_Live_Upload_Documents/${LIVE_UPLOADS.find((name) => name.startsWith(upload))}`
        )
      );

      await run(id);

      const row = await documentRow(id);
      expect(row).toMatchObject({
        readingStatus: "read",
        // No customer exists here, so a payment matches nothing (payment-readings covers the rest).
        readingOutcome: kind === "payment" ? "no-match" : null,
        kind,
      });
      // toEqual, not toMatchObject: a field the page does not state must not appear.
      expect(row?.reading).toEqual({
        fields: Object.fromEntries(
          Object.entries(fields).map(([field, read]) => [field, onPage1(read)])
        ),
        invoiceNumbers: invoiceNumbers.map(onPage1),
        dropped: [],
      });
      const [firstNumber] = invoiceNumbers;
      expect(await originsOf(id)).toEqual(
        [
          ...Object.entries(fields).map(([field, [, quote]]) => ({
            field,
            origin: "extracted",
            quote,
            page: 1,
          })),
          ...(firstNumber
            ? [
                {
                  field: "invoiceNumbers",
                  origin: "extracted",
                  quote: firstNumber[1],
                  page: 1,
                },
              ]
            : []),
        ].toSorted((a, b) => a.field.localeCompare(b.field))
      );
    }
  );

  it("the reading of 01 fills no due date and no payment terms", async () => {
    const id = await uploaded(live01());

    await run(id);

    const reading = (await documentRow(id))?.reading;
    expect(reading?.fields).not.toHaveProperty("dueDate");
    expect(reading?.fields).not.toHaveProperty("paymentTerms");
    expect(reading?.dropped).toEqual([]);
  });

  it("a partial reading keeps its valid fields", async () => {
    // A crafted answer, not a recording: the owner's live refresh would replace it (decision 15).
    const recording = JSON.parse(
      readFileSync(
        join(INVOICES_READING_RECORDINGS, "read-01-invoice.json"),
        "utf8"
      )
    );
    const [choice] = recording.response.body.choices;
    const answer = JSON.parse(choice.message.content);
    answer.amount.quote = "TOTAL (SGD) 9,999.00";
    choice.message.content = JSON.stringify(answer);
    const tenant = createTenantContext(
      { DATABASE_URL: t().env.databaseUrl, PUBLIC_URL: t().env.publicUrl },
      silentLogger(),
      ["invoices"]
    );
    useModelTransport(tenant, {
      transport: async () =>
        new Response(JSON.stringify(recording.response.body), {
          headers: { "content-type": "application/json" },
        }),
    });
    const id = await uploaded(live01());

    await readingJob
      .handler({ tenant, caller: as(uploaderId).caller }, { documentId: id })
      .finally(() => tenant.db.$client.end());

    const row = await documentRow(id);
    expect(row?.readingStatus).toBe("read");
    expect(row?.reading?.dropped).toEqual(["amount"]);
    expect(Object.keys(row?.reading?.fields ?? {}).toSorted()).toEqual([
      "currency",
      "customer",
      "date",
      "description",
      "number",
    ]);
    expect((await originsOf(id)).map((origin) => origin.field)).not.toContain(
      "amount"
    );
  });

  it("a run after the reading is stored sends no second request", async () => {
    const id = await uploaded(live01());
    const stopped: StoredReading = {
      fields: {},
      invoiceNumbers: [],
      dropped: ["customer"],
    };
    // As a run that stopped after storing the reading leaves it: still reading.
    await t()
      .db.update(sourceDocument)
      .set({ kind: "invoice", reading: stopped })
      .where(eq(sourceDocument.id, id));
    const before = recorded.sent.length;

    await run(id);

    expect(recorded.sent).toHaveLength(before);
    expect(await documentRow(id)).toMatchObject({
      readingStatus: "read",
      kind: "invoice",
      reading: stopped,
    });
  });

  it("a PDF with no text layer needs input with its reason", async () => {
    const id = await aDocument(NO_TEXT_PDF, "reading");

    await run(id);

    expect(await documentRow(id)).toMatchObject({
      readingStatus: "read",
      readingOutcome: "no-text-layer",
      kind: null,
      reading: null,
    });
  });
});
