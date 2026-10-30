import {
  callProcedure,
  createTenantContext,
  type ModuleRPCContext,
  matchModulePage,
  modulePageAccess,
  type OpenedModulePage,
  openModulePage,
  principalFor,
  registerModuleRuntime,
  type TenantContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import type {
  InvoiceListView,
  InvoiceRecordView,
} from "../src/presentation/views.ts";
import { invoicesRouter } from "../src/router.ts";
import { loadInvoiceRecord } from "../src/services/pages/records.ts";
import { insertCustomer, insertInvoice, insertPayment } from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The module's pages through core's `openModulePage`, on a deployment at reporting date
 * 2026-10-27. Tasks 4 and 5 add the record and payments cases here.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** A context built after the reporting date was set, so its settings reader sees it (DEC-46). */
let tenant: TenantContext;

const t = () => deployment.context;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  await markSetupDone(t());
  await enableModules(t(), ["invoices"]);
  await t().db.$client.query(
    "update tenant_settings set reporting_date = '2026-10-27'"
  );
  tenant = createTenantContext(
    {
      DATABASE_URL: t().env.databaseUrl,
      PUBLIC_URL: t().env.publicUrl,
    },
    { error: () => {}, info: () => {}, debug: () => {} },
    ["invoices"]
  );
  registerModuleRuntime(tenant, [invoicesModule]);
}, 120000);

afterAll(async () => {
  await tenant?.db.$client.end();
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function contextFor(userId: string): ModuleRPCContext {
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

function matchOf(segments: readonly string[]) {
  const match = matchModulePage(invoicesModule, "workspace", segments);

  if (match === undefined) {
    throw new Error(`no page matches ${segments.join("/")}`);
  }

  return match;
}

/** The page core opens for these decoded segments, for this person. */
function openPage(
  userId: string,
  segments: readonly string[]
): Promise<OpenedModulePage> {
  return openModulePage(contextFor(userId), matchOf(segments));
}

/** What the invoice record page's loader answered for this person. */
async function openRecord(
  userId: string,
  invoiceId: string
): Promise<InvoiceRecordView> {
  const opened = await openPage(userId, [
    "m",
    "invoices",
    "invoices",
    invoiceId,
  ]);

  if (opened.kind !== "open") {
    throw new Error(`the record page answered ${opened.kind}`);
  }

  // SAFETY: core renders the record page with `data` set to the loader's InvoiceRecordView.
  return (opened.element.props as { readonly data: InvoiceRecordView }).data;
}

const READER = ["invoices:use", "invoices:read"] as const;

describe("invoice pages", () => {
  it("the list answers only the customer a scoped reader may read", async () => {
    const [a, b] = await Promise.all([
      insertCustomer(t()),
      insertCustomer(t()),
    ]);

    if (a === undefined || b === undefined) throw new Error("no customers");

    const visible = await insertInvoice(t(), {
      customerId: a.id,
      number: "INV-A",
    });

    await insertInvoice(t(), { customerId: b.id, number: "INV-B" });

    const { userId } = await insertPersonWith(
      t(),
      ["invoices:use", "invoices:read"],
      { type: "invoices-customer", id: a.id }
    );

    const opened = await openPage(userId, ["m", "invoices", "invoices"]);

    if (opened.kind !== "open") {
      throw new Error(`the list page answered ${opened.kind}`);
    }

    // SAFETY: core renders the list page with `data` set to the loader's InvoiceListView.
    const data = (opened.element.props as { readonly data: InvoiceListView })
      .data;

    expect(data.rows.map((row) => row.id)).toEqual([visible.id]);
  });

  it("the record answers link, change and unlink as three history rows in order, with no allocation left", async () => {
    const { id: customerId } = await insertCustomer(t());
    const [invoice, other] = await Promise.all([
      insertInvoice(t(), { customerId, totalCents: 720_000 }),
      insertInvoice(t(), { customerId, totalCents: 100_000 }),
    ]);
    const [payment, later] = await Promise.all([
      insertPayment(t(), { customerId, amountCents: 600_000 }),
      insertPayment(t(), {
        customerId,
        amountCents: 50_000,
        paymentDate: "2026-10-28",
      }),
    ]);
    const { userId } = await insertPersonWith(t(), [
      ...READER,
      "invoices:write",
    ]);
    const finance = callProcedure(invoicesRouter, contextFor(userId));

    const { allocationId } = await finance.linkPayment({
      invoiceId: invoice.id,
      paymentId: payment.id,
      amountCents: 300_000,
    });
    await finance.changeAllocation({ id: allocationId, amountCents: 500_000 });
    await finance.unlinkAllocation({ id: allocationId });
    // Another invoice's link, and a link of a payment dated after the reporting date (R-9).
    await finance.linkPayment({
      invoiceId: other.id,
      paymentId: payment.id,
      amountCents: 100_000,
    });
    await finance.linkPayment({
      invoiceId: invoice.id,
      paymentId: later.id,
      amountCents: 50_000,
    });

    const view = await openRecord(userId, invoice.id);

    if (view.kind !== "shown") throw new Error(`answered ${view.kind}`);

    expect(
      view.history.map((row) => [
        row.action,
        row.amountBeforeCents,
        row.amountAfterCents,
      ])
    ).toEqual([
      ["linked", 0, 300_000],
      ["changed", 300_000, 500_000],
      ["unlinked", 500_000, 0],
    ]);
    expect(view.allocations).toEqual([]);
    expect(view.invoice.outstandingCents).toBe(720_000);
  });

  it("an invoice dated after the reporting date answers the note with its number", async () => {
    const { id: customerId } = await insertCustomer(t());
    const invoice = await insertInvoice(t(), {
      customerId,
      number: "INV-LATER",
      invoiceDate: "2026-10-28",
    });
    const { userId } = await insertPersonWith(t(), [...READER]);

    expect(await openRecord(userId, invoice.id)).toEqual({
      kind: "after-reporting-date",
      asOf: "2026-10-27",
      label: "INV-LATER",
    });
  });

  it("a person with only invoices:use is refused the record page, its label and its loader", async () => {
    const { id: customerId } = await insertCustomer(t());
    const invoice = await insertInvoice(t(), { customerId });
    const { userId } = await insertPersonWith(t(), ["invoices:use"]);
    const segments = ["m", "invoices", "invoices", invoice.id];

    expect((await openPage(userId, segments)).kind).toBe("refused");
    // The document title reads this check, so a refused person gets no invoice number (R-1a).
    expect(
      await modulePageAccess(contextFor(userId), matchOf(segments))
    ).toEqual({ kind: "refused" });
    await expect(
      loadInvoiceRecord(contextFor(userId), invoice.id)
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
