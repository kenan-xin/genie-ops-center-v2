import {
  createRequestPrincipal,
  createStubGrantReader,
  type ModuleRequestContext,
} from "@genie/core";
import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placeholderModule } from "../src/module.ts";
import { placeholderRouter } from "../src/router.ts";
import { insertPlaceholderRecord } from "./factories.ts";

/**
 * The read path against a real Postgres, with the real histories applied. No part of the
 * database is mocked (R-38).
 *
 * This file needs a container runtime. Bead `genie-ops-center-v2-2tc` holds the gap on this
 * host: it is not written to pass without one, and it must never be skipped to go green.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function contextFor(read: Parameters<typeof createRequestPrincipal>[1]) {
  return {
    tenant: deployment.context,
    caller: createRequestPrincipal({ userId: "u1", groups: [] }, read),
  } satisfies ModuleRequestContext;
}

describe("the placeholder read procedure against a real database", () => {
  it("answers the rows this deployment holds", async () => {
    const row = await insertPlaceholderRecord(deployment.context, {
      label: "A read row",
    });

    const caller = placeholderRouter.createCaller(
      contextFor(createStubGrantReader())
    );

    const rows = await caller.read();

    expect(rows.map((entry) => entry.id)).toContain(row.id);
    expect(rows.map((entry) => entry.label)).toContain("A read row");
  });

  it("refuses a caller without the key, and reads nothing", async () => {
    const caller = placeholderRouter.createCaller(
      contextFor(() => Promise.resolve({ keys: new Set(), scopes: new Map() }))
    );

    await expect(caller.read()).rejects.toThrow("FORBIDDEN");
  });

  it("keeps core's ledger and the module's ledger apart", async () => {
    // Drizzle writes a ledger into its own `drizzle` schema, so the name is not searched for
    // on the default path. The catalogue is asked instead, which is why the schema is read
    // rather than assumed.
    const ledgers = await deployment.context.db.$client.query<{
      tablename: string;
    }>(
      `select tablename from pg_tables
       where tablename in ('__drizzle_migrations', '__drizzle_migrations_placeholder')
       order by tablename`
    );

    expect(ledgers.rows.map((row) => row.tablename)).toEqual([
      "__drizzle_migrations",
      "__drizzle_migrations_placeholder",
    ]);
  });

  it("recorded the module's one migration in the module's ledger", async () => {
    const applied = await deployment.context.db.$client.query<{
      count: number;
    }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations_placeholder"
    );

    expect(applied.rows[0]?.count).toBe(1);
  });
});
