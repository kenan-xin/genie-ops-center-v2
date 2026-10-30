import {
  createTenantContext,
  type DatasetQuery,
  principalFor,
  queryDataset,
  recordRoute,
  registerModuleRuntime,
  type ModuleRequestContext,
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
import {
  insertAllocation,
  insertCustomer,
  insertInvoice,
  insertPayment,
} from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The four datasets at reporting date 2026-10-27 (R-9, R-35, R-36), read only through
 * `queryDataset` and `recordRoute`. Each case writes its own customer and filters on it, so the
 * cases share one deployment without reading each other.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** A context built after the reporting date was set, so its settings reader sees it (DEC-46). */
let tenant: TenantContext;

let reader: string;

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
  reader = (await insertPersonWith(t(), ["invoices:read"])).userId;
}, 120000);

afterAll(async () => {
  await tenant?.db.$client.end();
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

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

async function rows(
  dataset: string,
  query: DatasetQuery,
  userId: string = reader
) {
  return (await queryDataset(contextFor(userId), { dataset, query })).rows;
}

const ofCustomer = (customerId: string, field = "customerId") =>
  ({ field, op: "eq", value: customerId }) as const;

describe("invoice datasets", () => {
  it("at 2026-10-27, due the day before is overdue by one day, due on the day is not, and no due date is never overdue but stays outstanding", async () => {
    const { id: customerId } = await insertCustomer(t());
    const a = await insertInvoice(t(), {
      customerId,
      number: "A",
      totalCents: 100_000,
      dueDate: "2026-10-26",
    });
    await insertInvoice(t(), {
      customerId,
      number: "B",
      totalCents: 50_000,
      dueDate: "2026-10-27",
    });
    await insertInvoice(t(), {
      customerId,
      number: "C",
      totalCents: 40_000,
      dueDate: null,
    });
    const { id: paymentId } = await insertPayment(t(), { customerId });
    await insertAllocation(t(), {
      invoiceId: a.id,
      paymentId,
      amountCents: 30_000,
    });

    expect(
      await rows("invoices.invoices", {
        select: ["invoiceNumber", "outstandingCents", "overdue", "daysOverdue"],
        filters: [ofCustomer(customerId)],
        orderBy: [{ column: "invoiceNumber", direction: "asc" }],
      })
    ).toEqual([
      {
        invoiceNumber: "A",
        outstandingCents: 70_000,
        overdue: true,
        daysOverdue: 1,
      },
      {
        invoiceNumber: "B",
        outstandingCents: 50_000,
        overdue: false,
        daysOverdue: null,
      },
      {
        invoiceNumber: "C",
        outstandingCents: 40_000,
        overdue: false,
        daysOverdue: null,
      },
    ]);

    const outstanding = {
      fn: "sum",
      field: "outstandingCents",
      as: "total",
    } as const;

    expect(
      await rows("invoices.invoices", {
        filters: [
          ofCustomer(customerId),
          { field: "overdue", op: "eq", value: true },
        ],
        aggregates: [outstanding],
      })
    ).toEqual([{ total: 70_000 }]);
    expect(
      await rows("invoices.invoices", {
        filters: [ofCustomer(customerId), { field: "dueDate", op: "isNull" }],
        aggregates: [outstanding],
      })
    ).toEqual([{ total: 40_000 }]);
  });

  it("a payment and an invoice dated after the reporting date change nothing", async () => {
    const { id: customerId } = await insertCustomer(t());
    const first = await insertInvoice(t(), {
      customerId,
      totalCents: 50_000,
      invoiceDate: "2026-10-01",
    });
    await insertInvoice(t(), { customerId, invoiceDate: "2026-10-28" });
    const { id: paymentId } = await insertPayment(t(), {
      customerId,
      paymentDate: "2026-10-28",
      amountCents: 50_000,
    });
    await insertAllocation(t(), {
      invoiceId: first.id,
      paymentId,
      amountCents: 50_000,
    });

    expect(
      await rows("invoices.invoices", {
        select: ["outstandingCents"],
        filters: [{ field: "id", op: "eq", value: first.id }],
      })
    ).toEqual([{ outstandingCents: 50_000 }]);
    // Core's sum over no rows answers null: no collections at the reporting date.
    expect(
      await rows("invoices.payments", {
        filters: [ofCustomer(customerId)],
        aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
      })
    ).toEqual([{ total: null }]);
    expect(
      await rows("invoices.invoices", {
        filters: [ofCustomer(customerId)],
        aggregates: [{ fn: "count", as: "n" }],
      })
    ).toEqual([{ n: 1 }]);
    expect(
      await rows("invoices.allocations", {
        select: ["id"],
        filters: [ofCustomer(customerId)],
      })
    ).toEqual([]);
    expect(
      await rows("invoices.customers", {
        select: ["firstInvoiceDate"],
        filters: [ofCustomer(customerId, "id")],
      })
    ).toEqual([{ firstInvoiceDate: "2026-10-01" }]);
  });

  it("settledOn is the last payment date, paidLate holds only for a settled invoice with a due date, and the customer counts 2 settled and 1 late", async () => {
    const { id: customerId } = await insertCustomer(t());
    const paid = async (
      number: string,
      dueDate: string | null,
      paymentDate: string,
      amountCents = 1000
    ) => {
      const { id: invoiceId } = await insertInvoice(t(), {
        customerId,
        number,
        dueDate,
        totalCents: 1000,
      });
      const { id: paymentId } = await insertPayment(t(), {
        customerId,
        paymentDate,
        amountCents,
      });
      await insertAllocation(t(), { invoiceId, paymentId, amountCents });
    };
    await paid("D", "2026-10-15", "2026-10-16");
    await paid("E", "2026-10-15", "2026-10-15");
    await paid("F", "2026-10-15", "2026-10-16", 600);
    await paid("G", null, "2026-10-20");

    expect(
      await rows("invoices.invoices", {
        select: ["invoiceNumber", "settledOn", "paidLate"],
        filters: [ofCustomer(customerId)],
        orderBy: [{ column: "invoiceNumber", direction: "asc" }],
      })
    ).toEqual([
      { invoiceNumber: "D", settledOn: "2026-10-16", paidLate: true },
      { invoiceNumber: "E", settledOn: "2026-10-15", paidLate: false },
      { invoiceNumber: "F", settledOn: null, paidLate: null },
      { invoiceNumber: "G", settledOn: "2026-10-20", paidLate: null },
    ]);
    expect(
      await rows("invoices.customers", {
        select: ["settledWithDueDateCount", "paidLateCount"],
        filters: [ofCustomer(customerId, "id")],
      })
    ).toEqual([{ settledWithDueDateCount: 2, paidLateCount: 1 }]);
  });

  it("a payment answers its unallocated amount and each link is one allocation row", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id: invoiceId } = await insertInvoice(t(), { customerId });
    const { id: paymentId } = await insertPayment(t(), {
      customerId,
      amountCents: 100_000,
      paymentDate: "2026-10-12",
    });
    await insertAllocation(t(), { invoiceId, paymentId, amountCents: 60_000 });

    expect(
      await rows("invoices.payments", {
        select: ["unallocatedCents"],
        filters: [ofCustomer(customerId)],
      })
    ).toEqual([{ unallocatedCents: 40_000 }]);
    expect(
      await rows("invoices.allocations", {
        select: ["amountCents", "paymentDate", "automatic"],
        filters: [ofCustomer(customerId)],
      })
    ).toEqual([
      { amountCents: 60_000, paymentDate: "2026-10-12", automatic: false },
    ]);
  });

  it("a link to an invoice dated after the reporting date leaves its payment unallocated and has no allocation row", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id: invoiceId } = await insertInvoice(t(), {
      customerId,
      invoiceDate: "2026-10-28",
    });
    const { id: paymentId } = await insertPayment(t(), {
      customerId,
      amountCents: 1000,
      paymentDate: "2026-10-20",
    });
    await insertAllocation(t(), { invoiceId, paymentId, amountCents: 1000 });

    expect(
      await rows("invoices.payments", {
        select: ["unallocatedCents"],
        filters: [ofCustomer(customerId)],
      })
    ).toEqual([{ unallocatedCents: 1000 }]);
    expect(
      await rows("invoices.allocations", {
        select: ["id"],
        filters: [ofCustomer(customerId)],
      })
    ).toEqual([]);
    expect(
      await rows("invoices.customers", {
        select: ["firstInvoiceDate"],
        filters: [ofCustomer(customerId, "id")],
      })
    ).toEqual([{ firstInvoiceDate: null }]);
  });

  it("a person reading one customer sees only its rows in all four datasets", async () => {
    const [a, b] = await Promise.all([
      insertCustomer(t()),
      insertCustomer(t()),
    ]);

    if (a === undefined || b === undefined) throw new Error("no customers");

    await Promise.all(
      [a, b].map(async ({ id: customerId }) => {
        const { id: invoiceId } = await insertInvoice(t(), { customerId });
        const { id: paymentId } = await insertPayment(t(), { customerId });
        await insertAllocation(t(), {
          invoiceId,
          paymentId,
          amountCents: 1000,
        });
      })
    );

    const { userId } = await insertPersonWith(t(), ["invoices:read"], {
      type: "invoices-customer",
      id: a.id,
    });
    const both = (field: string) =>
      [{ field, op: "in", values: [a.id, b.id] }] as const;

    const read = (dataset: string, field: string) =>
      rows(dataset, { select: [field], filters: both(field) }, userId);

    expect(
      await Promise.all([
        read("invoices.invoices", "customerId"),
        read("invoices.payments", "customerId"),
        read("invoices.allocations", "customerId"),
        read("invoices.customers", "id"),
      ])
    ).toEqual([
      [{ customerId: a.id }],
      [{ customerId: a.id }],
      [{ customerId: a.id }],
      [{ id: a.id }],
    ]);
  });

  it("recordRoute opens an invoice only for a person with invoices:use", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id, number } = await insertInvoice(t(), { customerId });
    const { userId: user } = await insertPersonWith(t(), [
      "invoices:read",
      "invoices:use",
    ]);
    const route = (userId: string) =>
      recordRoute(contextFor(userId), { dataset: "invoices.invoices", id });

    expect(await route(user)).toEqual({
      label: number,
      path: `/m/invoices/invoices/${id}`,
    });
    expect(await route(reader)).toBeNull();
  });
});
