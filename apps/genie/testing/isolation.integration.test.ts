import {
  principalFor,
  createLogger,
  createTenantContext,
  withTransaction,
  type ModuleRequestContext,
  type TenantContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  startDisposableDeployment,
} from "@genie/core/testing";
import {
  placeholderModule,
  placeholderRouter,
} from "@genie/module-placeholder";
import { insertPlaceholderRecord } from "@genie/module-placeholder/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=",
  "base64"
);

async function seedTenantReaders(tenant: TenantContext, minutes: number) {
  await tenant.db.$client.query(
    "insert into tenant_settings (onboarding_mode, local_accounts_enabled, realm_supports_local_accounts, session_idle_minutes) values ('invite', false, false, $1)",
    [minutes]
  );
  await tenant.db.$client.query(
    "insert into tenant_branding (company_name, product_name, default_locale, default_time_zone) values ($1, $2, 'en', 'UTC')",
    [`Company ${minutes}`, `Product ${minutes}`]
  );
}

/** A second context on the same database, with a cold entitlement cache. */
function cold(tenant: TenantContext): TenantContext {
  return createTenantContext(
    { DATABASE_URL: tenant.env.databaseUrl, PUBLIC_URL: tenant.env.publicUrl },
    createLogger({ logLevel: "silent" }),
    ["placeholder"]
  );
}

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

let firstReader = "";

let secondReader = "";

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

  // One reader per deployment, holding `placeholder:read` through a real role assignment in
  // that deployment's own database (DEC-48).
  [firstReader, secondReader] = await Promise.all([
    insertPersonWith(first.context, ["placeholder:read"]).then(
      (row) => row.userId
    ),
    insertPersonWith(second.context, ["placeholder:read"]).then(
      (row) => row.userId
    ),
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
function callerFor(
  tenant: TenantContext,
  userId: string
): ModuleRequestContext {
  return {
    tenant,
    caller: principalFor({ tenant, modules: [placeholderModule], userId }),
  };
}

describe("two tenant contexts in one process", () => {
  it("each TenantContext reader, file store and placeholder router returns only its own database's data", async () => {
    await Promise.all([
      seedTenantReaders(first.context, 21),
      seedTenantReaders(second.context, 42),
    ]);

    const firstFile = await withTransaction(first.context, (tx) =>
      first.context.fileStorage.store(
        {
          bytes: PNG_BYTES,
          mimeType: "image/png",
          fileName: "first-only.png",
          uploadedByUserId: null,
        },
        tx
      )
    );

    const secondFile = await withTransaction(second.context, (tx) =>
      second.context.fileStorage.store(
        {
          bytes: PNG_BYTES,
          mimeType: "image/png",
          fileName: "second-only.png",
          uploadedByUserId: null,
        },
        tx
      )
    );

    const firstRow = await insertPlaceholderRecord(first.context, {
      label: "first-only",
    });

    const secondRow = await insertPlaceholderRecord(second.context, {
      label: "second-only",
    });

    const fromFirst = await placeholderRouter
      .createCaller(callerFor(first.context, firstReader))
      .read();

    const fromSecond = await placeholderRouter
      .createCaller(callerFor(second.context, secondReader))
      .read();

    // A person's grants live in their own deployment's database: the other context's loader
    // finds no such person and refuses.
    await expect(
      placeholderRouter
        .createCaller(callerFor(second.context, firstReader))
        .read()
    ).rejects.toThrow("FORBIDDEN");

    const [firstSettings, secondSettings] = await Promise.all([
      first.context.settings.get(),
      second.context.settings.get(),
    ]);

    const [firstBranding, secondBranding] = await Promise.all([
      first.context.branding.get(),
      second.context.branding.get(),
    ]);

    const [firstFileContents, secondFileContents] = await Promise.all([
      first.context.fileStorage.fetch(firstFile.id),
      second.context.fileStorage.fetch(secondFile.id),
    ]);

    expect(firstSettings.sessionIdleMinutes).toBe(21);
    expect(secondSettings.sessionIdleMinutes).toBe(42);
    expect(firstBranding.companyName).toBe("Company 21");
    expect(secondBranding.companyName).toBe("Company 42");
    // A file id from the other deployment is unknown here. A file store bound to a shared pool
    // would find it.
    await expect(
      first.context.fileStorage.fetch(secondFile.id)
    ).rejects.toThrow("No file is recorded");
    await expect(
      second.context.fileStorage.fetch(firstFile.id)
    ).rejects.toThrow("No file is recorded");

    // The two databases disagree on one entitlement. The router reads above already filled each
    // context's ten-second cache, so a cold reader per database reads the stored value.
    await second.context.db.$client.query(
      "update tenant_module set enabled = false where module_id = 'placeholder'"
    );

    const firstCold = cold(first.context);
    const secondCold = cold(second.context);

    try {
      expect(await firstCold.entitlements.isEnabled("placeholder")).toBe(true);
      expect(await secondCold.entitlements.isEnabled("placeholder")).toBe(
        false
      );
    } finally {
      await Promise.all([
        firstCold.db.$client.end(),
        secondCold.db.$client.end(),
      ]);
      await second.context.db.$client.query(
        "update tenant_module set enabled = true where module_id = 'placeholder'"
      );
    }

    expect(firstFileContents).toEqual({
      bytes: PNG_BYTES,
      mimeType: "image/png",
      fileName: "first-only.png",
    });
    expect(secondFileContents).toEqual({
      bytes: PNG_BYTES,
      mimeType: "image/png",
      fileName: "second-only.png",
    });

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
