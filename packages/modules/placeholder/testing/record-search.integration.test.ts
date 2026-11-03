import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placeholderModule } from "../src/module.ts";
import { insertPlaceholderRecord } from "./factories.ts";

/**
 * The record search of the scope picker (Spec 2 R-37c, module contract, Record types) against a
 * real Postgres with the real histories applied.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const ids = new Map<string, string>();

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);

  for (const label of ["Bravo", "alpha two", "50% off", "Alpha one"]) {
    // oxlint-disable-next-line no-await-in-loop -- four rows, in order.
    const row = await insertPlaceholderRecord(deployment.context, { label });

    ids.set(label, row.id);
  }
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

function search(query: string, limit: number) {
  const [recordType] = placeholderModule.recordTypes;

  if (recordType === undefined) throw new Error("no record type");

  return recordType.search({ tenant: deployment.context }, query, limit);
}

describe("the placeholder record search", () => {
  it("S1: answers the records whose label holds the query, in any case, up to the limit", async () => {
    expect(await search("ALPHA", 20)).toEqual([
      ids.get("Alpha one"),
      ids.get("alpha two"),
    ]);
    expect(await search("alpha", 1)).toHaveLength(1);
    expect(await search("%", 20)).toEqual([ids.get("50% off")]);
  });
});
