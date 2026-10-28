import {
  createTenantContext,
  type DatasetSeries,
  listDatasets,
  principalFor,
  queryDataset,
  queryDatasetSeries,
  recordRoute,
  registerModuleRuntime,
  type ModuleRequestContext,
  type TenantContext,
} from "@genie/core";
import {
  assignRole,
  databaseClient,
  enableModules,
  insertPersonWith,
  insertRole,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordsDataset } from "../src/datasets.ts";
import { placeholderModule } from "../src/module.ts";
import { insertPlaceholderRecord } from "./factories.ts";

/**
 * The dataset seam of Spec 7 AC-2 and AC-3 on the placeholder's `placeholder.records`, against a
 * real Postgres with the real histories applied. Each case writes its own rows under its own
 * label and filters on that label, so the cases share one deployment without reading each other.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, [placeholderModule]);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

function contextFor(
  userId: string,
  tenant: TenantContext = deployment.context
): ModuleRequestContext {
  return {
    tenant,
    caller: principalFor({
      tenant,
      modules: [placeholderModule],
      userId,
      authenticated: true,
    }),
  };
}

async function person(permission: string): Promise<string> {
  return (await insertPersonWith(deployment.context, [permission])).userId;
}

/** A context of its own, so a changed setting or entitlement is read past the 10 s cache (DEC-46). */
function freshTenant(): TenantContext {
  const tenant = createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    { error: () => {}, info: () => {}, debug: () => {} },
    ["placeholder"]
  );

  registerModuleRuntime(tenant, [placeholderModule]);

  return tenant;
}

type RecordValues = Parameters<typeof insertPlaceholderRecord>[1];

/** Writes rows under one label, each recorded on 2026-01-01 unless it names its own day. */
async function insertRows(
  label: string,
  rows: readonly NonNullable<RecordValues>[]
): Promise<void> {
  await Promise.all(
    rows.map((row) =>
      insertPlaceholderRecord(deployment.context, {
        recordedOn: "2026-01-01",
        ...row,
        label,
      })
    )
  );
}

const labelled = (label: string) =>
  [{ field: "label", op: "eq", value: label }] as const;

const RECORDS = "placeholder.records";

const countByMonth = (name: string, label: string): DatasetSeries => ({
  name,
  dataset: RECORDS,
  query: {
    filters: labelled(label),
    groupBy: [{ field: "recordedOn", bucket: "month" }],
    aggregates: [{ fn: "count", as: "n" }],
  },
});

describe("the placeholder dataset through queryDataset", () => {
  it("lists the placeholder dataset only to a person who holds placeholder:read", async () => {
    const listed = await listDatasets(
      contextFor(await person("placeholder:read"))
    );

    const records = listed.find((entry) => entry.name === RECORDS);

    expect(records?.fields).toEqual(recordsDataset.fields);
    expect(records).not.toHaveProperty("source");

    expect(
      await listDatasets(contextFor(await person("placeholder:use")))
    ).toEqual([]);
  });

  it("sums amounts per currency", async () => {
    const label = "sum-per-currency";

    await insertRows(label, [
      { amountCents: 1000, currency: "EUR" },
      { amountCents: 500, currency: "EUR" },
      { amountCents: 700, currency: "USD" },
    ]);

    const result = await queryDataset(
      contextFor(await person("placeholder:read")),
      {
        dataset: RECORDS,
        query: {
          filters: labelled(label),
          groupBy: [{ field: "currency" }],
          aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
        },
      }
    );

    expect(result.rows).toEqual([
      { currency: "EUR", total: 1500 },
      { currency: "USD", total: 700 },
    ]);
    expect(result.columns).toEqual([
      { name: "currency", type: "text" },
      { name: "total", type: "money" },
    ]);
  });

  it("counts quantities in labelled ranges in range order, leaving out nulls and values outside every range", async () => {
    const label = "quantity-ranges";

    await insertRows(label, [
      { quantity: 1 },
      { quantity: 5 },
      { quantity: 10 },
      { quantity: 15 },
      { quantity: 25 },
      {},
    ]);

    const result = await queryDataset(
      contextFor(await person("placeholder:read")),
      {
        dataset: RECORDS,
        query: {
          filters: labelled(label),
          // Listed out of label order, so a label sort would answer another order.
          groupBy: [
            {
              field: "quantity",
              ranges: [
                { label: "under 2.5", max: 2.5 },
                { label: "2.5 to 10", min: 2.5, max: 10 },
                { label: "10 to 20", min: 10, max: 20 },
              ],
            },
          ],
          aggregates: [{ fn: "count", as: "n" }],
        },
      }
    );

    expect(result.rows).toEqual([
      { quantity: "under 2.5", n: 1 },
      { quantity: "2.5 to 10", n: 1 },
      { quantity: "10 to 20", n: 2 },
    ]);
    expect(result.columns[0]).toEqual({
      name: "quantity",
      type: "text",
      bucket: "ranges",
    });
  });

  it("groups a date by week from Monday and answers ISO dates", async () => {
    const label = "week-buckets";

    await insertRows(label, [
      { recordedOn: "2026-01-05" },
      { recordedOn: "2026-01-11" },
      { recordedOn: "2026-01-12" },
    ]);

    const result = await queryDataset(
      contextFor(await person("placeholder:read")),
      {
        dataset: RECORDS,
        query: {
          filters: labelled(label),
          groupBy: [{ field: "recordedOn", bucket: "week" }],
          aggregates: [{ fn: "count", as: "n" }],
        },
      }
    );

    expect(result.rows).toEqual([
      { recordedOn: "2026-01-05", n: 2 },
      { recordedOn: "2026-01-12", n: 1 },
    ]);
  });

  it("filters by record id against the uuid column", async () => {
    const label = "id-filter";

    const [first, second] = await Promise.all(
      [1, 2, 3].map(() =>
        insertPlaceholderRecord(deployment.context, {
          label,
          recordedOn: "2026-01-01",
        })
      )
    );

    const ids = [first?.id ?? "", second?.id ?? ""];

    const result = await queryDataset(
      contextFor(await person("placeholder:read")),
      {
        dataset: RECORDS,
        query: {
          select: ["id"],
          filters: [{ field: "id", op: "in", values: ids }],
        },
      }
    );

    expect(result.rows.map((row) => row.id).toSorted()).toEqual(ids.toSorted());
  });

  it("refuses a person without placeholder:read, and answers a record-scoped reader only that record", async () => {
    const label = "scoped-reader";

    const named = await insertPlaceholderRecord(deployment.context, {
      label,
      recordedOn: "2026-01-01",
    });

    await insertPlaceholderRecord(deployment.context, {
      label,
      recordedOn: "2026-01-01",
    });

    const query = { select: ["id"], filters: labelled(label) };

    await expect(
      queryDataset(contextFor(await person("placeholder:use")), {
        dataset: RECORDS,
        query,
      })
    ).rejects.toMatchObject({ code: "forbidden" });

    const { userId } = await insertPersonWith(
      deployment.context,
      ["placeholder:read"],
      { type: "placeholder-record", id: named.id }
    );

    const result = await queryDataset(contextFor(userId), {
      dataset: RECORDS,
      query,
    });

    expect(result.rows).toEqual([{ id: named.id }]);
  });

  it("refuses an unknown field with dataset-query-invalid naming select.0", async () => {
    await expect(
      queryDataset(contextFor(await person("placeholder:read")), {
        dataset: RECORDS,
        query: { select: ["nope"] },
      })
    ).rejects.toMatchObject({
      code: "dataset-query-invalid",
      issues: [expect.objectContaining({ path: "select.0" })],
    });
  });

  it("returns at most 1,000 rows and says it was truncated", async () => {
    const label = "row-cap";

    await deployment.context.db.$client.query(
      "insert into placeholder_record (label, recorded_on) select $1, date '2026-01-01' from generate_series(1, 1001)",
      [label]
    );

    const result = await queryDataset(
      contextFor(await person("placeholder:read")),
      {
        dataset: RECORDS,
        query: { select: ["id"], filters: labelled(label) },
      }
    );

    expect(result.rows).toHaveLength(1000);
    expect(result.truncated).toBe(true);
  });

  it("stops a query after 5 seconds", async () => {
    const holder = databaseClient(deployment.context.env.databaseUrl);

    await holder.connect();

    let release: NodeJS.Timeout | undefined;

    try {
      await holder.query("begin");
      await holder.query(
        "lock table placeholder_record in access exclusive mode"
      );
      release = setTimeout(() => void holder.query("rollback"), 8000);

      const reader = contextFor(await person("placeholder:read"));
      const started = performance.now();

      await expect(
        queryDataset(reader, {
          dataset: RECORDS,
          query: { select: ["id"], filters: labelled("timeout") },
        })
      ).rejects.toMatchObject({ code: "dataset-timeout" });

      const elapsed = performance.now() - started;

      expect(elapsed).toBeGreaterThanOrEqual(4500);
      expect(elapsed).toBeLessThan(8000);
    } finally {
      clearTimeout(release);
      await holder.query("rollback");
      await holder.end();
    }
  });

  it("totals money per currency: none, one, two", async () => {
    const reader = contextFor(await person("placeholder:read"));

    const sum = [{ fn: "sum", field: "amountCents", as: "total" }] as const;

    const total = (label: string) =>
      queryDataset(reader, {
        dataset: RECORDS,
        query: { filters: labelled(label), aggregates: sum },
      });

    const none = await total("money-none");

    expect(none.rows).toEqual([{ total: null }]);
    expect(none.columns).toEqual([{ name: "total", type: "money" }]);

    await insertRows("money-one", [
      { amountCents: 300, currency: "EUR" },
      { amountCents: 200, currency: "EUR" },
    ]);

    const one = await total("money-one");

    expect(one.rows).toEqual([{ total: 500 }]);
    expect(one.columns).toEqual([
      { name: "total", type: "money", currency: "EUR" },
    ]);

    // A money min over the same rows carries the currency too.
    const smallest = await queryDataset(reader, {
      dataset: RECORDS,
      query: {
        filters: labelled("money-one"),
        aggregates: [
          ...sum,
          { fn: "min", field: "amountCents", as: "smallest" },
        ],
      },
    });

    expect(smallest.rows).toEqual([{ total: 500, smallest: 200 }]);
    expect(smallest.columns).toEqual([
      { name: "total", type: "money", currency: "EUR" },
      { name: "smallest", type: "money", currency: "EUR" },
    ]);

    await insertRows("money-two", [
      { amountCents: 300, currency: "EUR" },
      { amountCents: 200, currency: "USD" },
    ]);

    await expect(total("money-two")).rejects.toMatchObject({
      code: "dataset-mixed-currency",
    });

    const grouped = await queryDataset(reader, {
      dataset: RECORDS,
      query: {
        filters: labelled("money-two"),
        groupBy: [{ field: "currency" }],
        aggregates: sum,
      },
    });

    expect(grouped.rows).toHaveLength(2);

    // A summed row with no currency is a currency of its own, so the total is refused.
    await insertRows("money-null-currency", [
      { amountCents: 300, currency: "EUR" },
      { amountCents: 200 },
    ]);

    await expect(total("money-null-currency")).rejects.toMatchObject({
      code: "dataset-mixed-currency",
    });

    // A row with no amount is not summed, so its currency does not count.
    await insertRows("money-null-amount", [
      { amountCents: 300, currency: "EUR" },
      { currency: "USD" },
    ]);

    const covered = await total("money-null-amount");

    expect(covered.rows).toEqual([{ total: 300 }]);
    expect(covered.columns).toEqual([
      { name: "total", type: "money", currency: "EUR" },
    ]);
  });

  it("skips the dataset of a disabled module", async () => {
    const reader = await person("placeholder:read");
    const tenant = freshTenant();

    try {
      await tenant.db.$client.query(
        "update tenant_module set enabled = false where module_id = 'placeholder'"
      );

      expect(
        (await listDatasets(contextFor(reader, tenant))).map(
          (entry) => entry.name
        )
      ).not.toContain(RECORDS);

      await expect(
        queryDataset(contextFor(reader, tenant), {
          dataset: RECORDS,
          query: { select: ["id"] },
        })
      ).rejects.toMatchObject({ code: "not-found" });
    } finally {
      await tenant.db.$client.end();
      await enableModules(deployment.context, ["placeholder"]);
    }
  });

  it("the reporting date moves the result", async () => {
    const label = "reporting-date";
    const reader = await person("placeholder:read");

    await insertRows(label, [
      { recordedOn: "2026-01-10" },
      { recordedOn: "2026-03-20" },
    ]);

    const countAt = async (reportingDate: string | null) => {
      await deployment.context.db.$client.query(
        "update tenant_settings set reporting_date = $1",
        [reportingDate]
      );

      const tenant = freshTenant();

      try {
        return (
          await queryDataset(contextFor(reader, tenant), {
            dataset: RECORDS,
            query: {
              filters: labelled(label),
              aggregates: [{ fn: "count", as: "n" }],
            },
          })
        ).rows;
      } finally {
        await tenant.db.$client.end();
      }
    };

    try {
      expect(await countAt("2026-02-01")).toEqual([{ n: 1 }]);
      expect(await countAt(null)).toEqual([{ n: 2 }]);
    } finally {
      await deployment.context.db.$client.query(
        "update tenant_settings set reporting_date = null"
      );
    }
  });
});

describe("the placeholder dataset through recordRoute", () => {
  it("routes a dataset row to its record page only for a person allowed to open it", async () => {
    const record = await insertPlaceholderRecord(deployment.context, {
      label: "record-route",
      recordedOn: "2026-01-01",
    });

    const route = (userId: string, dataset = RECORDS) =>
      recordRoute(contextFor(userId), { dataset, id: record.id });

    const reader = await person("placeholder:read");

    const { userId: readerAndUser } = await insertPersonWith(
      deployment.context,
      ["placeholder:read", "placeholder:use"]
    );

    expect(await route(readerAndUser)).toEqual({
      label: `Placeholder record ${record.id}`,
      path: `/placeholder/${record.id}`,
    });

    expect(await route(reader)).toBeNull();
    expect(await route(reader, "placeholder.nope")).toBeNull();
  });

  it("routes only the record a record-scoped use grant names", async () => {
    const [other, named] = await Promise.all(
      [1, 2].map(() =>
        insertPlaceholderRecord(deployment.context, {
          label: "record-route-scoped",
          recordedOn: "2026-01-01",
        })
      )
    );

    if (other === undefined || named === undefined) {
      throw new Error("the records were not written");
    }

    const userId = await person("placeholder:read");

    await assignRole(deployment.context, {
      roleId: await insertRole(deployment.context, {
        permissions: ["placeholder:use"],
      }),
      principal: { type: "user", id: userId },
      scope: { type: "placeholder-record", id: named.id },
    });

    const route = (id: string) =>
      recordRoute(contextFor(userId), { dataset: RECORDS, id });

    expect(await route(other.id)).toBeNull();
    expect(await route(named.id)).toEqual({
      label: `Placeholder record ${named.id}`,
      path: `/placeholder/${named.id}`,
    });
  });
});

describe("the placeholder dataset through queryDatasetSeries", () => {
  it("joins two series on the month and leaves a missing month empty", async () => {
    const label = "series";

    await insertRows(label, [
      { recordedOn: "2026-01-10", amountCents: 100, currency: "EUR" },
      { recordedOn: "2026-02-10", amountCents: 200, currency: "EUR" },
      { recordedOn: "2026-02-15", currency: "USD" },
      { recordedOn: "2026-03-15", currency: "USD" },
    ]);

    const result = await queryDatasetSeries(
      contextFor(await person("placeholder:read")),
      {
        series: [
          {
            name: "eur",
            dataset: RECORDS,
            query: {
              filters: [
                ...labelled(label),
                { field: "currency", op: "eq", value: "EUR" },
              ],
              groupBy: [{ field: "recordedOn", bucket: "month" }],
              aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
            },
          },
          {
            name: "usd",
            dataset: RECORDS,
            query: {
              filters: [
                ...labelled(label),
                { field: "currency", op: "eq", value: "USD" },
              ],
              groupBy: [{ field: "recordedOn", bucket: "month" }],
              aggregates: [{ fn: "count", as: "n" }],
            },
          },
        ],
      }
    );

    expect(result.rows).toEqual([
      { x: "2026-01-01", eur: 100, usd: null },
      { x: "2026-02-01", eur: 200, usd: 1 },
      { x: "2026-03-01", eur: null, usd: 1 },
    ]);
    expect(result.x).toEqual({ name: "x", type: "date", bucket: "month" });
    expect(result.series).toEqual([
      {
        name: "eur",
        dataset: RECORDS,
        column: { name: "total", type: "money", currency: "EUR" },
      },
      { name: "usd", dataset: RECORDS, column: { name: "n", type: "number" } },
    ]);
  });

  it("refuses the whole series query when the caller cannot read a series' dataset", async () => {
    await expect(
      queryDatasetSeries(contextFor(await person("placeholder:use")), {
        series: [
          {
            name: "eur",
            dataset: RECORDS,
            query: {
              filters: [
                ...labelled("series-permission"),
                { field: "currency", op: "eq", value: "EUR" },
              ],
              groupBy: [{ field: "recordedOn", bucket: "month" }],
              aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
            },
          },
        ],
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses more than 10 series", async () => {
    await expect(
      queryDatasetSeries(contextFor(await person("placeholder:read")), {
        series: Array.from({ length: 11 }, (_, index) =>
          countByMonth(`s${index}`, "series-eleven")
        ),
      })
    ).rejects.toMatchObject({
      code: "dataset-query-invalid",
      issues: [expect.objectContaining({ path: "series" })],
    });
  });

  it("keeps the first 1,000 joined rows in x order and says it was truncated", async () => {
    const label = "series-row-cap";

    // 600 records per currency: each series answers 600 rows, and the join holds 1,200.
    const { rows: inserted } = await deployment.context.db.$client.query<{
      id: string;
    }>(
      `insert into placeholder_record (label, recorded_on, currency)
         select $1, date '2026-01-01', currency
           from unnest(array['EUR', 'USD']) currency, generate_series(1, 600)
         returning id::text`,
      [label]
    );

    const byId = (name: string, currency: string): DatasetSeries => ({
      name,
      dataset: RECORDS,
      query: {
        filters: [
          ...labelled(label),
          { field: "currency", op: "eq", value: currency },
        ],
        groupBy: [{ field: "id" }],
        aggregates: [{ fn: "count", as: "n" }],
      },
    });

    const result = await queryDatasetSeries(
      contextFor(await person("placeholder:read")),
      { series: [byId("eur", "EUR"), byId("usd", "USD")] }
    );

    expect(result.rows.map((row) => row.x)).toEqual(
      inserted
        .map((row) => row.id)
        .toSorted()
        .slice(0, 1000)
    );
    expect(result.truncated).toBe(true);
  });

  it("stops the whole series query after 5 seconds, though each read waits less", async () => {
    const url = deployment.context.env.databaseUrl;
    const first = databaseClient(url);
    const second = databaseClient(url);

    await Promise.all([first.connect(), second.connect()]);

    const waiting = async (count: number) => {
      const deadline = Date.now() + 5000;

      // oxlint-disable no-await-in-loop -- poll only until the lock queue holds the waiters.
      while (Date.now() < deadline) {
        const { rows } = await first.query<{ n: number }>(
          "select count(*)::int as n from pg_locks where relation = 'placeholder_record'::regclass and not granted"
        );

        if ((rows[0]?.n ?? 0) >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // oxlint-enable no-await-in-loop

      throw new Error(`the lock queue never held ${count} waiters`);
    };

    const timers: NodeJS.Timeout[] = [];

    try {
      // The first lock holds the first series' read about 3 s. The second lock queues behind that
      // read, so the second series' read waits about 3.5 s more: each under 5 s, together over it.
      await first.query("begin");
      await first.query(
        "lock table placeholder_record in access exclusive mode"
      );

      const reader = contextFor(await person("placeholder:read"));
      const started = performance.now();

      const answer = queryDatasetSeries(reader, {
        series: [
          countByMonth("a", "series-deadline"),
          countByMonth("b", "series-deadline"),
        ],
      });

      // Handled here, so the rejection is not reported before the assertion awaits it.
      void answer.catch(() => undefined);

      await waiting(1);
      await second.query("begin");

      const secondLock = second.query(
        "lock table placeholder_record in access exclusive mode"
      );

      await waiting(2);

      timers.push(
        setTimeout(() => void first.query("rollback"), 3000),
        setTimeout(() => void second.query("rollback"), 6500)
      );

      await secondLock;

      await expect(answer).rejects.toMatchObject({ code: "dataset-timeout" });

      const elapsed = performance.now() - started;

      expect(elapsed).toBeGreaterThanOrEqual(4500);
      expect(elapsed).toBeLessThan(6000);
    } finally {
      timers.forEach(clearTimeout);
      await Promise.all([first.query("rollback"), second.query("rollback")]);
      await Promise.all([first.end(), second.end()]);
    }
  });

  it("refuses a series query whose aggregate is not a known function", async () => {
    await expect(
      queryDatasetSeries(contextFor(await person("placeholder:read")), {
        series: [
          {
            name: "eur",
            dataset: RECORDS,
            query: {
              filters: labelled("series-forged-fn"),
              groupBy: [{ field: "recordedOn", bucket: "month" }],
              aggregates: [
                {
                  // SAFETY: the query is forged at the runtime boundary, so fn is not a known aggregate.
                  fn: "pg_sleep(1)) --" as never,
                  field: "amountCents",
                  as: "eur",
                },
              ],
            },
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "dataset-query-invalid",
      issues: [
        expect.objectContaining({
          path: expect.stringMatching(/^series\.0\.query\.aggregates\.0/),
        }),
      ],
    });
  });
});
