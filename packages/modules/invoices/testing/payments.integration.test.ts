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
import type { z } from "zod";

import type { SavePaymentInput } from "../src/contract.ts";
import { invoicesModule } from "../src/module.ts";
import { invoicesRouter } from "../src/router.ts";
import {
  type readingPaymentInput,
  recordPaymentFromReading,
} from "../src/services/ledger/payments.ts";
import type { PaymentMatch } from "../src/services/matching/decide.ts";
import {
  insertCustomer,
  insertInvoice,
  insertPayment,
  insertPaymentDocument,
} from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * Payment saves by hand and from a reading, on a real Postgres (R-30, R-33, R-34). Every case
 * makes its own customer, so the cases share one deployment.
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

const context = (): ModuleRequestContext => ({
  tenant: t(),
  caller: principalFor({
    tenant: t(),
    modules: [invoicesModule],
    userId: financeUserId,
    authenticated: true,
  }),
});

const pay = (input: Partial<SavePaymentInput>) =>
  callProcedure(invoicesRouter, context()).savePayment({
    documentId: null,
    customer: {
      name: `Customer ${randomUUID()}`,
      email: null,
      confirmed: true,
    },
    paymentDate: "2026-10-10",
    currency: "SGD",
    amountCents: 100_000,
    reference: null,
    method: null,
    namedInvoiceNumbers: [],
    allocations: [],
    keepPossibleDuplicate: false,
    ...input,
  });

type Reading = Partial<z.input<typeof readingPaymentInput>>;

/** A reading of a payment document whose three match facts passed the quote check by default. */
async function read(input: Reading & { customerName: string }) {
  return recordPaymentFromReading(context(), {
    documentId: input.documentId ?? (await insertPaymentDocument(t())),
    paymentDate: "2026-10-10",
    currency: "SGD",
    amountCents: 100_000,
    reference: null,
    method: null,
    namedInvoiceNumbers: [],
    ...input,
  });
}

async function count(fromWhere: string, values: unknown[] = []) {
  const { rows } = await t().db.$client.query<{ n: number }>(
    `select count(*)::int as n from ${fromWhere}`,
    values
  );

  return rows[0]?.n;
}

async function linksOf(paymentId: string) {
  const { rows } = await t().db.$client.query(
    `select invoice_id as "invoiceId", amount_cents as "amountCents", automatic from allocation where payment_id = $1 order by amount_cents`,
    [paymentId]
  );

  return rows;
}

async function openCentsOf(invoiceId: string) {
  const { rows } = await t().db.$client.query<{ open: number }>(
    "select (i.total_cents - coalesce((select sum(a.amount_cents) from allocation a where a.invoice_id = i.id), 0))::int as open from invoice i where i.id = $1",
    [invoiceId]
  );

  return rows[0]?.open;
}

type Invoices = { readonly a: string; readonly b: string; readonly c: string };

const READINGS: readonly {
  readonly name: string;
  readonly named: readonly string[];
  readonly amountCents: number;
  readonly amountOrigin?: "corrected";
  readonly match: ((ids: Invoices) => PaymentMatch) | null;
}[] = [
  {
    name: "one named invoice with checked facts links automatically",
    named: ["INV-A"],
    amountCents: 300_000,
    match: null,
  },
  {
    name: "two named invoices answer a split",
    named: ["INV-B", "INV-C"],
    amountCents: 825_000,
    match: ({ b, c }) => ({
      kind: "split",
      parts: [
        { invoiceId: b, amountCents: 405_000 },
        { invoiceId: c, amountCents: 420_000 },
      ],
      unallocatedCents: 0,
    }),
  },
  {
    name: "an amount above the open balance answers an overpayment",
    named: ["INV-A"],
    amountCents: 600_000,
    match: ({ a }) => ({
      kind: "overpayment",
      invoiceId: a,
      amountCents: 520_000,
      unallocatedCents: 80_000,
    }),
  },
  {
    name: "a corrected amount answers confirm",
    named: ["INV-A"],
    amountCents: 300_000,
    amountOrigin: "corrected",
    match: ({ a }) => ({ kind: "confirm", invoiceId: a, amountCents: 300_000 }),
  },
  {
    name: "no named invoice and an amount equal to one open balance answers suggestions",
    named: [],
    amountCents: 405_000,
    match: ({ b }) => ({ kind: "suggestions", invoiceIds: [b] }),
  },
  {
    name: "no named invoice and no equal open balance answers no-match",
    named: [],
    amountCents: 222_200,
    match: () => ({ kind: "no-match" }),
  },
];

describe("payment saves", () => {
  it("a payment saved with two chosen links saves both, and a link above an open balance saves nothing", async () => {
    const { id: customerId } = await insertCustomer(t());
    const a = await insertInvoice(t(), { customerId, totalCents: 405_000 });
    const b = await insertInvoice(t(), { customerId, totalCents: 420_000 });

    const result = await pay({
      customer: { id: customerId },
      amountCents: 825_000,
      allocations: [
        { invoiceId: b.id, amountCents: 420_000 },
        { invoiceId: a.id, amountCents: 405_000 },
      ],
    });

    if (result.outcome !== "saved") throw new Error("expected a saved payment");
    expect(await linksOf(result.paymentId)).toEqual([
      { invoiceId: a.id, amountCents: 405_000, automatic: false },
      { invoiceId: b.id, amountCents: 420_000, automatic: false },
    ]);
    expect(result.allocations).toHaveLength(2);

    const c = await insertInvoice(t(), { customerId, totalCents: 405_000 });
    const paymentsOf = () =>
      count("payment where customer_id = $1", [customerId]);
    const before = await paymentsOf();

    await expect(
      pay({
        customer: { id: customerId },
        amountCents: 405_001,
        allocations: [{ invoiceId: c.id, amountCents: 405_001 }],
      })
    ).rejects.toMatchObject({ code: "invoices:exceeds-invoice-balance" });
    expect(await paymentsOf()).toBe(before);
  });

  it.each(READINGS.map((row) => [row.name, row] as const))(
    // `%s`, not `$name`: vitest shortens an interpolated object field, and the manifest needs the whole name.
    "a reading against INV-A of 520,000, INV-B of 405,000 and INV-C of 420,000: %s",
    async (_, row) => {
      const customer = await insertCustomer(t());
      const customerId = customer.id;
      const invoiceOf = (number: string, totalCents: number) =>
        insertInvoice(t(), {
          customerId,
          number,
          totalCents,
          invoiceDate: "2026-09-01",
        });
      const ids = {
        a: (await invoiceOf("INV-A", 520_000)).id,
        b: (await invoiceOf("INV-B", 405_000)).id,
        c: (await invoiceOf("INV-C", 420_000)).id,
      };
      const documentId = await insertPaymentDocument(
        t(),
        row.amountOrigin ?? "extracted"
      );

      const result = await read({
        documentId,
        customerName: customer.name,
        amountCents: row.amountCents,
        namedInvoiceNumbers: [...row.named],
      });
      const paymentsOfDocument = await count("payment where document_id = $1", [
        documentId,
      ]);

      if (row.match === null) {
        expect(result).toEqual({
          outcome: "saved",
          paymentId: expect.any(String),
          customerId,
          allocationId: expect.any(String),
          invoiceId: ids.a,
          amountCents: 300_000,
        });
        if (result.outcome !== "saved") return;
        expect(await linksOf(result.paymentId)).toEqual([
          { invoiceId: ids.a, amountCents: 300_000, automatic: true },
        ]);
        expect(await openCentsOf(ids.a)).toBe(220_000);
        expect(paymentsOfDocument).toBe(1);

        return;
      }

      expect(result).toEqual({
        outcome: "needs-review",
        customerId,
        match: row.match(ids),
      });
      expect(paymentsOfDocument).toBe(0);
    }
  );

  it("a reading of an unknown customer answers needs-review and writes no customer and no payment", async () => {
    const documentId = await insertPaymentDocument(t());

    await expect(
      read({ documentId, customerName: "Nobody Ltd" })
    ).resolves.toEqual({
      outcome: "needs-review",
      customerId: null,
      match: { kind: "no-match" },
    });
    expect(
      await count("customer where lower(btrim(name)) = 'nobody ltd'")
    ).toBe(0);
    expect(await count("payment where document_id = $1", [documentId])).toBe(0);
  });

  it("the same customer, date, amount and currency answers possible-duplicate in both paths until the person keeps it", async () => {
    const customer = await insertCustomer(t());
    const existing = await insertPayment(t(), {
      customerId: customer.id,
      paymentDate: "2026-10-10",
      amountCents: 100_000,
      currency: "SGD",
    });
    const facts = {
      paymentDate: "2026-10-10",
      amountCents: 100_000,
      currency: "SGD",
    };
    const duplicate = {
      outcome: "possible-duplicate",
      duplicateOf: existing.id,
    };
    const paymentsOf = () =>
      count("payment where customer_id = $1", [customer.id]);

    await expect(
      pay({ customer: { id: customer.id }, ...facts })
    ).resolves.toEqual(duplicate);
    await expect(
      read({ customerName: customer.name, ...facts })
    ).resolves.toEqual(duplicate);
    expect(await paymentsOf()).toBe(1);

    await expect(
      pay({
        customer: { id: customer.id },
        ...facts,
        keepPossibleDuplicate: true,
      })
    ).resolves.toMatchObject({ outcome: "saved" });
    expect(await paymentsOf()).toBe(2);
  });

  it("a second reading of a saved document answers already-saved, and a save by hand of it is refused", async () => {
    const customer = await insertCustomer(t());
    await insertInvoice(t(), {
      customerId: customer.id,
      number: "INV-A",
      totalCents: 520_000,
    });
    const documentId = await insertPaymentDocument(t());
    const reading = {
      documentId,
      customerName: customer.name,
      amountCents: 300_000,
      namedInvoiceNumbers: ["INV-A"],
    };

    const first = await read(reading);

    if (first.outcome !== "saved") throw new Error("expected a saved payment");
    // A retried reading job: the identical reading again.
    await expect(read(reading)).resolves.toEqual({
      outcome: "already-saved",
      paymentId: first.paymentId,
    });
    // A double click of the person's save: the same facts would also answer possible-duplicate.
    await expect(
      pay({
        documentId,
        customer: { id: customer.id },
        amountCents: 300_000,
      })
    ).rejects.toMatchObject({ code: "invoices:document-already-saved" });
    expect(await count("payment where document_id = $1", [documentId])).toBe(1);
  });
});
