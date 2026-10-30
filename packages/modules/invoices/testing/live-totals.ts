import {
  type DatasetFilter,
  type ModuleRequestContext,
  queryDataset,
} from "@genie/core";

async function total(
  ctx: ModuleRequestContext,
  dataset: string,
  field: string,
  filters: readonly DatasetFilter[] = []
): Promise<number> {
  const [row] = (
    await queryDataset(ctx, {
      dataset,
      query: { filters, aggregates: [{ fn: "sum", field, as: "total" }] },
    })
  ).rows;

  return Number(row?.total ?? 0);
}

/** The four running totals the demo guide prints after each upload, read through the datasets. */
export async function runningTotals(ctx: ModuleRequestContext) {
  return {
    invoicedCents: await total(ctx, "invoices.invoices", "totalCents"),
    collectedCents: await total(ctx, "invoices.payments", "amountCents"),
    outstandingCents: await total(ctx, "invoices.invoices", "outstandingCents"),
    overdueCents: await total(ctx, "invoices.invoices", "outstandingCents", [
      { field: "overdue", op: "eq", value: true },
    ]),
  };
}
