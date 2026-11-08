import {
  agentAccess,
  callProcedure,
  type DatasetCursor,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
  seedRoles,
} from "@genie/core";
import {
  assignRole,
  enableModules,
  insertPersonWith,
  insertRole,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DocumentInboxRow, InboxStatus } from "../src/contract.ts";
import { invoicesModule } from "../src/module.ts";
import { documentListDefinition } from "../src/presentation/list-definitions.ts";
import { invoicesRouter } from "../src/router.ts";
import { sourceDocument } from "../src/schema.ts";
import { loadDocumentInbox } from "../src/services/documents/inbox.ts";
import type { StoredReading } from "../src/services/reading/stored-reading.ts";
import {
  insertAllocation,
  insertCustomer,
  insertDocument,
  insertInvoice,
  insertPayment,
} from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The documents inbox on a real Postgres, through the seeded roles (R-37, R-42, decisions 11 to
 * 13). A document has no customer before a save, so only a tenant-wide reader lists them.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const t = () => deployment.context;

/** A person with a seeded role and, when given, a second role of extra permissions. */
async function personWithSeededRole(
  name: string,
  extra: readonly string[] = []
): Promise<string> {
  const { rows } = await t().db.$client.query<{ id: string }>(
    "select id from role where name = $1",
    [name]
  );
  const roleId = rows[0]?.id;

  if (roleId === undefined) throw new Error(`no seeded role ${name}`);

  const userId = await insertUser(t());
  const principal = { type: "user", id: userId } as const;

  await assignRole(t(), { roleId, principal });

  if (extra.length > 0) {
    await assignRole(t(), {
      roleId: await insertRole(t(), { permissions: extra }),
      principal,
    });
  }

  return userId;
}

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  // The settings row that modelStatus reads.
  await markSetupDone(t());
  // Before any branding read, so the 10 s reader never holds another zone (DEC-46).
  await t().db.$client.query(
    "update tenant_branding set default_time_zone = 'Asia/Singapore'"
  );
  await enableModules(t(), ["invoices"]);
  await seedRoles(t(), [invoicesModule]);
  registerModuleRuntime(t(), [invoicesModule]);
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

const onPage1 = (value: string) => ({ value, quote: value, page: 1 });

const ORCHID_READING: StoredReading = {
  fields: {
    customer: onPage1("Orchid Retail"),
    currency: onPage1("SGD"),
    amount: onPage1("8250.00"),
  },
  invoiceNumbers: [onPage1("INV-2026-08-04"), onPage1("INV-2026-09-04")],
  dropped: [],
};

const row = (
  id: string,
  label: string,
  kind: DocumentInboxRow["kind"],
  status: DocumentInboxRow["status"],
  reason: DocumentInboxRow["reason"] = null,
  found: DocumentInboxRow["found"] = null
): DocumentInboxRow => ({
  id,
  label,
  kind,
  status,
  reason,
  // The upload time case below proves the value.
  uploadedAt: expect.any(String),
  updatedAt: expect.any(String),
  found,
});

/** Each tab with these counts, as many rows as its count, and no row outside its statuses. */
const tabsHolding = (counts: Record<string, number>) =>
  documentListDefinition.tabs.items.map(({ value }) => ({
    value,
    counts,
    rows: counts[value],
    outside: [],
  }));

/** Every inbox row the params keep, page after page, so the reads run one after another. */
async function walkInbox(
  userId: string,
  params: Record<string, string>,
  after: DatasetCursor | null = null
): Promise<DocumentInboxRow[]> {
  const page = await callProcedure(invoicesRouter, as(userId)).listDocuments({
    after,
    params,
  });

  return page.next === null
    ? page.rows
    : [...page.rows, ...(await walkInbox(userId, params, page.next))];
}

async function inboxOf(userId: string) {
  const access = await agentAccess(as(userId));

  return access.permitted ? access.inbox : "not permitted";
}

describe("the documents inbox", () => {
  it("lists every document newest first with its label, kind, status and what was found", async () => {
    const { id: customerId, name: customerName } = await insertCustomer(t());

    // Stored before uploads kept a name: labelled by its saved invoice.
    const old = await insertDocument(t(), { kind: "invoice" });
    await insertInvoice(t(), {
      customerId,
      number: "INV-OLD-1",
      documentId: old.id,
    });

    const reading = await insertDocument(t(), {
      kind: null,
      fileName: "reading.pdf",
      readingStatus: "reading",
    });
    const failed = await insertDocument(t(), {
      kind: null,
      fileName: "failed.pdf",
      readingStatus: "could-not-read",
      readingAttempts: 3,
    });
    const aiOff = await insertDocument(t(), {
      kind: null,
      fileName: "ai-off.pdf",
      readingOutcome: "ai-off",
    });
    const split = await insertDocument(t(), {
      fileName: "split.pdf",
      readingOutcome: "confirm-split",
      reading: ORCHID_READING,
    });
    const unmatched = await insertDocument(t(), {
      fileName: "unmatched.pdf",
      readingOutcome: "no-match",
    });
    const duplicate = await insertDocument(t(), {
      fileName: "duplicate.pdf",
      readingOutcome: "possible-duplicate",
    });
    const order = await insertDocument(t(), {
      kind: "purchase-order",
      fileName: "order.pdf",
    });

    const linked = await insertDocument(t(), { fileName: "linked.pdf" });
    const { id: linkedInvoice, number: linkedNumber } = await insertInvoice(
      t(),
      { customerId }
    );
    const { id: linkedPayment } = await insertPayment(t(), {
      customerId,
      documentId: linked.id,
    });
    await insertAllocation(t(), {
      invoiceId: linkedInvoice,
      paymentId: linkedPayment,
      amountCents: 1000,
      automatic: true,
    });

    // Saved by the person with a link they chose, after a split the reading asked for.
    const saved = await insertDocument(t(), {
      fileName: "saved.pdf",
      readingOutcome: "confirm-split",
    });
    const { id: savedInvoice, number: savedNumber } = await insertInvoice(t(), {
      customerId,
    });
    const { id: savedPayment } = await insertPayment(t(), {
      customerId,
      documentId: saved.id,
    });
    await insertAllocation(t(), {
      invoiceId: savedInvoice,
      paymentId: savedPayment,
      amountCents: 1000,
    });

    const finance = await personWithSeededRole("Invoices and Payments editor");

    // A saved document shows its record (czjw.82): the customer, the amount and the invoices.
    const recordOf = (invoiceNumber: string) => ({
      customer: customerName,
      currency: "SGD",
      amountCents: 100_000,
      invoiceNumbers: [invoiceNumber],
    });

    await expect(
      callProcedure(invoicesRouter, as(finance)).listDocuments({
        after: null,
        params: { status: "all", sort: "uploaded.desc" },
      })
    ).resolves.toEqual({
      rows: [
        row(
          saved.id,
          "saved.pdf",
          "payment",
          "saved",
          null,
          recordOf(savedNumber)
        ),
        row(
          linked.id,
          "linked.pdf",
          "payment",
          "linked-automatically",
          null,
          recordOf(linkedNumber)
        ),
        row(order.id, "order.pdf", "purchase-order", "kept-as-reference"),
        row(duplicate.id, "duplicate.pdf", "payment", "possible-duplicate"),
        row(unmatched.id, "unmatched.pdf", "payment", "no-match"),
        row(split.id, "split.pdf", "payment", "confirm-split", null, {
          customer: "Orchid Retail",
          currency: "SGD",
          amountCents: 825_000,
          invoiceNumbers: ["INV-2026-08-04", "INV-2026-09-04"],
        }),
        row(aiOff.id, "ai-off.pdf", null, "needs-input", "ai-off"),
        row(failed.id, "failed.pdf", null, "could-not-read"),
        row(reading.id, "reading.pdf", null, "reading"),
        row(
          old.id,
          "INV-OLD-1",
          "invoice",
          "saved",
          null,
          recordOf("INV-OLD-1")
        ),
      ],
      truncated: false,
      next: null,
      counts: expect.any(Object),
      ai: "no-key",
      canUpload: true,
      timeZone: "Asia/Singapore",
    });
  });

  it("answers each document's upload time, not the time its reading ended", async () => {
    const document = await insertDocument(t(), { fileName: "uploaded.pdf" });
    await t()
      .db.update(sourceDocument)
      .set({
        createdAt: new Date("2026-10-27T01:06:00.000Z"),
        updatedAt: new Date("2026-10-27T01:09:30.000Z"),
      })
      .where(eq(sourceDocument.id, document.id));
    const finance = await personWithSeededRole("Invoices and Payments editor");

    const { rows } = await callProcedure(
      invoicesRouter,
      as(finance)
    ).listDocuments({ after: null, params: { q: "uploaded.pdf" } });

    expect(rows.find((shown) => shown.id === document.id)?.uploadedAt).toBe(
      "2026-10-27T01:06:00.000Z"
    );
  });

  it("reads the inbox 50 documents at a time from a cursor", async () => {
    // 1,001 documents, so the first page is cut exactly as the invoice list is (czjw.28).
    await t().db.$client.query(
      "insert into document (kind, sha256, file_id, file_name, reading_status) select 'payment', md5(g::text) || md5('b' || g::text), gen_random_uuid(), 'paged-' || g || '.pdf', 'read' from generate_series(1, 1001) as g"
    );

    const finance = await personWithSeededRole("Invoices and Payments editor");
    const reader = callProcedure(invoicesRouter, as(finance));

    const [counted] = (
      await t().db.$client.query<{ total: string }>(
        "select count(*)::text as total from document"
      )
    ).rows;
    const total = Number(counted?.total ?? 0);
    expect(total).toBeGreaterThan(1000);

    const params = { status: "all", sort: "uploaded.desc" } as const;
    const first = await reader.listDocuments({ after: null, params });
    expect(first.rows).toHaveLength(50);
    expect(first.next).not.toBeNull();

    // Every row shares one created time, so the id breaks the tie; every page must hold exactly the
    // rows the same order puts there, or an edge repeats one row and skips another.
    const expected = (
      await t().db.$client.query<{ id: string }>(
        "select id from document order by created_at desc, id desc"
      )
    ).rows.map((edge) => edge.id);

    const walked = await walkInbox(finance, params);
    expect(walked.map((pageRow) => pageRow.id)).toEqual(expected);
  });

  it.each<{
    readonly name: string;
    readonly status: InboxStatus;
    readonly document: Parameters<typeof insertDocument>[1];
    readonly record?: "invoice" | "payment" | "automatic";
    readonly stalled?: true;
  }>([
    {
      name: "being read",
      status: "reading",
      document: { kind: null, readingStatus: "reading" },
    },
    {
      name: "stalled",
      status: "could-not-read",
      document: { kind: null, readingStatus: "reading", readingAttempts: 1 },
      stalled: true,
    },
    {
      name: "not read",
      status: "could-not-read",
      document: { kind: null, readingStatus: "could-not-read" },
    },
    {
      name: "an order",
      status: "kept-as-reference",
      document: { kind: "purchase-order" },
    },
    {
      name: "linked by the reading",
      status: "linked-automatically",
      document: { kind: "payment" },
      record: "automatic",
    },
    {
      name: "saved after a split",
      status: "saved",
      document: { kind: "payment", readingOutcome: "confirm-split" },
      record: "payment",
    },
    {
      name: "a saved invoice",
      status: "saved",
      document: { kind: "invoice" },
      record: "invoice",
    },
    {
      name: "a split",
      status: "confirm-split",
      document: { readingOutcome: "confirm-split" },
    },
    {
      name: "no match",
      status: "no-match",
      document: { readingOutcome: "no-match" },
    },
    {
      name: "a possible duplicate",
      status: "possible-duplicate",
      document: { readingOutcome: "possible-duplicate" },
    },
    {
      name: "read with AI off",
      status: "needs-input",
      document: { kind: null, readingOutcome: "ai-off" },
    },
    {
      name: "a read invoice",
      status: "needs-input",
      document: { kind: "invoice" },
    },
  ])(
    "answers a document $name as $status in the list and in the poll",
    async ({ name, status, document, record, stalled }) => {
      const fileName = `state ${name}.pdf`;
      const { id } = await insertDocument(t(), { ...document, fileName });
      const { id: customerId } = await insertCustomer(t());

      if (record === "invoice") {
        await insertInvoice(t(), { customerId, documentId: id });
      } else if (record !== undefined) {
        const { id: invoiceId } = await insertInvoice(t(), { customerId });
        const { id: paymentId } = await insertPayment(t(), {
          customerId,
          documentId: id,
        });
        await insertAllocation(t(), {
          invoiceId,
          paymentId,
          amountCents: 1000,
          automatic: record === "automatic",
        });
      }

      if (stalled === true) {
        await t().db.$client.query(
          "update document set updated_at = now() - interval '2 days' where id = $1",
          [id]
        );
      }

      const finance = await personWithSeededRole(
        "Invoices and Payments editor"
      );
      const reader = callProcedure(invoicesRouter, as(finance));
      const listed = await reader.listDocuments({
        after: null,
        params: { status: "all", q: fileName },
      });
      const polled = await reader.documentStatus({ ids: [id] });

      expect({
        listed: listed.rows.map((shown) => shown.status),
        polled: polled.map((shown) => shown.status),
      }).toEqual({ listed: [status], polled: [status] });
    }
  );

  it("each tab lists only its statuses, and the counts under a search and a type do not follow the tab", async () => {
    const { id: customerId } = await insertCustomer(t());
    const [, , , saved] = await Promise.all([
      insertDocument(t(), { kind: "payment", fileName: "tabdoc-a.pdf" }),
      insertDocument(t(), {
        kind: null,
        readingStatus: "could-not-read",
        fileName: "tabdoc-b.pdf",
      }),
      insertDocument(t(), {
        kind: null,
        readingStatus: "reading",
        fileName: "tabdoc-c.pdf",
      }),
      insertDocument(t(), { kind: "invoice", fileName: "tabdoc-d.pdf" }),
      insertDocument(t(), { kind: "purchase-order", fileName: "tabdoc-e.pdf" }),
    ]);
    await insertInvoice(t(), { customerId, documentId: saved.id });
    const finance = await personWithSeededRole("Invoices and Payments editor");
    const reader = callProcedure(invoicesRouter, as(finance));

    const tabsUnder = (params: Record<string, string>) =>
      Promise.all(
        documentListDefinition.tabs.items.map(async ({ value, statuses }) => {
          const page = await reader.listDocuments({
            after: null,
            params: { ...params, status: value },
          });
          const kept: readonly string[] = statuses;

          return {
            value,
            counts: page.counts,
            rows: page.rows.length,
            outside: page.rows.filter(
              (shown) => kept.length > 0 && !kept.includes(shown.status)
            ),
          };
        })
      );

    expect(await tabsUnder({ q: "tabdoc-" })).toEqual(
      tabsHolding({ "needs-you": 2, "reading": 1, "done": 2, "all": 5 })
    );
    expect(await tabsUnder({ q: "tabdoc-", type: "payment" })).toEqual(
      tabsHolding({ "needs-you": 1, "reading": 0, "done": 0, "all": 1 })
    );
  });

  it("searches the file name, the saved number, the customer and the read customer, with % literal", async () => {
    const { id: customerId } = await insertCustomer(t(), {
      name: "Searchline Zeta Holdings",
    });
    const byFile = await insertDocument(t(), { fileName: "srch-alpha.pdf" });
    const byNumber = await insertDocument(t(), { kind: "invoice" });
    await insertInvoice(t(), {
      customerId,
      number: "SRCH-INV-77",
      documentId: byNumber.id,
    });
    const byCustomer = await insertDocument(t(), { fileName: "c.pdf" });
    await insertPayment(t(), { customerId, documentId: byCustomer.id });
    const byReading = await insertDocument(t(), {
      fileName: "d.pdf",
      reading: {
        fields: { customer: onPage1("Readline Omega Trading") },
        invoiceNumbers: [],
        dropped: [],
      },
    });
    const percent = await insertDocument(t(), { fileName: "srch 50% off.pdf" });
    await insertDocument(t(), { fileName: "srch 50x off.pdf" });
    const finance = await personWithSeededRole("Invoices and Payments editor");

    const found = async (q: string) =>
      (await walkInbox(finance, { status: "all", q }))
        .map(({ id }) => id)
        .toSorted();

    expect({
      file: await found("SRCH-ALPHA"),
      number: await found("srch-inv-77"),
      customer: await found("searchline zeta"),
      reading: await found("readline omega"),
      percent: await found("50%"),
    }).toEqual({
      file: [byFile.id],
      number: [byNumber.id],
      customer: [byCustomer.id, byNumber.id].toSorted(),
      reading: [byReading.id],
      percent: [percent.id],
    });
  });

  it("filters the upload day in the tenant zone", async () => {
    const late = await insertDocument(t(), { fileName: "zone-late.pdf" });
    await t().db.$client.query(
      "update document set created_at = timestamptz '2026-11-02T17:30:00Z' where id = $1",
      [late.id]
    );
    const finance = await personWithSeededRole("Invoices and Payments editor");

    const kept = async (uploaded: string) =>
      (
        await walkInbox(finance, { status: "all", q: "zone-late", uploaded })
      ).map(({ id }) => id);

    // 17:30 UTC on 2 Nov is 01:30 on 3 Nov in Singapore.
    expect({
      third: await kept("2026-11-03..2026-11-03"),
      second: await kept("2026-11-02..2026-11-02"),
    }).toEqual({ third: [late.id], second: [] });
  });

  it.each([
    { sort: "uploaded", column: "created_at" },
    { sort: "updated", column: "updated_at" },
  ] as const)(
    "walks 55 documents under $sort in both directions, each once, ties by id in the sort direction",
    async ({ sort, column }) => {
      const tag = `walk-${sort}`;
      // 16 rows share the earliest created time and 16 the latest updated time, so a page edge
      // falls inside a tie in one direction of each sort.
      await t().db.$client.query(
        `insert into document (kind, sha256, file_id, file_name, reading_status, created_at, updated_at)
         select 'payment', md5($1 || g) || md5('w' || $1 || g), gen_random_uuid(), $1 || '-' || g || '.pdf', 'read',
           case when g >= 40 then timestamptz '2026-09-01 08:00:00.123456+00' else timestamptz '2026-09-02 08:00:00+00' + g * interval '1 second' end,
           case when g >= 40 then timestamptz '2026-10-30 08:00:00.123456+00' else timestamptz '2026-10-01 08:00:00+00' + g * interval '1 second' end
         from generate_series(1, 55) as g`,
        [tag]
      );
      const finance = await personWithSeededRole(
        "Invoices and Payments editor"
      );

      const walks = await Promise.all(
        (["asc", "desc"] as const).map(async (direction) => {
          const walked = await walkInbox(finance, {
            status: "all",
            q: tag,
            sort: `${sort}.${direction}`,
          });
          const { rows } = await t().db.$client.query<{ id: string }>(
            `select id from document where file_name like $1 || '-%' order by ${column} ${direction}, id ${direction}`,
            [tag]
          );

          return {
            walked: walked.map(({ id }) => id),
            expected: rows.map(({ id }) => id),
          };
        })
      );

      for (const walk of walks) {
        expect(walk.walked).toHaveLength(55);
        expect(walk.walked).toEqual(walk.expected);
      }
    }
  );

  it("a person's save moves the document's Updated time", async () => {
    const { id: customerId } = await insertCustomer(t());
    const document = await insertDocument(t(), {
      kind: "invoice",
      fileName: "touched.pdf",
    });
    await t().db.$client.query(
      "update document set updated_at = timestamptz '2026-01-01T00:00:00Z' where id = $1",
      [document.id]
    );
    const finance = await personWithSeededRole("Invoices and Payments editor");
    const reader = callProcedure(invoicesRouter, as(finance));

    await reader.saveInvoice({
      documentId: document.id,
      customer: { id: customerId },
      number: "INV-TOUCHED-1",
      invoiceDate: "2026-10-26",
      dueDate: null,
      dueDateSource: "unspecified",
      paymentTerms: null,
      currency: "SGD",
      totalCents: 500_000,
      description: null,
      keepPossibleDuplicate: false,
    });

    const { rows } = await reader.listDocuments({
      after: null,
      params: { status: "all", q: "touched.pdf" },
    });

    expect(rows.map(({ updatedAt }) => updatedAt > "2026-01-02")).toEqual([
      true,
    ]);
  });

  // czjw.82: the seed stores each history document with no reading, and the inbox read only the reading.
  it("lists the saved record of a document with no reading under What we found", async () => {
    const { id: customerId } = await insertCustomer(t(), {
      name: "Kestrel History",
    });
    const invoiceDocument = await insertDocument(t(), {
      kind: "invoice",
      fileName: "history-invoice.pdf",
    });
    const paymentDocument = await insertDocument(t(), {
      kind: "payment",
      fileName: "history-payment.pdf",
    });
    const saved = await insertInvoice(t(), {
      customerId,
      number: "INV-HISTORY-1",
      currency: "SGD",
      totalCents: 420_000,
      documentId: invoiceDocument.id,
    });
    const paid = await insertPayment(t(), {
      customerId,
      currency: "SGD",
      amountCents: 150_000,
      reference: "TRF-HISTORY-1",
      documentId: paymentDocument.id,
    });
    await insertAllocation(t(), {
      invoiceId: saved.id,
      paymentId: paid.id,
      amountCents: 150_000,
    });
    const finance = await personWithSeededRole("Invoices and Payments editor");

    const rows = await walkInbox(finance, {
      status: "all",
      q: "history-",
    });

    expect(
      Object.fromEntries(rows.map(({ label, found }) => [label, found]))
    ).toEqual({
      "history-invoice.pdf": {
        customer: "Kestrel History",
        currency: "SGD",
        amountCents: 420_000,
        invoiceNumbers: ["INV-HISTORY-1"],
      },
      "history-payment.pdf": {
        customer: "Kestrel History",
        currency: "SGD",
        amountCents: 150_000,
        invoiceNumbers: ["INV-HISTORY-1"],
      },
    });
  });

  it("answers the status of the ids it is given, and no other document", async () => {
    const split = await insertDocument(t(), {
      fileName: "split.pdf",
      readingOutcome: "confirm-split",
    });
    await insertDocument(t(), {
      fileName: "other.pdf",
      readingStatus: "reading",
    });
    const finance = await personWithSeededRole("Invoices and Payments editor");

    await expect(
      callProcedure(invoicesRouter, as(finance)).documentStatus({
        ids: [split.id],
      })
    ).resolves.toEqual([
      { id: split.id, status: "confirm-split", reason: null },
    ]);
  });

  it("refuses a scoped reader's status poll", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id } = await insertDocument(t(), { fileName: "a.pdf" });
    const { userId: scoped } = await insertPersonWith(
      t(),
      ["invoices:use", "invoices:read"],
      { type: "invoices-customer", id: customerId }
    );

    await expect(
      callProcedure(invoicesRouter, as(scoped)).documentStatus({ ids: [id] })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses a reader scoped to one customer, and offers no upload to an Invoices and Payments viewer", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { userId: scoped } = await insertPersonWith(
      t(),
      ["invoices:use", "invoices:read"],
      { type: "invoices-customer", id: customerId }
    );

    await expect(
      callProcedure(invoicesRouter, as(scoped)).listDocuments({ after: null })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(loadDocumentInbox(as(scoped))).rejects.toMatchObject({
      code: "forbidden",
    });

    const viewer = await personWithSeededRole("Invoices and Payments viewer");

    await expect(
      callProcedure(invoicesRouter, as(viewer)).listDocuments({ after: null })
    ).resolves.toMatchObject({ canUpload: false });
  });

  it("Ask links to Documents for a holder of invoices:write only", async () => {
    const finance = await personWithSeededRole("Invoices and Payments editor", [
      "core:ask:use",
    ]);
    const viewer = await personWithSeededRole("Invoices and Payments viewer", [
      "core:ask:use",
    ]);

    expect(await inboxOf(finance)).toEqual([
      { label: "Documents", href: "/m/invoices/documents" },
    ]);
    expect(await inboxOf(viewer)).toEqual([]);
  });
});
