import {
  agentAccess,
  callProcedure,
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

import type { DocumentInboxRow } from "../src/contract.ts";
import { invoicesModule } from "../src/module.ts";
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
  found,
});

async function inboxOf(userId: string) {
  const access = await agentAccess(as(userId));

  return access.permitted ? access.inbox : "not permitted";
}

describe("the documents inbox", () => {
  it("lists every document newest first with its label, kind, status and what was found", async () => {
    const { id: customerId } = await insertCustomer(t());

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
    const { id: linkedInvoice } = await insertInvoice(t(), { customerId });
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
    const { id: savedInvoice } = await insertInvoice(t(), { customerId });
    const { id: savedPayment } = await insertPayment(t(), {
      customerId,
      documentId: saved.id,
    });
    await insertAllocation(t(), {
      invoiceId: savedInvoice,
      paymentId: savedPayment,
      amountCents: 1000,
    });

    const finance = await personWithSeededRole("Finance");

    await expect(
      callProcedure(invoicesRouter, as(finance)).listDocuments({ after: null })
    ).resolves.toEqual({
      rows: [
        row(saved.id, "saved.pdf", "payment", "saved"),
        row(linked.id, "linked.pdf", "payment", "linked-automatically"),
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
        row(old.id, "INV-OLD-1", "invoice", "saved"),
      ],
      truncated: false,
      next: null,
      ai: "no-key",
      canUpload: true,
      timeZone: expect.any(String),
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
    const finance = await personWithSeededRole("Finance");

    const { rows } = await callProcedure(
      invoicesRouter,
      as(finance)
    ).listDocuments({ after: null });

    expect(rows.find((shown) => shown.id === document.id)?.uploadedAt).toBe(
      "2026-10-27T01:06:00.000Z"
    );
  });

  it("reads the inbox one page at a time from a cursor", async () => {
    // 1,001 documents, so the first page is cut exactly as the invoice list is (czjw.28).
    await t().db.$client.query(
      "insert into document (kind, sha256, file_id, file_name, reading_status) select 'payment', md5(g::text) || md5('b' || g::text), gen_random_uuid(), 'paged-' || g || '.pdf', 'read' from generate_series(1, 1001) as g"
    );

    const finance = await personWithSeededRole("Finance");
    const reader = callProcedure(invoicesRouter, as(finance));

    const [counted] = (
      await t().db.$client.query<{ total: string }>(
        "select count(*)::text as total from document"
      )
    ).rows;
    const total = Number(counted?.total ?? 0);
    expect(total).toBeGreaterThan(1000);

    const first = await reader.listDocuments({ after: null });
    expect(first.rows).toHaveLength(1000);
    expect(first.next).not.toBeNull();

    // Every row shares one created time, so the id breaks the tie; page two must hold exactly the
    // rows the same order puts after row 1,000, or the edge repeats one row and skips another.
    const expected = (
      await t().db.$client.query<{ id: string }>(
        "select id from document order by created_at desc, id desc offset 1000"
      )
    ).rows.map((edge) => edge.id);

    const second = await reader.listDocuments({ after: first.next });
    expect(second.rows.map((pageRow) => pageRow.id)).toEqual(expected);
    expect(second.next).toBeNull();
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
    const finance = await personWithSeededRole("Finance");

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

  it("refuses a reader scoped to one customer, and offers no upload to a Viewer", async () => {
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

    const viewer = await personWithSeededRole("Viewer");

    await expect(
      callProcedure(invoicesRouter, as(viewer)).listDocuments({ after: null })
    ).resolves.toMatchObject({ canUpload: false });
  });

  it("Ask links to Documents for a holder of invoices:write only", async () => {
    const finance = await personWithSeededRole("Finance", ["core:ask:use"]);
    const viewer = await personWithSeededRole("Viewer", ["core:ask:use"]);

    expect(await inboxOf(finance)).toEqual([
      { label: "Documents", href: "/m/invoices/documents" },
    ]);
    expect(await inboxOf(viewer)).toEqual([]);
  });
});
