import { principalFor, type ModuleRequestContext } from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import { sourceDocument } from "../src/schema.ts";
import { uploadDocument } from "../src/services/documents/upload.ts";
import { readingJob } from "../src/services/reading/job.ts";
import { LIVE_UPLOADS, readDemoFile } from "./demo-pack.ts";
import { insertCustomer, insertInvoice } from "./factories.ts";
import { INVOICES_READING_RECORDINGS } from "./index.ts";
import { withNewId } from "./pdf-fixtures.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * A payment reading saves through `recordPaymentFromReading` as its uploader, once (R-12, R-30).
 * The cases run in order on one deployment: B6.3 runs before any payment of Harbor Foods exists.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let uploaderId: string;

let readerId: string;

let invoice0903: string;

let harborFoods: string;

const t = () => deployment.context;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  // markSetupDone inserts the settings row that writeModelConnection updates.
  await markSetupDone(t());
  await writeModelConnection(t(), {
    allowed: ["deepseek/deepseek-v4.1-flash-1017"],
    chat: "deepseek/deepseek-v4.1-flash-1017",
    document: "deepseek/deepseek-v4.1-flash-1017",
  });
  useRecordedModel(t(), INVOICES_READING_RECORDINGS);
  await enableModules(t(), ["invoices"]);
  // The Finance person: tenant-wide use, read and write.
  ({ userId: uploaderId } = await insertPersonWith(t(), [
    "invoices:use",
    "invoices:read",
    "invoices:write",
  ]));
  ({ userId: readerId } = await insertPersonWith(t(), [
    "invoices:use",
    "invoices:read",
  ]));

  harborFoods = (await insertCustomer(t(), { name: "Harbor Foods" })).id;
  invoice0903 = (
    await insertInvoice(t(), {
      customerId: harborFoods,
      number: "INV-2026-09-03",
      totalCents: 720_000,
    })
  ).id;
  const { id: orchidRetail } = await insertCustomer(t(), {
    name: "Orchid Retail",
  });
  await insertInvoice(t(), {
    customerId: orchidRetail,
    number: "INV-2026-08-04",
    totalCents: 405_000,
  });
  await insertInvoice(t(), {
    customerId: orchidRetail,
    number: "INV-2026-09-04",
    totalCents: 420_000,
  });
  const { id: meridianLabs } = await insertCustomer(t(), {
    name: "Meridian Labs",
  });
  await insertInvoice(t(), { customerId: meridianLabs, totalCents: 100_000 });
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

const live = (upload: string) =>
  readDemoFile(
    `03_Live_Upload_Documents/${LIVE_UPLOADS.find((name) => name.startsWith(upload))}`
  );

/** Uploads the bytes as the Finance person and answers the document id. */
async function uploaded(bytes: Buffer): Promise<string> {
  const answer = await uploadDocument(
    as(uploaderId),
    new File([new Uint8Array(bytes)], "document.pdf", {
      type: "application/pdf",
    })
  );

  expect(answer.outcome).toBe("uploaded");

  return answer.documentId;
}

async function readingOf(documentId: string) {
  const [row] = await t()
    .db.select({
      readingStatus: sourceDocument.readingStatus,
      readingOutcome: sourceDocument.readingOutcome,
    })
    .from(sourceDocument)
    .where(eq(sourceDocument.id, documentId));

  return row;
}

async function rows(text: string, values: unknown[]) {
  return (await t().db.$client.query(text, values)).rows;
}

const paymentsOf = (documentId: string) =>
  rows(
    "select id, customer_id, amount_cents from payment where document_id = $1",
    [documentId]
  );

describe("payment readings", () => {
  it("a reading whose uploader lost invoices:write saves nothing", async () => {
    const id = await uploaded(withNewId(live("02")));

    await readingJob.handler(as(readerId), { documentId: id });

    expect(await paymentsOf(id)).toEqual([]);
    expect(await readingOf(id)).toEqual({
      readingStatus: "read",
      readingOutcome: null,
    });
  });

  it("readings of 03 and 05 save nothing and keep their match", async () => {
    const split = await uploaded(live("03"));
    const unmatched = await uploaded(live("05"));

    await readingJob.handler(as(uploaderId), { documentId: split });
    await readingJob.handler(as(uploaderId), { documentId: unmatched });

    expect(await paymentsOf(split)).toEqual([]);
    expect(await paymentsOf(unmatched)).toEqual([]);
    expect(await readingOf(split)).toEqual({
      readingStatus: "read",
      readingOutcome: "confirm-split",
    });
    expect(await readingOf(unmatched)).toEqual({
      readingStatus: "read",
      readingOutcome: "no-match",
    });
  });

  describe("a reading of 02", () => {
    let id: string;

    beforeAll(async () => {
      id = await uploaded(live("02"));
      await readingJob.handler(as(uploaderId), { documentId: id });
    });

    it("links automatically as the uploader", async () => {
      const payments = await paymentsOf(id);
      expect(payments).toEqual([
        {
          id: expect.any(String),
          customer_id: harborFoods,
          amount_cents: 300_000,
        },
      ]);
      const paymentId = payments[0]?.id;
      expect(
        await rows(
          "select invoice_id, amount_cents, automatic from allocation where payment_id = $1",
          [paymentId]
        )
      ).toEqual([
        { invoice_id: invoice0903, amount_cents: 300_000, automatic: true },
      ]);
      expect(
        await rows(
          "select actor_user_id from allocation_event where payment_id = $1",
          [paymentId]
        )
      ).toEqual([{ actor_user_id: uploaderId }]);
      expect(
        await rows(
          "select actor_user_id from audit_event where action = 'invoices:payment-saved' and target_id::text = $1",
          [paymentId]
        )
      ).toEqual([{ actor_user_id: uploaderId }]);
      expect(await readingOf(id)).toEqual({
        readingStatus: "read",
        readingOutcome: null,
      });
    });

    it("a rerun after the payment was saved saves no second payment", async () => {
      // A worker that stopped after the save and before the status update.
      await t()
        .db.update(sourceDocument)
        .set({ readingStatus: "reading" })
        .where(eq(sourceDocument.id, id));

      await readingJob.handler(as(uploaderId), { documentId: id });

      expect(await paymentsOf(id)).toHaveLength(1);
      expect((await readingOf(id))?.readingStatus).toBe("read");
    });
  });
});
