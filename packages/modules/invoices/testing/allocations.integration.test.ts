import { setTimeout as sleep } from "node:timers/promises";

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
  insertAllocation,
  insertCustomer,
  insertInvoice,
  insertPayment,
} from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * Links, changes and unlinks through the router on a real Postgres (R-32, R-34). The races hold a
 * real row lock from a second connection, so both calls are proved to wait on the same row.
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

const finance = () =>
  callProcedure(invoicesRouter, {
    tenant: t(),
    caller: principalFor({
      tenant: t(),
      modules: [invoicesModule],
      userId: financeUserId,
      authenticated: true,
    }),
  } satisfies ModuleRequestContext);

async function allocatedOf(
  table: "invoice" | "payment",
  id: string
): Promise<number> {
  const { rows } = await t().db.$client.query<{ n: number }>(
    `select coalesce(sum(amount_cents), 0)::int as n from allocation where ${table}_id = $1`,
    [id]
  );

  return rows[0]?.n ?? -1;
}

async function waitingOnLocks(): Promise<number> {
  const { rows } = await t().db.$client.query<{ n: number }>(
    "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'"
  );

  return rows[0]?.n ?? 0;
}

/**
 * The invoice has 4,000 allocated from another payment and the payment 3,000 to another
 * invoice, so each open amount below is what remains after allocations already saved.
 */
async function aPairWithOpen(invoiceOpen: number, paymentFree: number) {
  const { id: customerId } = await insertCustomer(t());
  const invoice = await insertInvoice(t(), {
    customerId,
    totalCents: invoiceOpen + 4000,
  });
  const payment = await insertPayment(t(), {
    customerId,
    amountCents: paymentFree + 3000,
  });
  const otherPayment = await insertPayment(t(), { customerId });
  const otherInvoice = await insertInvoice(t(), { customerId });

  await insertAllocation(t(), {
    invoiceId: invoice.id,
    paymentId: otherPayment.id,
    amountCents: 4000,
  });
  await insertAllocation(t(), {
    invoiceId: otherInvoice.id,
    paymentId: payment.id,
    amountCents: 3000,
  });

  return { invoiceId: invoice.id, paymentId: payment.id };
}

/** A link of 2,000 on an invoice with 4,000 open beside it, and a payment with room to spare. */
async function aLinkWithOpen() {
  const pair = await aPairWithOpen(6000, 20_000);
  const { id } = await insertAllocation(t(), { ...pair, amountCents: 2000 });

  return id;
}

async function amountOf(allocationId: string) {
  const { rows } = await t().db.$client.query<{ amount_cents: number }>(
    "select amount_cents from allocation where id = $1",
    [allocationId]
  );

  return rows[0]?.amount_cents;
}

describe("invoice allocations", () => {
  it.each([
    {
      held: "invoice",
      code: "invoices:exceeds-invoice-balance",
      allocated: 6000,
      setup: async () => {
        const { id: customerId } = await insertCustomer(t());
        const { id: invoiceId } = await insertInvoice(t(), {
          customerId,
          totalCents: 10_000,
        });
        const p1 = await insertPayment(t(), { customerId, amountCents: 6000 });
        const p2 = await insertPayment(t(), { customerId, amountCents: 6000 });

        return {
          heldTable: "invoice" as const,
          heldId: invoiceId,
          links: [p1, p2].map((p) => ({
            invoiceId,
            paymentId: p.id,
            amountCents: 6000,
          })),
        };
      },
    },
    {
      held: "payment",
      code: "invoices:exceeds-payment-balance",
      allocated: 5000,
      setup: async () => {
        const { id: customerId } = await insertCustomer(t());
        const { id: paymentId } = await insertPayment(t(), {
          customerId,
          amountCents: 8000,
        });
        const i1 = await insertInvoice(t(), { customerId, totalCents: 6000 });
        const i2 = await insertInvoice(t(), { customerId, totalCents: 6000 });

        return {
          heldTable: "payment" as const,
          heldId: paymentId,
          links: [i1, i2].map((i) => ({
            invoiceId: i.id,
            paymentId,
            amountCents: 5000,
          })),
        };
      },
    },
  ])(
    "two links at the same time never exceed the $held",
    async (row) => {
      const { heldTable, heldId, links } = await row.setup();
      const held = await t().db.$client.connect();
      let waiting = 0;

      try {
        await held.query("begin");
        await held.query(
          `select 1 from ${heldTable} where id = $1 for update`,
          [heldId]
        );

        const [a, b] = links.map((link) => finance().linkPayment(link));

        for (let tries = 0; tries < 200 && waiting < 2; tries += 1) {
          // oxlint-disable-next-line no-await-in-loop -- polling one value until it holds.
          await sleep(50);
          // oxlint-disable-next-line no-await-in-loop
          waiting = await waitingOnLocks();
        }

        await held.query("rollback");

        const settled = await Promise.allSettled([a, b]);

        expect(settled.map((result) => result.status).toSorted()).toEqual([
          "fulfilled",
          "rejected",
        ]);

        const rejected = settled.find((result) => result.status === "rejected");

        expect(rejected?.reason).toMatchObject({ code: row.code });
        expect(await allocatedOf(heldTable, heldId)).toBe(row.allocated);
        // Both calls really waited on the held row, so the case is a race.
        expect(waiting).toBeGreaterThanOrEqual(2);
      } finally {
        held.release();
      }
    },
    30000
  );

  it.each(
    [
      {
        name: "a link equal to both open amounts is saved",
        run: async () => {
          const pair = await aPairWithOpen(6000, 6000);

          await finance().linkPayment({ ...pair, amountCents: 6000 });
          expect(await allocatedOf("invoice", pair.invoiceId)).toBe(10_000);
        },
        code: undefined,
      },
      {
        name: "one cent above the invoice's open balance is refused",
        run: async () => {
          await finance().linkPayment({
            ...(await aPairWithOpen(6000, 7000)),
            amountCents: 6001,
          });
        },
        code: "invoices:exceeds-invoice-balance",
      },
      {
        name: "one cent above the payment's unallocated amount is refused",
        run: async () => {
          await finance().linkPayment({
            ...(await aPairWithOpen(7000, 6000)),
            amountCents: 6001,
          });
        },
        code: "invoices:exceeds-payment-balance",
      },
      {
        name: "a change to the open balance plus the link's own amount is saved",
        run: async () => {
          const id = await aLinkWithOpen();

          await finance().changeAllocation({ id, amountCents: 6000 });
          expect(await amountOf(id)).toBe(6000);
        },
        code: undefined,
      },
      {
        name: "a change one cent above the open balance plus the link's own amount is refused and leaves the amount",
        run: async () => {
          const id = await aLinkWithOpen();

          try {
            await finance().changeAllocation({ id, amountCents: 6001 });
          } finally {
            expect(await amountOf(id)).toBe(2000);
          }
        },
        code: "invoices:exceeds-invoice-balance",
      },
    ].map((row) => [row.name, row] as const)
  )(
    // `%s`, not `$name`: vitest shortens an interpolated object field, and the manifest needs the whole name.
    "at the balance edge, %s",
    async (_, { run, code }) => {
      await (code === undefined
        ? expect(run()).resolves.toBeUndefined()
        : expect(run()).rejects.toMatchObject({ code }));
    }
  );

  it.each([
    {
      name: "an invoice of another customer",
      pair: async () => {
        const a = await insertCustomer(t());
        const b = await insertCustomer(t());

        return {
          invoiceId: (await insertInvoice(t(), { customerId: a.id })).id,
          paymentId: (await insertPayment(t(), { customerId: b.id })).id,
        };
      },
    },
    {
      name: "a payment in another currency",
      pair: async () => {
        const { id: customerId } = await insertCustomer(t());

        return {
          invoiceId: (await insertInvoice(t(), { customerId, currency: "SGD" }))
            .id,
          paymentId: (await insertPayment(t(), { customerId, currency: "USD" }))
            .id,
        };
      },
    },
  ])("refuses a link to $name with link-mismatch", async ({ pair }) => {
    const ids = await pair();

    await expect(
      finance().linkPayment({ ...ids, amountCents: 100 })
    ).rejects.toMatchObject({ code: "invoices:link-mismatch" });
    expect(await allocatedOf("invoice", ids.invoiceId)).toBe(0);
  });

  it("link, change and unlink write three events and three audit rows, and return the amount", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id: invoiceId } = await insertInvoice(t(), {
      customerId,
      totalCents: 10_000,
    });
    const { id: paymentId } = await insertPayment(t(), {
      customerId,
      amountCents: 10_000,
    });

    const { allocationId } = await finance().linkPayment({
      invoiceId,
      paymentId,
      amountCents: 3000,
    });
    await finance().changeAllocation({ id: allocationId, amountCents: 5000 });
    const { unlinkedCents } = await finance().unlinkAllocation({
      id: allocationId,
    });

    expect(unlinkedCents).toBe(5000);
    expect(await allocatedOf("payment", paymentId)).toBe(0);

    const events = await t().db.$client.query(
      "select allocation_id, invoice_id, payment_id, action, amount_before_cents, amount_after_cents, automatic, actor_user_id from allocation_event where invoice_id = $1 order by occurred_at, ctid",
      [invoiceId]
    );
    const common = {
      allocation_id: allocationId,
      invoice_id: invoiceId,
      payment_id: paymentId,
      automatic: false,
      actor_user_id: financeUserId,
    };

    expect(events.rows).toEqual([
      {
        ...common,
        action: "linked",
        amount_before_cents: 0,
        amount_after_cents: 3000,
      },
      {
        ...common,
        action: "changed",
        amount_before_cents: 3000,
        amount_after_cents: 5000,
      },
      {
        ...common,
        action: "unlinked",
        amount_before_cents: 5000,
        amount_after_cents: 0,
      },
    ]);

    const audit = await t().db.$client.query(
      "select action, actor_user_id, target_type, target_id from audit_event where target_id = $1 order by occurred_at, ctid",
      [invoiceId]
    );
    const target = {
      actor_user_id: financeUserId,
      target_type: "invoices-invoice",
      target_id: invoiceId,
    };

    expect(audit.rows).toEqual([
      { ...target, action: "invoices:allocation-linked" },
      { ...target, action: "invoices:allocation-changed" },
      { ...target, action: "invoices:allocation-unlinked" },
    ]);
  });
});
