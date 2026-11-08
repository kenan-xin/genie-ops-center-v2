import {
  callProcedure,
  createTenantContext,
  type DatasetCursor,
  type ModuleRPCContext,
  matchModulePage,
  modulePageAccess,
  type OpenedModulePage,
  openModulePage,
  principalFor,
  registerModuleRuntime,
  seedRoles,
  type TenantContext,
} from "@genie/core";
import {
  assignRole,
  enableModules,
  insertPersonWith,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import {
  invoiceListDefinition,
  paymentListDefinition,
} from "../src/presentation/list-definitions.ts";
import type {
  InvoiceListView,
  InvoiceRecordView,
  PaymentListView,
} from "../src/presentation/views.ts";
import { invoicesRouter } from "../src/router.ts";
import {
  loadInvoiceRecord,
  loadPaymentRecord,
} from "../src/services/pages/records.ts";
import {
  insertAllocation,
  insertCustomer,
  insertDocument,
  insertFieldOrigin,
  insertInvoice,
  insertPayment,
} from "./factories.ts";

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
  await seedRoles(t(), [invoicesModule]);
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

/** A new person holding the seeded role of this name, tenant-wide. */
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

type ListPage<Row> = {
  readonly rows: readonly Row[];
  readonly next: DatasetCursor | null;
};

/** Every row of a list, page after page from each cursor, so the reads run one after another. */
async function walkPages<Row>(
  read: (after: DatasetCursor | null) => Promise<ListPage<Row>>,
  after: DatasetCursor | null = null
): Promise<Row[]> {
  const page = await read(after);

  return page.next === null
    ? [...page.rows]
    : [...page.rows, ...(await walkPages(read, page.next))];
}

type Comparable = string | number | null;

/**
 * The order a sort must answer: the column in its direction, nulls last ascending and first
 * descending as Postgres orders them, then the id ascending in both directions (czjw.48).
 */
function expectedOrder<Row extends { readonly id: string }>(
  rows: readonly Row[],
  value: (row: Row) => Comparable,
  direction: "asc" | "desc"
): string[] {
  const sign = direction === "asc" ? 1 : -1;

  const compare = (left: Comparable, right: Comparable): number => {
    if (left === right) return 0;
    if (left === null) return sign;
    if (right === null) return -sign;

    return (left < right ? -1 : 1) * sign;
  };

  return rows
    .toSorted(
      (left, right) =>
        compare(value(left), value(right)) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    )
    .map(({ id }) => id);
}

describe("invoice pages", () => {
  it("the invoice list procedure pages 50 invoices at a time past 1,000 with its cursor, and refuses a person without invoices:read", async () => {
    const customer = await insertCustomer(t());

    if (customer === undefined) throw new Error("no customer");

    // Four invoices share each date, all before the reporting date, so the record key orders the ties.
    await t().db.$client.query(
      "insert into invoice (customer_id, number, invoice_date, due_date, due_date_source, currency, total_cents) select $1, 'PAGED-' || g, date '2026-01-01' + (g / 4), date '2026-12-31', 'document', 'SGD', 100000 from generate_series(1, 1001) as g",
      [customer.id]
    );

    const { userId } = await insertPersonWith(t(), READER, {
      type: "invoices-customer",
      id: customer.id,
    });

    const reader = callProcedure(invoicesRouter, contextFor(userId));

    const first = await reader.listInvoices({ after: null });

    expect(first.rows).toHaveLength(50);
    expect(first.truncated).toBe(true);
    expect(first.next).not.toBeNull();

    const second = await reader.listInvoices({ after: first.next });

    expect(second.rows).toHaveLength(50);
    expect(second.counts).toBeNull();

    const all = await walkPages((after) => reader.listInvoices({ after }));

    expect(new Set(all.map((row) => row.id)).size).toBe(1001);
    expect(all).toHaveLength(1001);

    const payments = await reader.listPayments({ after: null });

    expect(payments.next).toBeNull();

    const { userId: other } = await insertPersonWith(t(), ["invoices:use"]);

    await expect(
      callProcedure(invoicesRouter, contextFor(other)).listInvoices({
        after: null,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("the invoice list filters by status, customer, invoice date and text on the server", async () => {
    const customer = await insertCustomer(t(), { name: "Filterline Works" });

    const [paid, open, overdue, noDueDate, paidNoDueDate] = await Promise.all([
      insertInvoice(t(), {
        customerId: customer.id,
        number: "FLT-PAID",
        invoiceDate: "2026-08-01",
      }),
      insertInvoice(t(), {
        customerId: customer.id,
        number: "FLT-OPEN",
        invoiceDate: "2026-09-01",
        dueDate: "2026-11-30",
      }),
      insertInvoice(t(), {
        customerId: customer.id,
        number: "FLT-LATE",
        invoiceDate: "2026-09-10",
        dueDate: "2026-10-01",
      }),
      insertInvoice(t(), {
        customerId: customer.id,
        number: "FLT-NONE",
        invoiceDate: "2026-10-01",
        dueDate: null,
      }),
      insertInvoice(t(), {
        customerId: customer.id,
        number: "FLT-NONE-PAID",
        invoiceDate: "2026-10-02",
        dueDate: null,
      }),
    ]);

    const payment = await insertPayment(t(), {
      customerId: customer.id,
      amountCents: 200_000,
    });

    await insertAllocation(t(), {
      invoiceId: paid.id,
      paymentId: payment.id,
      amountCents: 100_000,
    });
    await insertAllocation(t(), {
      invoiceId: paidNoDueDate.id,
      paymentId: payment.id,
      amountCents: 100_000,
    });

    const { userId } = await insertPersonWith(t(), READER);
    const reader = callProcedure(invoicesRouter, contextFor(userId));

    const numbers = async (params: Record<string, string>) =>
      (
        await reader.listInvoices({
          after: null,
          params: { customer: customer.id, ...params },
        })
      ).rows
        .map((row) => row.invoiceNumber)
        .toSorted();

    expect(await numbers({ status: "paid" })).toEqual([
      "FLT-NONE-PAID",
      "FLT-PAID",
    ]);
    expect(await numbers({ status: "open" })).toEqual([open.number]);
    expect(await numbers({ status: "overdue" })).toEqual([overdue.number]);
    expect(await numbers({ status: "no-due-date" })).toEqual([
      noDueDate.number,
    ]);
    expect(await numbers({ q: "flt-none" })).toEqual([
      "FLT-NONE",
      "FLT-NONE-PAID",
    ]);
    expect(await numbers({ date: "2026-09-01..2026-09-30" })).toEqual([
      "FLT-LATE",
      "FLT-OPEN",
    ]);

    // The customer name is searchable too, so a search alone finds this customer's five.
    const byName = await reader.listInvoices({
      after: null,
      params: { q: "filterLINE" },
    });

    expect(byName.rows).toHaveLength(5);
    expect(byName.summary).toEqual([
      {
        currency: "SGD",
        outstandingCents: 300_000,
        overdueCents: 100_000,
        overdueCount: 1,
        invoicedCents: 500_000,
        count: 5,
        unpaidCount: 3,
        paidCount: 2,
      },
    ]);
  });

  it("the invoice list summary covers the whole filter, and the next page keeps the filter", async () => {
    const customer = await insertCustomer(t());

    await t().db.$client.query(
      "insert into invoice (customer_id, number, invoice_date, due_date, due_date_source, currency, total_cents) select $1, 'LATE-' || g, date '2026-01-01' + (g / 4), date '2026-10-01', 'document', 'SGD', 100 from generate_series(1, 1001) as g",
      [customer.id]
    );
    await insertInvoice(t(), {
      customerId: customer.id,
      dueDate: "2026-12-31",
    });

    const { userId } = await insertPersonWith(t(), READER);
    const reader = callProcedure(invoicesRouter, contextFor(userId));
    const params = { customer: customer.id, status: "overdue" } as const;

    const first = await reader.listInvoices({ after: null, params });

    expect(first.rows).toHaveLength(50);
    expect(first.summary).toEqual([
      {
        currency: "SGD",
        outstandingCents: 100_100,
        overdueCents: 100_100,
        overdueCount: 1001,
        invoicedCents: 100_100,
        count: 1001,
        unpaidCount: 1001,
        paidCount: 0,
      },
    ]);

    const second = await reader.listInvoices({ after: first.next, params });

    expect(new Set(second.rows.map((row) => row.status.kind))).toEqual(
      new Set(["overdue"])
    );
  });

  it("the payment list filters by link, customer, payment date and text on the server", async () => {
    const customer = await insertCustomer(t(), { name: "Paylane Supplies" });
    const invoice = await insertInvoice(t(), {
      customerId: customer.id,
      totalCents: 1_000_000,
    });

    const [linked, part, none] = await Promise.all([
      insertPayment(t(), {
        customerId: customer.id,
        reference: "PFL-LINKED",
        paymentDate: "2026-08-01",
        amountCents: 100_000,
      }),
      insertPayment(t(), {
        customerId: customer.id,
        reference: "PFL-PART",
        paymentDate: "2026-09-01",
        amountCents: 100_000,
      }),
      insertPayment(t(), {
        customerId: customer.id,
        reference: "PFL-NONE",
        paymentDate: "2026-10-01",
        amountCents: 100_000,
      }),
    ]);

    await insertAllocation(t(), {
      invoiceId: invoice.id,
      paymentId: linked.id,
      amountCents: 100_000,
    });
    await insertAllocation(t(), {
      invoiceId: invoice.id,
      paymentId: part.id,
      amountCents: 40_000,
    });

    const { userId } = await insertPersonWith(t(), READER);
    const reader = callProcedure(invoicesRouter, contextFor(userId));

    const references = async (params: Record<string, string>) =>
      (
        await reader.listPayments({
          after: null,
          params: { customer: customer.id, ...params },
        })
      ).rows
        .map((row) => row.reference)
        .toSorted();

    expect(await references({ status: "linked" })).toEqual([linked.reference]);
    expect(await references({ status: "not-linked" })).toEqual([
      none.reference,
      part.reference,
    ]);
    expect(await references({ q: "pfl-part" })).toEqual([part.reference]);
    expect(await references({ date: "2026-08-15..2026-09-30" })).toEqual([
      part.reference,
    ]);

    // The customer name is searchable too, so a search alone finds this customer's three.
    const byName = await reader.listPayments({
      after: null,
      params: { q: "payLANE" },
    });

    expect(byName.rows.map((row) => row.reference).toSorted()).toEqual([
      "PFL-LINKED",
      "PFL-NONE",
      "PFL-PART",
    ]);
  });

  it("the payment list summary keeps each currency apart and covers only what the filters keep", async () => {
    const customer = await insertCustomer(t());
    const invoice = await insertInvoice(t(), {
      customerId: customer.id,
      totalCents: 1_000_000,
    });

    const [linked, part] = await Promise.all([
      insertPayment(t(), { customerId: customer.id, amountCents: 100_000 }),
      insertPayment(t(), { customerId: customer.id, amountCents: 100_000 }),
      insertPayment(t(), {
        customerId: customer.id,
        currency: "USD",
        amountCents: 50_000,
      }),
    ]);

    await insertAllocation(t(), {
      invoiceId: invoice.id,
      paymentId: linked.id,
      amountCents: 100_000,
    });
    await insertAllocation(t(), {
      invoiceId: invoice.id,
      paymentId: part.id,
      amountCents: 40_000,
    });

    const { userId } = await insertPersonWith(t(), READER);
    const reader = callProcedure(invoicesRouter, contextFor(userId));

    const summary = async (status: "all" | "not-linked" = "all") =>
      (
        await reader.listPayments({
          after: null,
          params: { customer: customer.id, status },
        })
      ).summary;

    const usd = {
      currency: "USD",
      collectedCents: 50_000,
      allocatedCents: 0,
      unallocatedCents: 50_000,
      count: 1,
      allocatedCount: 0,
      notLinkedCount: 1,
    };

    expect(await summary()).toEqual([
      {
        currency: "SGD",
        collectedCents: 200_000,
        allocatedCents: 140_000,
        unallocatedCents: 60_000,
        count: 2,
        allocatedCount: 2,
        notLinkedCount: 1,
      },
      usd,
    ]);
    expect(await summary("not-linked")).toEqual([
      {
        currency: "SGD",
        collectedCents: 100_000,
        allocatedCents: 40_000,
        unallocatedCents: 60_000,
        count: 1,
        allocatedCount: 1,
        notLinkedCount: 1,
      },
      usd,
    ]);
  });

  it.each(
    invoiceListDefinition.sorts.flatMap(({ column }) =>
      (["asc", "desc"] as const).map((direction) => ({ column, direction }))
    )
  )(
    "the invoice list walks every row once under $column $direction, ties by id",
    async ({ column, direction }) => {
      const customers = await Promise.all(
        ["Alpha", "Beta", "Gamma"].map((name) =>
          insertCustomer(t(), { name: `Srtx ${name} ${column} ${direction}` })
        )
      );
      const tag = `SRTX${column}${direction}`.toUpperCase();

      // 12 rows share one updated_at microsecond, 8 one total, 20 one invoice date, 6 no due date.
      await t().db.$client.query(
        `insert into invoice (customer_id, number, invoice_date, due_date, due_date_source, currency, total_cents, updated_at)
         select ($1::uuid[])[1 + g % 3], $2 || '-' || lpad(g::text, 3, '0'),
           case when g <= 20 then date '2026-05-01' else date '2026-05-01' + g end,
           case when g % 9 = 0 then null else date '2026-06-01' + (g % 7) end,
           case when g % 9 = 0 then 'unspecified' else 'document' end,
           'SGD',
           case when g <= 8 then 5000 else 1000 * g end,
           case when g % 4 = 0 and g <= 48 then timestamptz '2026-10-20 08:00:00.123456+00'
             else timestamptz '2026-10-20 08:00:00+00' + g * interval '1 second' + g * interval '7 microseconds' end
         from generate_series(1, 55) as g`,
        [customers.map(({ id }) => id), tag]
      );

      const { userId } = await insertPersonWith(t(), READER);
      const reader = callProcedure(invoicesRouter, contextFor(userId));
      const sort = `${column}.${direction}` as const;

      const walked = await walkPages((after) =>
        reader.listInvoices({ after, params: { q: tag, sort } })
      );

      const field = invoiceListDefinition.sorts.find(
        (entry) => entry.column === column
      )?.field;

      if (field === undefined) throw new Error(`no field for ${column}`);

      expect(walked).toHaveLength(55);
      expect(walked.map(({ id }) => id)).toEqual(
        expectedOrder(walked, (row) => row[field], direction)
      );
    }
  );

  it("the invoice list shows the invoice saved last first when no sort is set", async () => {
    const customer = await insertCustomer(t(), { name: "Newline Traders" });

    await t().db.$client.query(
      "insert into invoice (customer_id, number, invoice_date, due_date, due_date_source, currency, total_cents, updated_at) select $1, 'NEWL-' || g, date '2026-10-01' - g, date '2026-12-31', 'document', 'SGD', 100, timestamptz '2026-10-01 00:00:00+00' + g * interval '1 hour' from generate_series(1, 3) as g",
      [customer.id]
    );

    const latest = await insertInvoice(t(), {
      customerId: customer.id,
      number: "NEWL-SAVED",
      invoiceDate: "2026-01-01",
    });

    const { userId } = await insertPersonWith(t(), READER);
    const reader = callProcedure(invoicesRouter, contextFor(userId));

    const { rows } = await reader.listInvoices({
      after: null,
      params: { customer: customer.id },
    });

    expect(rows.map(({ invoiceNumber }) => invoiceNumber)).toEqual([
      latest.number,
      "NEWL-3",
      "NEWL-2",
      "NEWL-1",
    ]);
  });

  it.each(
    paymentListDefinition.sorts.flatMap(({ column }) =>
      (["asc", "desc"] as const).map((direction) => ({ column, direction }))
    )
  )(
    "the payment list walks every row once under $column $direction, ties by id",
    async ({ column, direction }) => {
      const customers = await Promise.all(
        ["Alpha", "Beta", "Gamma"].map((name) =>
          insertCustomer(t(), { name: `Prtx ${name} ${column} ${direction}` })
        )
      );
      const tag = `PRTX${column}${direction}`.toUpperCase();

      // 12 rows share one updated_at microsecond, 8 one amount, 20 one date, 9 no method.
      await t().db.$client.query(
        `insert into payment (customer_id, reference, payment_date, method, currency, amount_cents, updated_at)
         select ($1::uuid[])[1 + g % 3], $2 || '-' || lpad(g::text, 3, '0'),
           case when g <= 20 then date '2026-05-01' else date '2026-05-01' + g end,
           case when g % 6 = 0 then null when g % 2 = 0 then 'BANK' else 'CARD' end,
           'SGD',
           case when g <= 8 then 5000 else 1000 * g end,
           case when g % 4 = 0 and g <= 48 then timestamptz '2026-10-20 08:00:00.123456+00'
             else timestamptz '2026-10-20 08:00:00+00' + g * interval '1 second' + g * interval '7 microseconds' end
         from generate_series(1, 55) as g`,
        [customers.map(({ id }) => id), tag]
      );

      const { userId } = await insertPersonWith(t(), READER);
      const reader = callProcedure(invoicesRouter, contextFor(userId));
      const sort = `${column}.${direction}` as const;

      const walked = await walkPages((after) =>
        reader.listPayments({ after, params: { q: tag, sort } })
      );

      const field = paymentListDefinition.sorts.find(
        (entry) => entry.column === column
      )?.field;

      if (field === undefined) throw new Error(`no field for ${column}`);

      expect(walked).toHaveLength(55);
      expect(walked.map(({ id }) => id)).toEqual(
        expectedOrder(walked, (row) => row[field], direction)
      );
    }
  );

  it("each invoice tab lists only its statuses, and the counts do not follow the tab", async () => {
    const customer = await insertCustomer(t(), { name: "Tabline Works" });

    const [paid, , , , paidNoDueDate] = await Promise.all([
      insertInvoice(t(), { customerId: customer.id }),
      insertInvoice(t(), { customerId: customer.id, dueDate: "2026-11-30" }),
      insertInvoice(t(), { customerId: customer.id, dueDate: "2026-10-01" }),
      insertInvoice(t(), { customerId: customer.id, dueDate: null }),
      insertInvoice(t(), { customerId: customer.id, dueDate: null }),
    ]);
    const payment = await insertPayment(t(), {
      customerId: customer.id,
      amountCents: 200_000,
    });

    await insertAllocation(t(), {
      invoiceId: paid.id,
      paymentId: payment.id,
      amountCents: 100_000,
    });
    await insertAllocation(t(), {
      invoiceId: paidNoDueDate.id,
      paymentId: payment.id,
      amountCents: 100_000,
    });

    const { userId } = await insertPersonWith(t(), READER);
    const reader = callProcedure(invoicesRouter, contextFor(userId));

    const tabs = await Promise.all(
      invoiceListDefinition.tabs.items.map(async ({ value, statuses }) => {
        const page = await reader.listInvoices({
          after: null,
          params: { customer: customer.id, status: value },
        });
        const kinds: readonly string[] = statuses;

        return {
          value,
          counts: page.counts,
          rows: page.rows.length,
          outside: page.rows.filter(
            (row) => kinds.length > 0 && !kinds.includes(row.status.kind)
          ),
        };
      })
    );

    const counts = {
      "all": 5,
      "open": 1,
      "overdue": 1,
      "paid": 2,
      "no-due-date": 1,
    };

    expect(tabs).toEqual(
      tabs.map(({ value }) => ({
        value,
        counts,
        rows: counts[value],
        outside: [],
      }))
    );
  });

  it("each payment tab lists only its statuses, and the counts do not follow the tab", async () => {
    const customer = await insertCustomer(t(), { name: "Tabpay Supplies" });
    const invoice = await insertInvoice(t(), {
      customerId: customer.id,
      totalCents: 1_000_000,
    });
    const [linked, part] = await Promise.all([
      insertPayment(t(), { customerId: customer.id, amountCents: 100_000 }),
      insertPayment(t(), { customerId: customer.id, amountCents: 100_000 }),
      insertPayment(t(), { customerId: customer.id, amountCents: 100_000 }),
    ]);

    await insertAllocation(t(), {
      invoiceId: invoice.id,
      paymentId: linked.id,
      amountCents: 100_000,
    });
    await insertAllocation(t(), {
      invoiceId: invoice.id,
      paymentId: part.id,
      amountCents: 40_000,
    });

    const { userId } = await insertPersonWith(t(), READER);
    const reader = callProcedure(invoicesRouter, contextFor(userId));

    const tabs = await Promise.all(
      paymentListDefinition.tabs.items.map(async ({ value, statuses }) => {
        const page = await reader.listPayments({
          after: null,
          params: { customer: customer.id, status: value },
        });
        const kinds: readonly string[] = statuses;

        return {
          value,
          counts: page.counts,
          rows: page.rows.length,
          outside: page.rows.filter(
            (row) => kinds.length > 0 && !kinds.includes(row.status)
          ),
        };
      })
    );

    const counts = { "all": 3, "linked": 1, "not-linked": 2 };

    expect(tabs).toEqual(
      tabs.map(({ value }) => ({
        value,
        counts,
        rows: counts[value],
        outside: [],
      }))
    );
  });

  it("the list procedures refuse a sort outside their list", async () => {
    const { userId } = await insertPersonWith(t(), READER);
    const reader = callProcedure(invoicesRouter, contextFor(userId));

    await expect(
      reader.listInvoices({
        after: null,
        // SAFETY: deliberately outside the enum; the procedure must refuse it at the boundary.
        params: { sort: "outstanding.desc" as "total.desc" },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("the lists answer only the customer a scoped reader may read", async () => {
    const [a, b] = await Promise.all([
      insertCustomer(t()),
      insertCustomer(t()),
    ]);

    if (a === undefined || b === undefined) throw new Error("no customers");

    const [visible, payment] = await Promise.all([
      insertInvoice(t(), { customerId: a.id, number: "INV-A" }),
      insertPayment(t(), { customerId: a.id }),
    ]);

    await Promise.all([
      insertInvoice(t(), { customerId: b.id, number: "INV-B" }),
      insertPayment(t(), { customerId: b.id }),
    ]);

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

    const payments = await openPage(userId, ["m", "invoices", "payments"]);

    if (payments.kind !== "open") {
      throw new Error(`the payments page answered ${payments.kind}`);
    }

    // SAFETY: core renders the list page with `data` set to the loader's PaymentListView.
    const paymentData = (
      payments.element.props as { readonly data: PaymentListView }
    ).data;

    expect(paymentData.rows.map((row) => row.id)).toEqual([payment.id]);
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

  it("the history shows only the links of invoices the reader may read, as the allocations do", async () => {
    const { id: customerId } = await insertCustomer(t());
    const [invoice, payment] = await Promise.all([
      insertInvoice(t(), { customerId }),
      insertPayment(t(), { customerId }),
    ]);
    const { userId: financeId } = await insertPersonWith(t(), [
      ...READER,
      "invoices:write",
    ]);
    await callProcedure(invoicesRouter, contextFor(financeId)).linkPayment({
      invoiceId: invoice.id,
      paymentId: payment.id,
      amountCents: 1000,
    });
    const [onPayment, onInvoice] = await Promise.all([
      insertPersonWith(t(), [...READER], {
        type: "invoices-payment",
        id: payment.id,
      }),
      insertPersonWith(t(), [...READER], {
        type: "invoices-invoice",
        id: invoice.id,
      }),
    ]);

    const paymentView = await loadPaymentRecord(
      contextFor(onPayment.userId),
      payment.id
    );
    const invoiceView = await openRecord(onInvoice.userId, invoice.id);

    if (paymentView.kind !== "shown" || invoiceView.kind !== "shown") {
      throw new Error("a record answered the reporting-date note");
    }
    expect(paymentView.allocations).toEqual([]);
    expect(paymentView.history).toEqual([]);
    expect(invoiceView.history.map((row) => row.invoiceId)).toEqual([
      invoice.id,
    ]);
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

  it("the record procedures answer canWrite for the Invoices and Payments editor only, and refuse a person with only invoices:use", async () => {
    const { id: customerId } = await insertCustomer(t());
    const [invoice, payment] = await Promise.all([
      insertInvoice(t(), { customerId }),
      insertPayment(t(), { customerId }),
    ]);
    const [finance, viewer, user] = await Promise.all([
      personWithSeededRole("Invoices and Payments editor"),
      personWithSeededRole("Invoices and Payments viewer"),
      insertPersonWith(t(), ["invoices:use"]),
    ]);

    const answers = await Promise.all(
      [finance, viewer].flatMap((userId) => {
        const api = callProcedure(invoicesRouter, contextFor(userId));

        return [
          api.getInvoiceRecord({ id: invoice.id }),
          api.getPaymentRecord({ id: payment.id }),
        ];
      })
    );

    expect(answers).toMatchObject([
      { kind: "shown", canWrite: true },
      { kind: "shown", canWrite: true, payment: { customerId } },
      { kind: "shown", canWrite: false },
      { kind: "shown", canWrite: false, payment: { customerId } },
    ]);

    const refused = callProcedure(invoicesRouter, contextFor(user.userId));

    await expect(
      refused.getInvoiceRecord({ id: invoice.id })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      refused.getPaymentRecord({ id: payment.id })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("the record answers where each field of its own document was read, and none for a record entered by hand", async () => {
    const { id: customerId } = await insertCustomer(t());
    const [read, other] = await Promise.all([
      insertDocument(t(), { kind: "invoice" }),
      insertDocument(t(), { kind: "invoice" }),
    ]);
    const [invoice, , payment] = await Promise.all([
      insertInvoice(t(), { customerId, documentId: read.id }),
      insertInvoice(t(), { customerId, documentId: other.id }),
      insertPayment(t(), { customerId, documentId: null }),
    ]);
    await Promise.all([
      insertFieldOrigin(t(), {
        documentId: read.id,
        field: "customer",
        quote: "Bill to: Harbor Foods",
      }),
      insertFieldOrigin(t(), {
        documentId: read.id,
        field: "amount",
        origin: "corrected",
        quote: "TOTAL (SGD) 7,200.00",
      }),
      insertFieldOrigin(t(), {
        documentId: read.id,
        field: "description",
        origin: "entered",
        quote: null,
        page: null,
      }),
      insertFieldOrigin(t(), {
        documentId: other.id,
        field: "number",
        quote: "Invoice number INV-OTHER",
      }),
    ]);
    const { userId } = await insertPersonWith(t(), [...READER]);
    const api = callProcedure(invoicesRouter, contextFor(userId));
    const [invoiceView, paymentView] = await Promise.all([
      api.getInvoiceRecord({ id: invoice.id }),
      api.getPaymentRecord({ id: payment.id }),
    ]);

    if (invoiceView.kind !== "shown" || paymentView.kind !== "shown") {
      throw new Error("a record answered the reporting-date note");
    }
    expect(invoiceView.fields).toEqual([
      {
        field: "amount",
        origin: "corrected",
        quote: "TOTAL (SGD) 7,200.00",
        page: 1,
      },
      {
        field: "customer",
        origin: "extracted",
        quote: "Bill to: Harbor Foods",
        page: 1,
      },
      { field: "description", origin: "entered", quote: null, page: null },
    ]);
    expect(paymentView.fields).toEqual([]);
  });
});
