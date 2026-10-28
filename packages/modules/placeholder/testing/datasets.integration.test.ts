import {
  createTenantContext,
  listDatasets,
  principalFor,
  queryDataset,
  registerModuleRuntime,
  type ModuleRequestContext,
  type TenantContext,
} from "@genie/core";
import {
  databaseClient,
  enableModules,
  insertPersonWith,
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
