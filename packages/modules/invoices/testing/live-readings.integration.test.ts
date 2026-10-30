import {
  callProcedure,
  type ModuleRequestContext,
  principalFor,
  queryDataset,
  registerModuleRuntime,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  useRecordedModel,
  writeModelConnection,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UploadDocumentOutput } from "../src/contract.ts";
import { invoicesModule } from "../src/module.ts";
import { invoicesRouter } from "../src/router.ts";
import { uploadDocument } from "../src/services/documents/upload.ts";
import { readingJob } from "../src/services/reading/job.ts";
import {
  LIVE_UPLOADS,
  readDemoFile,
  readDemoJson,
  toCents,
} from "./demo-pack.ts";
import { seedDemoHistory } from "./demo-seed.ts";
import { INVOICES_READING_RECORDINGS } from "./index.ts";
import { runningTotals } from "./live-totals.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * AC-7 up to the inbox: the seven live uploads of the demo pack, uploaded in numbered order on
 * the seeded history and read by the job with the recorded model, reach the statuses of the
 * design. Only the automatic link of 02 saves records; every other save is a person's (S7-09).
 */
type LiveScenarios = {
  readonly scenarios: readonly {
    readonly file: string;
    readonly changes: {
      readonly invoiced_sales: number;
      readonly payments_collected: number;
      readonly outstanding: number;
      readonly overdue: number;
    };
  }[];
};

// SAFETY: the demo pack's expected file is read verbatim and this test owns its shape.
const SCENARIOS = readDemoJson(
  "04_Demo_Guide/live_scenarios.json"
) as LiveScenarios;

const DOCUMENT_MODEL = "deepseek/deepseek-v4.1-flash-1017";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let ctx: ModuleRequestContext;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  const tenant = deployment.context;

  // markSetupDone inserts the settings row; AI and the reporting date go in before the first
  // settings read, which caches for 10 s (DEC-46).
  await markSetupDone(tenant);
  await writeModelConnection(tenant, {
    allowed: [DOCUMENT_MODEL],
    chat: DOCUMENT_MODEL,
    document: DOCUMENT_MODEL,
    reportingDate: "2026-10-27",
  });
  useRecordedModel(tenant, INVOICES_READING_RECORDINGS);
  await enableModules(tenant, ["invoices"]);
  registerModuleRuntime(tenant, [invoicesModule]);

  const { userId } = await insertPersonWith(tenant, [
    "invoices:use",
    "invoices:read",
    "invoices:write",
  ]);

  ctx = {
    tenant,
    caller: principalFor({
      tenant,
      modules: [invoicesModule],
      userId,
      authenticated: true,
    }),
  };
  await seedDemoHistory(tenant, { userId });
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

async function rows(text: string, values: unknown[]) {
  return (await deployment.context.db.$client.query(text, values)).rows;
}

async function outstandingOf(invoiceNumber: string): Promise<number> {
  const [row] = (
    await queryDataset(ctx, {
      dataset: "invoices.invoices",
      query: {
        select: ["outstandingCents"],
        filters: [{ field: "invoiceNumber", op: "eq", value: invoiceNumber }],
      },
    })
  ).rows;

  return Number(row?.outstandingCents);
}

const found = (
  customer: string,
  amountCents: number,
  invoiceNumbers: readonly string[] = []
) => ({ customer, currency: "SGD", amountCents, invoiceNumbers });

describe("live readings", () => {
  it("the seven live uploads reach the inbox statuses of the design", async () => {
    const before = await runningTotals(ctx);
    const answers = new Map<string, UploadDocumentOutput>();

    for (const name of LIVE_UPLOADS) {
      const bytes = readDemoFile(`03_Live_Upload_Documents/${name}`);
      // oxlint-disable-next-line no-await-in-loop -- the pack uploads in numbered order, so 04 meets 02.
      const answer = await uploadDocument(
        ctx,
        new File([new Uint8Array(bytes)], name, { type: "application/pdf" })
      );

      answers.set(name.slice(0, 2), answer);

      if (answer.outcome === "uploaded") {
        // oxlint-disable-next-line no-await-in-loop -- each reading matches against the records before it.
        await readingJob.handler(ctx, { documentId: answer.documentId });
      }
    }

    const documentOf = (upload: string) => answers.get(upload)?.documentId;

    expect(answers.get("04")).toEqual({
      outcome: "duplicate",
      documentId: documentOf("02"),
      label: "02_Payment_Partial_Existing_Invoice.pdf",
    });

    const view = await callProcedure(invoicesRouter, ctx).listDocuments();
    const live = Object.fromEntries(
      view.rows
        .filter(({ label }) => LIVE_UPLOADS.includes(label))
        .map(({ label, kind, status, found: values }) => [
          label.slice(0, 2),
          { kind, status, found: values },
        ])
    );

    expect(live).toEqual({
      "01": {
        kind: "invoice",
        status: "needs-input",
        found: found("ABC Trading", 500_000),
      },
      "02": {
        kind: "payment",
        status: "linked-automatically",
        found: found("Harbor Foods", 300_000, ["INV-2026-09-03"]),
      },
      "03": {
        kind: "payment",
        status: "confirm-split",
        found: found("Orchid Retail", 825_000, [
          "INV-2026-08-04",
          "INV-2026-09-04",
        ]),
      },
      "05": {
        kind: "payment",
        status: "no-match",
        found: found("Meridian Labs", 222_200),
      },
      "06": {
        kind: "paid-receipt",
        status: "needs-input",
        found: found("Lumi Design", 180_000),
      },
      "07": {
        kind: "purchase-order",
        status: "kept-as-reference",
        found: found("MERIDIAN LABS", 220_000),
      },
    });

    const liveDocuments = ["01", "02", "03", "05", "06", "07"].map(documentOf);

    expect(
      await rows(
        "select c.name, p.amount_cents, p.document_id, i.number, a.automatic from payment p join customer c on c.id = p.customer_id left join allocation a on a.payment_id = p.id left join invoice i on i.id = a.invoice_id where p.document_id = any($1::uuid[])",
        [liveDocuments]
      )
    ).toEqual([
      {
        name: "Harbor Foods",
        amount_cents: 300_000,
        document_id: documentOf("02"),
        number: "INV-2026-09-03",
        automatic: true,
      },
    ]);
    expect(
      await rows("select id from invoice where document_id = any($1::uuid[])", [
        liveDocuments,
      ])
    ).toEqual([]);
    // live_scenarios.json, 02: "Invoice total SGD 7,200; remaining SGD 2,200."
    expect(await outstandingOf("INV-2026-09-03")).toBe(220_000);

    const changes = SCENARIOS.scenarios.find(
      ({ file }) => file === "02_Payment_Partial_Existing_Invoice.pdf"
    )?.changes;

    if (changes === undefined) throw new Error("live_scenarios.json has no 02");

    expect(await runningTotals(ctx)).toEqual({
      invoicedCents: before.invoicedCents + toCents(changes.invoiced_sales),
      collectedCents:
        before.collectedCents + toCents(changes.payments_collected),
      outstandingCents: before.outstandingCents + toCents(changes.outstanding),
      overdueCents: before.overdueCents + toCents(changes.overdue),
    });
  });
});
