import { type DatasetDeclaration, scopesFor } from "@genie/core";
import { and, lte } from "drizzle-orm";

import { placeholderRecord } from "./schema.ts";
import { recordScope } from "./scope.ts";

/**
 * The module's one dataset (DEC-54): the records the caller may read, up to the reporting date.
 * `source` answers a select already filtered by `scopesFor()`, and core composes over it only as
 * an aliased subquery, so core never names this table.
 */
export const recordsDataset: DatasetDeclaration = {
  name: "placeholder.records",
  description: "The placeholder records a person may read, as of a date.",
  permission: "placeholder:read",
  fields: {
    id: { kind: "dimension", type: "text", description: "The record id." },
    label: {
      kind: "dimension",
      type: "text",
      description: "The record label.",
    },
    recordedOn: {
      kind: "dimension",
      type: "date",
      description: "The day the record was written.",
    },
    amountCents: {
      kind: "measure",
      type: "money",
      description: "The amount in minor units of the record's currency.",
    },
    currency: {
      kind: "dimension",
      type: "text",
      description: "The ISO currency code.",
    },
    quantity: {
      kind: "measure",
      type: "number",
      description: "The recorded quantity.",
    },
  },
  timeField: "recordedOn",
  recordKey: { type: "placeholder-record", field: "id" },
  currencyField: "currency",
  source: async (ctx, asOf) => {
    const scope = recordScope(await scopesFor(ctx.caller, "placeholder:read"));

    const select = ctx.tenant.db
      .select({
        id: placeholderRecord.id,
        label: placeholderRecord.label,
        recordedOn: placeholderRecord.recordedOn,
        amountCents: placeholderRecord.amountCents,
        currency: placeholderRecord.currency,
        quantity: placeholderRecord.quantity,
      })
      .from(placeholderRecord)
      .where(and(scope, lte(placeholderRecord.recordedOn, asOf)));

    // A Drizzle select is a thenable, so returning it from this async function would resolve to
    // rows. Core calls `as()` only, so the source answers that method and nothing else (DEC-54).
    return { as: (alias: string) => select.as(alias) };
  },
};
