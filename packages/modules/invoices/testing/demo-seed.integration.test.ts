import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  createTenantContext,
  registerModuleRuntime,
  type TenantContext,
  withTransaction,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import { invoice, payment, sourceDocument } from "../src/schema.ts";
import { DEMO_PACK, readDemoJson } from "./demo-pack.ts";
import { seedDemoHistory } from "./demo-seed.ts";
import { insertDocument } from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The seed stores each history PDF through `FileStorage`, keyed by its SHA-256, and saves its
 * record on that document (R-59, DEC-20). A run stopped between the two writes is completed by
 * the next one (Review Focus 5).
 */
type PackRecord = { readonly source_pdf: string };

// SAFETY: the pack's history file is read verbatim and this test reads only the fields it names.
const PACK = readDemoJson("01_History_Datasets/history_seed.json") as {
  readonly invoices: readonly (PackRecord & { readonly invoice_id: string })[];
  readonly payments: readonly (PackRecord & {
    readonly payment_reference: string;
  })[];
};

function pdfOf(record: PackRecord): Buffer {
  return readFileSync(new URL(record.source_pdf, DEMO_PACK));
}

function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const stops: (() => Promise<void>)[] = [];

/** An empty deployment with the module switched on and a person who may read and write invoices. */
async function startDeployment(): Promise<{
  readonly tenant: TenantContext;
  readonly userId: string;
}> {
  const deployment = await startDisposableDeployment([invoicesModule]);
  stops.push(deployment.stop);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["invoices"]);
  // Built after the switch-on, so its entitlement reader sees it (DEC-46).
  const tenant = createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    { error: () => {}, info: () => {}, debug: () => {} },
    ["invoices"]
  );
  stops.unshift(() => tenant.db.$client.end());
  registerModuleRuntime(tenant, [invoicesModule]);
  const { userId } = await insertPersonWith(tenant, [
    "invoices:read",
    "invoices:write",
  ]);

  return { tenant, userId };
}

afterAll(async () => {
  for (const stop of stops) {
    // oxlint-disable-next-line no-await-in-loop -- each pool closes before its container stops.
    await stop();
  }
});

describe("demo seed", () => {
  it("links each history invoice and payment to a stored document of its kind holding its own PDF", async () => {
    const { tenant, userId } = await startDeployment();

    await seedDemoHistory(tenant, { userId });

    const invoices = await tenant.db
      .select({
        record: invoice.number,
        kind: sourceDocument.kind,
        sha256: sourceDocument.sha256,
        fileId: sourceDocument.fileId,
      })
      .from(invoice)
      .innerJoin(sourceDocument, eq(sourceDocument.id, invoice.documentId));
    const payments = await tenant.db
      .select({
        record: payment.reference,
        kind: sourceDocument.kind,
        sha256: sourceDocument.sha256,
        fileId: sourceDocument.fileId,
      })
      .from(payment)
      .innerJoin(sourceDocument, eq(sourceDocument.id, payment.documentId));

    const expected = [
      ...PACK.invoices.map((record) => ({
        record: record.invoice_id,
        kind: "invoice",
        sha256: sha256Of(pdfOf(record)),
      })),
      ...PACK.payments.map((record) => ({
        record: record.payment_reference,
        kind: "payment",
        sha256: sha256Of(pdfOf(record)),
      })),
    ];
    const saved = [...invoices, ...payments];

    expect(expected).toHaveLength(66);
    expect(
      saved.map(({ record, kind, sha256 }) => ({ record, kind, sha256 }))
    ).toEqual(expect.arrayContaining(expected));
    expect(saved).toHaveLength(66);

    const sources = new Map(
      [...PACK.invoices, ...PACK.payments].map((record) => [
        sha256Of(pdfOf(record)),
        pdfOf(record),
      ])
    );

    for (const row of saved) {
      // oxlint-disable-next-line no-await-in-loop -- one fetch per stored file, read in turn.
      const fetched = await tenant.fileStorage.fetch(row.fileId);

      expect(
        fetched.bytes.equals(sources.get(row.sha256) ?? Buffer.alloc(0)),
        row.record ?? ""
      ).toBe(true);
    }
  }, 120000);

  it("completes a history PDF stored with its document but no invoice, without a second document", async () => {
    const { tenant, userId } = await startDeployment();
    const [first] = PACK.invoices;

    if (first === undefined) throw new Error("the pack holds no invoice");

    const bytes = pdfOf(first);
    const sha256 = sha256Of(bytes);
    const stored = await withTransaction(tenant, (tx) =>
      tenant.fileStorage.store(
        {
          fileName: `${first.invoice_id}.pdf`,
          mimeType: "application/pdf",
          bytes,
          uploadedByUserId: userId,
        },
        tx
      )
    );
    const document = await insertDocument(tenant, {
      kind: "invoice",
      sha256,
      fileId: stored.id,
    });

    await seedDemoHistory(tenant, { userId });

    const documents = await tenant.db
      .select({ id: sourceDocument.id })
      .from(sourceDocument)
      .where(eq(sourceDocument.sha256, sha256));
    const [saved] = await tenant.db
      .select({ documentId: invoice.documentId })
      .from(invoice)
      .where(eq(invoice.number, first.invoice_id));

    expect(documents).toEqual([{ id: document.id }]);
    expect(saved).toEqual({ documentId: document.id });
  }, 120000);
});
