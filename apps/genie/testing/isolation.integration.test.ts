import {
  createRequestPrincipal,
  createStubGrantReader,
  type ModuleRequestContext,
  type TenantContext,
} from "@genie/core";
import { enableModules, startDisposableDeployment } from "@genie/core/testing";
import {
  placeholderModule,
  placeholderRouter,
} from "@genie/module-placeholder";
import { insertPlaceholderRecord } from "@genie/module-placeholder/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The two-database isolation proof (R-20, AC-4). It must never be skipped.
 *
 * Two real Postgres containers, two tenant contexts, one process, at the same
 * time. `startDisposableDeployment` gives each context its own database with the
 * real histories applied, so a read that crossed a tenant boundary would show
 * the other deployment's row. Every other integration test proves one
 * deployment against itself; this is the only file that proves the boundary
 * holds between two of them.
 */
let first: Awaited<ReturnType<typeof startDisposableDeployment>>;

let second: Awaited<ReturnType<typeof startDisposableDeployment>>;

// R-20: the case below must never be skipped, and a skipped run must fail the
// pipeline. A runner flag cannot express that, so the suite asserts its own
// execution instead: the `afterAll` guard throws when the case never ran.
let isolationRan = false;

beforeAll(async () => {
  [first, second] = await Promise.all([
    startDisposableDeployment([placeholderModule]),
    startDisposableDeployment([placeholderModule]),
  ]);

  // The read procedure's `createModuleTRPC` gate refuses a disabled module before `can()`, so
  // both deployments start disabled and the setup enables them: the read below must reach the
  // database, not the entitlement refusal.
  await Promise.all([
    enableModules(first.context, ["placeholder"]),
    enableModules(second.context, ["placeholder"]),
  ]);
}, 180000);

afterAll(async () => {
  // Stopped first, so a guard failure below still removes both containers.
  await Promise.all([first?.stop(), second?.stop()]);

  if (!isolationRan) {
    throw new Error(
      "The two-context isolation case did not run. R-20 forbids skipping it."
    );
  }
});

/**
 * The request context for one caller. The tenant is a parameter rather than a
 * value captured once, so each read is built against an explicitly named
 * deployment and the two can never quietly share one.
 */
function callerFor(tenant: TenantContext): ModuleRequestContext {
  return {
    tenant,
    caller: createRequestPrincipal(
      { userId: "isolation-test", groups: [] },
      createStubGrantReader()
    ),
  };
}

describe("two tenant contexts in one process", () => {
  it("each read returns only its own database's row", async () => {
    const firstRow = await insertPlaceholderRecord(first.context, {
      label: "first-only",
    });

    const secondRow = await insertPlaceholderRecord(second.context, {
      label: "second-only",
    });

    const fromFirst = await placeholderRouter
      .createCaller(callerFor(first.context))
      .read();

    const fromSecond = await placeholderRouter
      .createCaller(callerFor(second.context))
      .read();

    // An equality, not a count. Two contexts pointed at one database would each
    // return both labels and fail here, while a count of two would still pass.
    expect(fromFirst.map((row) => row.label)).toEqual(["first-only"]);
    expect(fromSecond.map((row) => row.label)).toEqual(["second-only"]);

    // The same boundary stated by identity, so a shared database that happened
    // to hold one row each could not slip through.
    expect(fromFirst.map((row) => row.id)).not.toContain(secondRow.id);
    expect(fromSecond.map((row) => row.id)).not.toContain(firstRow.id);

    isolationRan = true;
  });

  it("the two databases are genuinely separate", async () => {
    // Different connection strings, so the two contexts are not reading one
    // container that a pool happened to reuse.
    expect(first.context.env.databaseUrl).not.toBe(
      second.context.env.databaseUrl
    );

    const firstRow = await insertPlaceholderRecord(first.context, {
      label: "first-direct",
    });

    const secondRow = await insertPlaceholderRecord(second.context, {
      label: "second-direct",
    });

    // Read straight from the pool beside the product path, so this control does
    // not depend on the router under test. The row written to the other
    // deployment is absent while this one's is present, which together rule out
    // an empty or otherwise broken database.
    const own = await first.context.db.$client.query<{ id: string }>(
      "select id from placeholder_record where id = $1",
      [firstRow.id]
    );

    const crossed = await first.context.db.$client.query<{ id: string }>(
      "select id from placeholder_record where id = $1",
      [secondRow.id]
    );

    expect(own.rowCount).toBe(1);
    expect(crossed.rowCount).toBe(0);
  });
});
