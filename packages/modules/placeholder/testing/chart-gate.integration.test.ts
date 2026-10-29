import {
  AppError,
  checkChart,
  principalFor,
  registerModuleRuntime,
  type ModuleRequestContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placeholderModule } from "../src/module.ts";
import { insertPlaceholderRecord } from "./factories.ts";

/**
 * The chart gate of Spec 7 R-15 and AC-4 (second line) on `placeholder.records`, against a real
 * Postgres with the real histories applied. Each case writes its own rows under its own label and
 * filters on that label, so the cases share one deployment without reading each other.
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

async function contextWith(permission: string): Promise<ModuleRequestContext> {
  const { userId } = await insertPersonWith(deployment.context, [permission]);

  return {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: [placeholderModule],
      userId,
      authenticated: true,
    }),
  };
}

const reader = () => contextWith("placeholder:read");

type RecordValues = NonNullable<Parameters<typeof insertPlaceholderRecord>[1]>;

/** Writes rows under one label, each recorded on 2026-01-01 unless it names its own day. */
async function insertRows(
  label: string,
  rows: readonly RecordValues[]
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

const RECORDS = "placeholder.records";

const labelled = (label: string) => [
  { field: "label", op: "eq", value: label },
];

const monthlyCount = (name: string, label: string) => ({
  name,
  dataset: RECORDS,
  query: {
    filters: labelled(label),
    groupBy: [{ field: "recordedOn", bucket: "month" }],
    aggregates: [{ fn: "count", as: "n" }],
  },
  x: "recordedOn",
  y: "n",
});

const hiddenConfig = (dataset: string) => ({
  type: "bar",
  title: "Records",
  series: [{ ...monthlyCount("Records", "chart-hidden"), dataset }],
});

/** The issues of the `chart-invalid` refusal a config gets. */
async function refusal(
  ctx: ModuleRequestContext,
  config: Parameters<typeof checkChart>[1]
): Promise<readonly { path: string; message: string }[]> {
  const error = await checkChart(ctx, config).then(
    () => undefined,
    (cause: unknown) => cause
  );

  expect(error).toBeInstanceOf(AppError);
  expect(error).toHaveProperty("code", "chart-invalid");

  return error instanceof AppError ? (error.issues ?? []) : [];
}

describe("the chart gate on placeholder.records", () => {
  it("passes a bar chart of one series and answers its rows, dataset and read time", async () => {
    const label = "chart-one-series";

    await insertRows(label, [{}, {}, { recordedOn: "2026-02-10" }]);

    const before = new Date().toISOString();

    const { data } = await checkChart(await reader(), {
      type: "bar",
      title: "Records per month",
      series: [monthlyCount("Records", label)],
    });

    const after = new Date().toISOString();

    expect(data.x).toEqual({
      key: "x",
      label: "Recorded on",
      type: "date",
      bucket: "month",
    });
    expect(data.columns).toEqual([
      { key: "Records", label: "Records", type: "number" },
    ]);
    expect(data.rows).toEqual([
      { x: "2026-01-01", Records: 2 },
      { x: "2026-02-01", Records: 1 },
    ]);
    expect(data.datasets).toEqual([RECORDS]);
    expect(data.readAt >= before && data.readAt <= after).toBe(true);
  });

  it("joins two series on the month and leaves a missing month empty, never 0", async () => {
    const first = "chart-join-a";
    const second = "chart-join-b";

    await insertRows(first, [{}, { recordedOn: "2026-02-10" }]);
    await insertRows(second, [{}]);

    const { data } = await checkChart(await reader(), {
      type: "line",
      title: "Records per month",
      series: [monthlyCount("First", first), monthlyCount("Second", second)],
    });

    expect(data.rows).toEqual([
      { x: "2026-01-01", First: 1, Second: 1 },
      { x: "2026-02-01", First: 1, Second: null },
    ]);
  });

  it("points a query the dataset refuses at its own series", async () => {
    const ctx = await reader();

    expect(
      (
        await refusal(ctx, {
          type: "table",
          title: "Records",
          series: [
            { name: "Records", dataset: RECORDS, query: { select: ["nope"] } },
          ],
        })
      ).map((issue) => issue.path)
    ).toEqual(["series.0.query.select.0"]);

    const unknownGroup = monthlyCount("Second", "chart-refused");

    expect(
      (
        await refusal(ctx, {
          type: "bar",
          title: "Records",
          series: [
            monthlyCount("First", "chart-refused"),
            {
              ...unknownGroup,
              query: { ...unknownGroup.query, groupBy: [{ field: "nope" }] },
              x: "nope",
            },
          ],
        })
      ).map((issue) => issue.path)
    ).toContain("series.1.query.groupBy.0.field");
  });

  it("refuses a dataset the caller cannot read like one that does not exist", async () => {
    const hidden = await refusal(
      await contextWith("placeholder:use"),
      hiddenConfig(RECORDS)
    );

    const missing = await refusal(
      await reader(),
      hiddenConfig("placeholder.nope")
    );

    expect(hidden.map((issue) => issue.path)).toEqual(["series.0.dataset"]);
    expect(missing.map((issue) => issue.path)).toEqual(["series.0.dataset"]);
    expect(hidden[0]?.message.replace(RECORDS, "<name>")).toBe(
      missing[0]?.message.replace("placeholder.nope", "<name>")
    );
  });

  it("refuses money that one axis cannot show in one currency", async () => {
    const label = "chart-two-currencies";

    await insertRows(label, [
      { amountCents: 1000, currency: "EUR" },
      { amountCents: 700, currency: "USD" },
    ]);

    const ctx = await reader();

    const sum = [{ fn: "sum", field: "amountCents", as: "total" }];

    expect(
      (
        await refusal(ctx, {
          type: "bar",
          title: "Amount per currency",
          series: [
            {
              name: "Amount",
              dataset: RECORDS,
              query: {
                filters: labelled(label),
                groupBy: [{ field: "currency" }],
                aggregates: sum,
              },
              x: "currency",
              y: "total",
            },
          ],
        })
      ).map((issue) => issue.path)
    ).toEqual(["series.0.y"]);

    expect(
      await refusal(ctx, {
        type: "kpi",
        title: "Total",
        series: [
          {
            name: "Total",
            dataset: RECORDS,
            query: { filters: labelled(label), aggregates: sum },
            value: "total",
          },
        ],
      })
    ).toEqual([
      {
        path: "series.0.query",
        message:
          "That total mixes currencies. Group by the currency, or filter one currency.",
      },
    ]);
  });

  it("passes an empty result: a money KPI over no rows answers one empty value", async () => {
    const { data } = await checkChart(await reader(), {
      type: "kpi",
      title: "Total",
      series: [
        {
          name: "Total",
          dataset: RECORDS,
          query: {
            filters: labelled("chart-nothing-matches"),
            aggregates: [{ fn: "sum", field: "amountCents", as: "total" }],
          },
          value: "total",
        },
      ],
    });

    expect(data.rows).toEqual([{ Total: null }]);
    expect(data.columns).toEqual([
      { key: "Total", label: "Total", type: "money" },
    ]);
  });

  it("shows each table amount in the currency of its row", async () => {
    const label = "chart-table-amounts";

    await insertRows(label, [{ amountCents: 1500, currency: "EUR" }]);

    const { data } = await checkChart(await reader(), {
      type: "table",
      title: "Records",
      series: [
        {
          name: "Records",
          dataset: RECORDS,
          query: {
            select: ["label", "amountCents", "currency"],
            filters: labelled(label),
          },
        },
      ],
    });

    expect(data.columns[1]).toEqual({
      key: "amountCents",
      label: "Amount",
      type: "money",
      currencyKey: "currency",
    });
    expect(data.rows).toEqual([{ label, amountCents: 1500, currency: "EUR" }]);
  });
});
