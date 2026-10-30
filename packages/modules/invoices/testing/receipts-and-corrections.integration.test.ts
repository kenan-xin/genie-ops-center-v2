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
  insertDocument,
  insertInvoice,
  insertPayment,
} from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * Paid receipts and invoice total corrections through the router on a real Postgres (R-32, R-33).
 * Every case makes its own customer, so the cases share one deployment.
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

const api = () =>
  callProcedure(invoicesRouter, {
    tenant: t(),
    caller: principalFor({
      tenant: t(),
      modules: [invoicesModule],
      userId: financeUserId,
      authenticated: true,
    }),
  } satisfies ModuleRequestContext);

type Link = {
  readonly allocationId: string;
  readonly paymentId: string;
  readonly amountCents: number;
};

type Links = { readonly first: Link; readonly second: Link };

/** An invoice of 500,000 with links of 200,000 ("first") and 100,000 ("second"), no events. */
async function invoiceWithLinks(): Promise<Links & { invoiceId: string }> {
  const { id: customerId } = await insertCustomer(t());
  const { id: invoiceId } = await insertInvoice(t(), {
    customerId,
    totalCents: 500_000,
  });
  const link = async (amountCents: number): Promise<Link> => {
    const { id: paymentId } = await insertPayment(t(), {
      customerId,
      amountCents,
    });
    const { id: allocationId } = await insertAllocation(t(), {
      invoiceId,
      paymentId,
      amountCents,
    });

    return { allocationId, paymentId, amountCents };
  };

  return { invoiceId, first: await link(200_000), second: await link(100_000) };
}

/** The invoice's total, its links, its allocation events and its audit actions, read with SQL. */
async function stateOf(invoiceId: string) {
  const { rows } = await t().db.$client.query(
    `select i.total_cents as "totalCents",
      coalesce((select json_agg(json_build_object('allocationId', a.id, 'amountCents', a.amount_cents) order by a.amount_cents desc) from allocation a where a.invoice_id = i.id), '[]') as links,
      coalesce((select json_agg(e.action order by e.occurred_at, e.id) from allocation_event e where e.invoice_id = i.id), '[]') as events,
      coalesce((select json_agg(ae.action order by ae.action) from audit_event ae where ae.target_id::text = i.id::text), '[]') as audits
    from invoice i where i.id = $1`,
    [invoiceId]
  );

  return rows[0];
}

const amounts = (...links: [Link, number][]) =>
  links.map(([link, amountCents]) => ({
    allocationId: link.allocationId,
    amountCents,
  }));

const CORRECTED_TOTALS = [
  ["600,000", 600_000],
  ["300,000", 300_000],
] as const;

const REDUCTIONS: readonly {
  readonly name: string;
  readonly reductions: (links: Links) => ReturnType<typeof amounts>;
  /** The links and events after the correction, or null when it is refused. */
  readonly after: ((links: Links) => { links: object[]; event: string }) | null;
}[] = [
  {
    name: "the first link reduced to 150,000 is corrected",
    reductions: ({ first }) => amounts([first, 150_000]),
    after: ({ first, second }) => ({
      links: amounts([first, 150_000], [second, 100_000]),
      event: "changed",
    }),
  },
  {
    name: "the second link reduced to 0 is corrected and removes it",
    reductions: ({ second }) => amounts([second, 0]),
    after: ({ first }) => ({
      links: amounts([first, 200_000]),
      event: "unlinked",
    }),
  },
  {
    name: "the first link reduced to 190,000 only is refused with reductions-insufficient",
    reductions: ({ first }) => amounts([first, 190_000]),
    after: null,
  },
];

describe("receipts and corrections", () => {
  it("a paid receipt of 180,000 saves one invoice, one payment and one link of the full amount", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id: documentId } = await insertDocument(t(), {
      kind: "paid-receipt",
    });

    const result = await api().savePaidReceipt({
      documentId,
      customer: { id: customerId },
      number: "RCPT-1",
      date: "2026-10-12",
      dueDate: null,
      dueDateSource: "unspecified",
      currency: "SGD",
      totalCents: 180_000,
      description: null,
      reference: null,
      method: "card",
      keepPossibleDuplicate: false,
    });

    expect(result).toMatchObject({ outcome: "saved", customerId });
    const { rows } = await t().db.$client.query(
      `select i.id as "invoiceId", p.id as "paymentId", a.amount_cents as "amountCents"
      from invoice i join allocation a on a.invoice_id = i.id join payment p on p.id = a.payment_id
      where i.document_id = $1 and p.document_id = $1`,
      [documentId]
    );
    expect(rows).toEqual([
      {
        invoiceId: expect.any(String),
        paymentId: expect.any(String),
        amountCents: 180_000,
      },
    ]);
    const counts = await t().db.$client.query(
      "select (select count(*)::int from invoice where document_id = $1) as invoices, (select count(*)::int from payment where document_id = $1) as payments",
      [documentId]
    );
    expect(counts.rows[0]).toEqual({ invoices: 1, payments: 1 });
    expect((await stateOf(rows[0].invoiceId)).audits).toContain(
      "invoices:receipt-saved"
    );
  });

  it.each(CORRECTED_TOTALS)(
    "an invoice of 500,000 with links of 300,000 corrected to %s is saved and audited",
    async (_, totalCents) => {
      const { invoiceId, first, second } = await invoiceWithLinks();

      await expect(
        api().correctInvoiceTotal({ id: invoiceId, totalCents, reductions: [] })
      ).resolves.toEqual({ outcome: "corrected" });
      expect(await stateOf(invoiceId)).toEqual({
        totalCents,
        links: amounts([first, 200_000], [second, 100_000]),
        events: [],
        audits: ["invoices:invoice-total-corrected"],
      });
    }
  );

  it("an invoice of 500,000 with links of 300,000 corrected to 250,000 with no reductions answers choose-links and changes nothing", async () => {
    const { invoiceId, first, second } = await invoiceWithLinks();
    const before = await stateOf(invoiceId);

    await expect(
      api().correctInvoiceTotal({
        id: invoiceId,
        totalCents: 250_000,
        reductions: [],
      })
    ).resolves.toEqual({
      outcome: "choose-links",
      excessCents: 50_000,
      allocations: [first, second].toSorted((a, b) =>
        a.allocationId < b.allocationId ? -1 : 1
      ),
    });
    expect(await stateOf(invoiceId)).toEqual(before);
  });

  it.each(REDUCTIONS.map((row) => [row.name, row] as const))(
    "an invoice of 500,000 with links of 300,000 corrected to 250,000: %s",
    async (_, row) => {
      const { invoiceId, ...links } = await invoiceWithLinks();
      const before = await stateOf(invoiceId);
      const correct = api().correctInvoiceTotal({
        id: invoiceId,
        totalCents: 250_000,
        reductions: row.reductions(links),
      });

      if (row.after === null) {
        await expect(correct).rejects.toMatchObject({
          code: "invoices:reductions-insufficient",
        });
        expect(await stateOf(invoiceId)).toEqual(before);

        return;
      }

      const { links: after, event } = row.after(links);

      await expect(correct).resolves.toEqual({ outcome: "corrected" });
      expect(await stateOf(invoiceId)).toEqual({
        totalCents: 250_000,
        links: after,
        events: [event],
        audits: [
          `invoices:allocation-${event}`,
          "invoices:invoice-total-corrected",
        ],
      });
    }
  );

  it.each([
    [
      "naming a link of another invoice",
      async () => (await invoiceWithLinks()).first.allocationId,
      0,
    ],
    [
      "raising the link of 200,000 to 250,000",
      async (own: Links) => own.first.allocationId,
      250_000,
    ],
  ] as const)(
    "a reduction %s is refused with reduction-invalid",
    async (_, allocationOf, amountCents) => {
      const { invoiceId, ...links } = await invoiceWithLinks();
      const allocationId = await allocationOf(links);
      const before = await stateOf(invoiceId);

      await expect(
        api().correctInvoiceTotal({
          id: invoiceId,
          totalCents: 250_000,
          reductions: [{ allocationId, amountCents }],
        })
      ).rejects.toMatchObject({ code: "invoices:reduction-invalid" });
      expect(await stateOf(invoiceId)).toEqual(before);
    }
  );
});
