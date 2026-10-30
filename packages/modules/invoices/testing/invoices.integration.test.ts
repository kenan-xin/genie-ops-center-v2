import { randomUUID } from "node:crypto";

import {
  callProcedure,
  principalFor,
  type ModuleRequestContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import { invoicesRouter } from "../src/router.ts";
import {
  insertCustomer,
  insertDocument,
  insertInvoice,
  insertPayment,
  insertPaymentDocument,
} from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * Invoice saves through the router on a real Postgres (R-29, R-31, R-33). Every case uses its own
 * customers, so the cases share one deployment.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let financeUserId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  await enableModules(deployment.context, ["invoices"]);
  // The write key of the Finance role, tenant-wide.
  ({ userId: financeUserId } = await insertPersonWith(deployment.context, [
    "invoices:write",
  ]));
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const t = () => deployment.context;

const as = (userId: string) =>
  callProcedure(invoicesRouter, {
    tenant: t(),
    caller: principalFor({
      tenant: t(),
      modules: [invoicesModule],
      userId,
      authenticated: true,
    }),
  } satisfies ModuleRequestContext);

type SaveInput = Parameters<ReturnType<typeof as>["saveInvoice"]>[0];

const save = (input: Partial<SaveInput>, userId = financeUserId) =>
  as(userId).saveInvoice({
    documentId: null,
    customer: {
      name: `Customer ${randomUUID()}`,
      email: null,
      confirmed: true,
    },
    number: `INV-${randomUUID()}`,
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-31",
    dueDateSource: "document",
    paymentTerms: null,
    currency: "SGD",
    totalCents: 100_000,
    description: null,
    keepPossibleDuplicate: false,
    ...input,
  });

async function saved(input: Partial<SaveInput>) {
  const result = await save(input);

  if (result.outcome !== "saved") throw new Error("expected a saved invoice");

  return result;
}

async function count(fromWhere: string, values: unknown[] = []) {
  const { rows } = await t().db.$client.query<{ n: number }>(
    `select count(*)::int as n from ${fromWhere}`,
    values
  );

  return rows[0]?.n;
}

async function auditActions(targetId: string) {
  const { rows } = await t().db.$client.query<{ action: string }>(
    "select action from audit_event where target_id = $1",
    [targetId]
  );

  return rows.map((row) => row.action);
}

type PaymentRowSpec = {
  readonly amountCents: number;
  readonly named: readonly string[];
  readonly paymentDate?: string;
  readonly currency?: string;
  readonly amountOrigin?: "corrected";
};

describe("invoice saves", () => {
  it("a confirmed new customer is created once and reused when named in another case", async () => {
    const first = await saved({
      customer: { name: "Northwind Studio", email: null, confirmed: true },
      number: "INV-1",
    });
    const second = await saved({
      customer: { name: "  northwind studio ", email: null, confirmed: true },
      number: "INV-2",
    });

    expect(second.customerId).toBe(first.customerId);
    expect(
      await count("customer where lower(btrim(name)) = 'northwind studio'")
    ).toBe(1);
    expect(await auditActions(first.customerId)).toContain(
      "invoices:customer-created"
    );
  });

  it("a writer scoped to one customer is refused a new customer", async () => {
    const a = await insertCustomer(t());
    const { userId } = await insertPersonWith(t(), ["invoices:write"], {
      type: "invoices-customer",
      id: a.id,
    });
    const name = `Customer ${randomUUID()}`;

    await expect(
      save({ customer: { name, email: null, confirmed: true } }, userId)
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await count("customer where name = $1", [name])).toBe(0);
  });

  it("the same customer and number answers possible-duplicate until the person keeps it", async () => {
    const { id: customerId } = await insertCustomer(t());
    const existing = await insertInvoice(t(), { customerId, number: "INV-7" });
    const invoicesOf = () =>
      count("invoice where customer_id = $1", [customerId]);

    await expect(
      save({ customer: { id: customerId }, number: "inv-7 " })
    ).resolves.toEqual({
      outcome: "possible-duplicate",
      duplicateOf: existing.id,
    });
    expect(await invoicesOf()).toBe(1);

    await expect(
      save({
        customer: { id: customerId },
        number: "inv-7 ",
        keepPossibleDuplicate: true,
      })
    ).resolves.toMatchObject({ outcome: "saved" });
    expect(await invoicesOf()).toBe(2);

    const other = await insertCustomer(t());

    await expect(
      save({ customer: { id: other.id }, number: "INV-7" })
    ).resolves.toMatchObject({ outcome: "saved" });
  });

  it.each(["purchase-order", "payment"] as const)(
    "refuses a %s document with document-kind-mismatch and saves nothing",
    async (kind) => {
      const document = await insertDocument(t(), { kind });

      await expect(save({ documentId: document.id })).rejects.toMatchObject({
        code: "invoices:document-kind-mismatch",
      });
      expect(await count("invoice where document_id = $1", [document.id])).toBe(
        0
      );
    }
  );

  it("a second save from the same document is refused with document-already-saved", async () => {
    const { id: customerId } = await insertCustomer(t());
    const document = await insertDocument(t(), { kind: "invoice" });
    const input = {
      documentId: document.id,
      customer: { id: customerId },
      number: "INV-5",
    };

    await expect(save(input)).resolves.toMatchObject({ outcome: "saved" });
    // A double click: the identical payload again.
    await expect(save(input)).rejects.toMatchObject({
      code: "invoices:document-already-saved",
    });
    expect(await count("invoice where document_id = $1", [document.id])).toBe(
      1
    );
  });

  it.each(
    [
      {
        name: "a payment of 300,000 naming INV-9 links automatically",
        payments: [{ amountCents: 300_000, named: ["INV-9"] }],
        linked: [0],
      },
      {
        name: "a payment whose amount was corrected stays unallocated",
        payments: [
          {
            amountCents: 300_000,
            named: ["INV-9"],
            amountOrigin: "corrected" as const,
          },
        ],
        linked: [],
      },
      {
        name: "a payment above the total stays unallocated",
        payments: [{ amountCents: 800_000, named: ["INV-9"] }],
        linked: [],
      },
      {
        name: "a payment naming two invoices stays unallocated",
        payments: [{ amountCents: 300_000, named: ["INV-10", "INV-9"] }],
        linked: [],
      },
      {
        name: "a payment in another currency stays unallocated",
        payments: [{ amountCents: 300_000, named: ["INV-9"], currency: "USD" }],
        linked: [],
      },
      {
        name: "of two payments the older links and the second stays unallocated",
        // The later payment is inserted first, so only the date order picks the older one.
        payments: [
          { amountCents: 500_000, named: ["INV-9"], paymentDate: "2026-10-02" },
          { amountCents: 300_000, named: ["INV-9"], paymentDate: "2026-10-01" },
        ],
        linked: [1],
      },
    ].map((row) => [row.name, row] as const)
  )(
    // `%s`, not `$name`: vitest shortens an interpolated object field, and the manifest needs the whole name.
    "saving invoice inv-9 of 720,000, %s",
    async (_, row) => {
      const { id: customerId } = await insertCustomer(t());
      const payments: readonly PaymentRowSpec[] = row.payments;
      const paymentIds: string[] = [];

      for (const spec of payments) {
        // oxlint-disable-next-line no-await-in-loop -- the insert order is part of the case.
        const documentId = await insertPaymentDocument(
          t(),
          spec.amountOrigin ?? "extracted"
        );
        // oxlint-disable-next-line no-await-in-loop
        const inserted = await insertPayment(t(), {
          customerId,
          documentId,
          amountCents: spec.amountCents,
          namedInvoiceNumbers: spec.named,
          paymentDate: spec.paymentDate ?? "2026-10-10",
          currency: spec.currency ?? "SGD",
        });

        paymentIds.push(inserted.id);
      }

      const expected = row.linked.map((index) => ({
        paymentId: paymentIds[index],
        amountCents: payments[index]?.amountCents,
      }));

      const result = await saved({
        customer: { id: customerId },
        number: "inv-9 ",
        totalCents: 720_000,
      });

      expect(result.linkedPayments).toEqual(
        expected.map((link) => ({ ...link, allocationId: expect.any(String) }))
      );

      const allocations = await t().db.$client.query(
        `select id as "allocationId", payment_id as "paymentId", amount_cents as "amountCents", automatic from allocation where invoice_id = $1`,
        [result.invoiceId]
      );

      expect(allocations.rows).toEqual(
        result.linkedPayments.map((link) => ({ ...link, automatic: true }))
      );

      const events = await t().db.$client.query(
        `select payment_id as "paymentId", amount_after_cents as "amountCents", action, automatic from allocation_event where invoice_id = $1`,
        [result.invoiceId]
      );

      expect(events.rows).toEqual(
        expected.map((link) => ({ ...link, action: "linked", automatic: true }))
      );
      expect(
        (await auditActions(result.invoiceId)).filter(
          (action) => action === "invoices:allocation-linked"
        )
      ).toHaveLength(expected.length);
    }
  );
});
