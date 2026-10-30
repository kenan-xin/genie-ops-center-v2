import { randomUUID } from "node:crypto";

import {
  callProcedure,
  principalFor,
  seedRoles,
  type ModuleRequestContext,
} from "@genie/core";
import {
  assignRole,
  enableModules,
  insertPersonWith,
  insertUser,
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
 * Who may write, through the seeded roles and real grants (R-39, decision 13). Every principal is
 * built by the real loader with the module's record types, so a scoped grant reaches an invoice
 * or a payment only through the parent customer its resolver answers.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let viewerUserId: string;

let financeUserId: string;

const t = () => deployment.context;

async function personWithSeededRole(name: string): Promise<string> {
  const { rows } = await t().db.$client.query<{ id: string }>(
    "select id from role where name = $1",
    [name]
  );
  const roleId = rows[0]?.id;

  if (roleId === undefined) throw new Error(`no seeded role ${name}`);

  const userId = await insertUser(t());

  await assignRole(t(), { roleId, principal: { type: "user", id: userId } });

  return userId;
}

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  await enableModules(deployment.context, ["invoices"]);
  await seedRoles(deployment.context, [invoicesModule]);
  viewerUserId = await personWithSeededRole("Viewer");
  financeUserId = await personWithSeededRole("Finance");
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

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

type Caller = ReturnType<typeof as>;

async function aPair(customerId?: string) {
  const id = customerId ?? (await insertCustomer(t())).id;

  return {
    invoiceId: (await insertInvoice(t(), { customerId: id })).id,
    paymentId: (await insertPayment(t(), { customerId: id })).id,
  };
}

async function aLink(): Promise<string> {
  return (
    await insertAllocation(t(), { ...(await aPair()), amountCents: 1000 })
  ).id;
}

/** Everything a write of this module changes, read with SQL. */
async function ledgerState() {
  const { rows } = await t().db.$client.query(
    "select (select json_agg(json_build_array(id, amount_cents, automatic) order by id) from allocation) as allocations, (select count(*)::int from allocation_event) as events, (select count(*)::int from audit_event) as audits, (select count(*)::int from invoice) as invoices, (select count(*)::int from payment) as payments, (select count(*)::int from customer) as customers, (select count(*)::int from document) as documents, (select json_agg(json_build_array(id, reading_status, reading_attempts) order by id) from document) as readings, (select count(*)::int from file) as files"
  );

  return rows[0];
}

/** A PDF of its own bytes, so each upload stores a new document. */
const aPdf = () =>
  new File([`%PDF-1.7 ${randomUUID()}`], "upload.pdf", {
    type: "application/pdf",
  });

/** Each write procedure, with a fresh record to write. Later tasks add their writes here. */
const WRITES: readonly {
  readonly name: string;
  readonly call: () => Promise<(caller: Caller) => Promise<object>>;
}[] = [
  {
    name: "linkPayment",
    call: async () => {
      const pair = await aPair();

      return (caller) => caller.linkPayment({ ...pair, amountCents: 1000 });
    },
  },
  {
    name: "changeAllocation",
    call: async () => {
      const id = await aLink();

      return (caller) => caller.changeAllocation({ id, amountCents: 2000 });
    },
  },
  {
    name: "unlinkAllocation",
    call: async () => {
      const id = await aLink();

      return (caller) => caller.unlinkAllocation({ id });
    },
  },
  {
    name: "saveInvoice",
    call: async () => {
      const { id } = await insertCustomer(t());

      return (caller) => caller.saveInvoice(anInvoice(id));
    },
  },
  {
    name: "savePayment",
    call: async () => {
      const { id } = await insertCustomer(t());

      return (caller) => caller.savePayment(aPayment(id));
    },
  },
  {
    name: "savePaidReceipt",
    call: async () => {
      const { id } = await insertCustomer(t());
      return (caller) =>
        caller.savePaidReceipt({
          documentId: null,
          customer: { id },
          number: `RCPT-${randomUUID()}`,
          date: "2026-10-01",
          dueDate: null,
          dueDateSource: "unspecified",
          currency: "SGD",
          totalCents: 1000,
          description: null,
          reference: null,
          method: null,
          keepPossibleDuplicate: false,
        });
    },
  },
  {
    name: "uploadDocument",
    call: async () => {
      const file = aPdf();

      return (caller) => caller.uploadDocument({ file });
    },
  },
  {
    name: "retryReading",
    call: async () => {
      const { id } = await insertDocument(t(), {
        readingStatus: "could-not-read",
        readingAttempts: 3,
      });

      return (caller) => caller.retryReading({ id });
    },
  },
  {
    name: "correctInvoiceTotal",
    call: async () => {
      const { invoiceId } = await aPair();

      return (caller) =>
        caller.correctInvoiceTotal({
          id: invoiceId,
          totalCents: 2000,
          reductions: [],
        });
    },
  },
];

function aPayment(customerId: string) {
  return {
    documentId: null,
    customer: { id: customerId },
    paymentDate: "2026-10-10",
    currency: "SGD",
    amountCents: 1000,
    reference: null,
    method: null,
    namedInvoiceNumbers: [],
    allocations: [],
    keepPossibleDuplicate: false,
  };
}

function anInvoice(customerId: string) {
  return {
    documentId: null,
    customer: { id: customerId },
    number: `INV-${randomUUID()}`,
    invoiceDate: "2026-10-01",
    dueDate: null,
    dueDateSource: "unspecified" as const,
    paymentTerms: null,
    currency: "SGD",
    totalCents: 1000,
    description: null,
    keepPossibleDuplicate: false,
  };
}

describe("invoices write access", () => {
  it.each(WRITES)(
    "the seeded Viewer is refused $name and changes nothing, and Finance is allowed",
    async ({ call }) => {
      const write = await call();
      const before = await ledgerState();

      await expect(write(as(viewerUserId))).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(await ledgerState()).toEqual(before);

      await expect(write(as(financeUserId))).resolves.toBeDefined();
    }
  );

  it("a writer scoped to one customer links its records and is refused on another customer's", async () => {
    const a = await insertCustomer(t());
    const b = await insertCustomer(t());
    const { userId } = await insertPersonWith(t(), ["invoices:write"], {
      type: "invoices-customer",
      id: a.id,
    });

    await expect(
      as(userId).linkPayment({ ...(await aPair(a.id)), amountCents: 100 })
    ).resolves.toMatchObject({ allocationId: expect.any(String) });

    const pairOfB = await aPair(b.id);

    await expect(
      as(userId).linkPayment({ ...pairOfB, amountCents: 100 })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a writer scoped to one customer is refused uploadDocument", async () => {
    const { id } = await insertCustomer(t());
    const { userId } = await insertPersonWith(t(), ["invoices:write"], {
      type: "invoices-customer",
      id,
    });
    const before = await ledgerState();

    await expect(
      as(userId).uploadDocument({ file: aPdf() })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await ledgerState()).toEqual(before);
  });

  it("a writer scoped to one customer saves its invoices and is refused another customer's", async () => {
    const a = await insertCustomer(t());
    const b = await insertCustomer(t());
    const { userId } = await insertPersonWith(t(), ["invoices:write"], {
      type: "invoices-customer",
      id: a.id,
    });

    await expect(
      as(userId).saveInvoice(anInvoice(a.id))
    ).resolves.toMatchObject({ outcome: "saved" });
    await expect(as(userId).saveInvoice(anInvoice(b.id))).rejects.toMatchObject(
      { code: "forbidden" }
    );
  });

  it("a writer scoped to one customer saves its payments and is refused another customer's", async () => {
    const a = await insertCustomer(t());
    const b = await insertCustomer(t());
    const { userId } = await insertPersonWith(t(), ["invoices:write"], {
      type: "invoices-customer",
      id: a.id,
    });

    await expect(as(userId).savePayment(aPayment(a.id))).resolves.toMatchObject(
      { outcome: "saved" }
    );
    await expect(as(userId).savePayment(aPayment(b.id))).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(
      (
        await t().db.$client.query(
          "select 1 from payment where customer_id = $1",
          [b.id]
        )
      ).rowCount
    ).toBe(0);
  });
});
