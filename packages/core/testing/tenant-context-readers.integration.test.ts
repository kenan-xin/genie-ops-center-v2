import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import {
  createTenantReaders,
  TENANT_CACHE_CHANNEL,
} from "../src/lib/tenant-context/readers.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/**
 * A context built with `placeholder` compiled, so the entitlement reader answers for it (R-79).
 * The deployment URL comes from a disposable Postgres with the core history applied, the way
 * `freshContext` builds one in the compiled-module test.
 */
async function readerContext() {
  const postgres = await startDisposablePostgres();

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    },
    silentLogger(),
    ["placeholder"]
  );

  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: migrationPlan([]),
    compiledModuleIds: ["placeholder"],
  });

  await context.db.$client.query(
    "insert into tenant_settings (onboarding_mode, local_accounts_enabled, realm_supports_local_accounts, session_idle_minutes) values ('invite', false, false, 15)"
  );
  await context.db.$client.query(
    "insert into tenant_branding (company_name, product_name, default_locale, default_time_zone) values ('Acme', 'Genie', 'en', 'UTC')"
  );
  await context.db.$client.query(
    "insert into tenant_module (module_id, enabled) values ('placeholder', true)"
  );

  cleanups.push(async () => {
    await context.db.$client.end();
    await postgres.stop();
  });

  return { context, url: postgres.url };
}

/** Readers over the context's own client, built directly so the test holds `clearAll`. */
function clearableReaders(
  context: Awaited<ReturnType<typeof readerContext>>["context"]
) {
  return createTenantReaders({
    db: context.db,
    compiledModuleIds: ["placeholder"],
  });
}

/** A raw client on the deployment URL, closed after the test. */
async function rawClient(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });

  await client.connect();
  cleanups.push(() => client.end());

  return client;
}

/**
 * The pool reads whose SQL matches `pattern`, by default one of the settings, branding or module
 * tables. The category case passes its own pattern to count each table separately.
 *
 * Drizzle's node-postgres session passes the SQL as a `QueryConfig` object, not a string, so the
 * statement is read from `text` when present and from the value itself otherwise. A read is
 * counted from its SQL, so the assertion proves one database read per cached reader rather than
 * one call of any kind.
 */
function readerReads(
  calls: readonly (readonly unknown[])[],
  pattern = /select .*tenant_(settings|branding|module)/is
): number {
  return calls.filter((call) => {
    const statement = call[0];

    // SAFETY: a pg pool `query` first argument is the SQL string or a query-config object that
    // carries the same SQL on `text`; this reads the object spelling when the string is absent.
    const sql =
      (statement as { readonly text?: string } | undefined)?.text ??
      String(statement);

    return pattern.test(sql);
  }).length;
}

describe("tenant context readers", () => {
  it("serves cached settings branding and entitlement values without a second database read", async () => {
    const { context } = await readerContext();
    const query = vi.spyOn(context.db.$client, "query");

    expect((await context.settings.get()).sessionIdleMinutes).toBe(15);
    expect((await context.settings.get()).sessionIdleMinutes).toBe(15);
    expect((await context.branding.get()).companyName).toBe("Acme");
    expect((await context.branding.get()).companyName).toBe("Acme");
    expect(await context.entitlements.isEnabled("placeholder")).toBe(true);
    expect(await context.entitlements.isEnabled("placeholder")).toBe(true);

    expect(readerReads(query.mock.calls)).toBe(3);
  });

  it("rereads settings branding and entitlements after ten seconds without save invalidation", async () => {
    const { context } = await readerContext();
    const query = vi.spyOn(context.db.$client, "query");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    await context.settings.get();
    await context.branding.get();
    await context.entitlements.isEnabled("placeholder");

    await context.db.$client.query(
      "update tenant_settings set session_idle_minutes = 30"
    );
    await context.db.$client.query(
      "update tenant_branding set company_name = 'Changed'"
    );
    await context.db.$client.query(
      "update tenant_module set enabled = false where module_id = 'placeholder'"
    );

    expect((await context.settings.get()).sessionIdleMinutes).toBe(15);
    expect((await context.branding.get()).companyName).toBe("Acme");
    expect(await context.entitlements.isEnabled("placeholder")).toBe(true);

    vi.advanceTimersByTime(10001);

    expect((await context.settings.get()).sessionIdleMinutes).toBe(30);
    expect((await context.branding.get()).companyName).toBe("Changed");
    expect(await context.entitlements.isEnabled("placeholder")).toBe(false);
    expect(await context.entitlements.isEnabled("missing-module")).toBe(false);

    expect(readerReads(query.mock.calls)).toBeGreaterThanOrEqual(6);
  });

  it("answers false for a module the image did not compile, even with an enabled row", async () => {
    const { context } = await readerContext();

    await context.db.$client.query(
      "insert into tenant_module (module_id, enabled) values ('retired-module', true)"
    );

    const query = vi.spyOn(context.db.$client, "query");

    expect(await context.entitlements.isEnabled("retired-module")).toBe(false);
    expect(readerReads(query.mock.calls)).toBe(0);
  });

  it("serves the category list and each module's placement from one cached read each, and rereads after ten seconds", async () => {
    const { context } = await readerContext();
    const pool = context.db.$client;

    await pool.query(
      "insert into category (name, position) values ('Finance', 2), ('Clinical', 1), ('Admin', 1)"
    );

    const finance = await pool.query<{ id: string }>(
      "select id from category where name = 'Finance'"
    );

    const financeId = finance.rows[0]?.id ?? "";

    await pool.query(
      "update tenant_module set category_id = $1 where module_id = 'placeholder'",
      [financeId]
    );

    const query = vi.spyOn(pool, "query");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    expect(await context.entitlements.isEnabled("placeholder")).toBe(true);
    expect(await context.categories.ofModule("placeholder")).toBe(financeId);
    expect(await context.categories.ofModule("placeholder")).toBe(financeId);

    const names = async () =>
      (await context.categories.list()).map((row) => row.name);

    expect(await names()).toEqual(["Admin", "Clinical", "Finance"]);
    expect(await names()).toEqual(["Admin", "Clinical", "Finance"]);

    expect(readerReads(query.mock.calls, /from "tenant_module"/i)).toBe(1);
    expect(readerReads(query.mock.calls, /from "category"/i)).toBe(1);

    const before = query.mock.calls.length;

    expect(await context.categories.ofModule("missing-module")).toBeNull();
    expect(query.mock.calls.length).toBe(before);

    await pool.query(
      "update category set name = 'Money' where name = 'Finance'"
    );
    await pool.query("update tenant_module set category_id = null");

    expect(await context.categories.ofModule("placeholder")).toBe(financeId);
    expect((await context.categories.list()).map((row) => row.name)).toContain(
      "Finance"
    );

    vi.advanceTimersByTime(10001);

    expect(await context.categories.ofModule("placeholder")).toBeNull();
    expect((await context.categories.list()).map((row) => row.name)).toEqual([
      "Admin",
      "Clinical",
      "Money",
    ]);
  });

  it("a clear makes the next read fetch the changed row before ten seconds", async () => {
    const { context } = await readerContext();
    const readers = clearableReaders(context);

    expect((await readers.settings.get()).sessionIdleMinutes).toBe(15);
    expect((await readers.categories.list()).map((row) => row.name)).toEqual(
      []
    );

    await context.db.$client.query(
      "update tenant_settings set session_idle_minutes = 30"
    );
    await context.db.$client.query(
      "insert into category (name, position) values ('Finance', 1)"
    );

    readers.clearAll();

    expect((await readers.settings.get()).sessionIdleMinutes).toBe(30);
    expect((await readers.categories.list()).map((row) => row.name)).toEqual([
      "Finance",
    ]);
  });

  it("a fill that started before a clear does not store its value", async () => {
    const { context, url } = await readerContext();
    const readers = clearableReaders(context);
    const saver = await rawClient(url);

    // The save is uncommitted while the fill reads, so the fill deterministically reads the old row.
    await saver.query("begin");
    await saver.query("update tenant_settings set session_idle_minutes = 30");

    const staleFill = readers.settings.get();

    readers.clearAll();

    expect((await staleFill).sessionIdleMinutes).toBe(15);

    await saver.query("commit");

    expect((await readers.settings.get()).sessionIdleMinutes).toBe(30);
  });

  it("a committed save notifies genie_tenant_cache with the table name, a rolled back save does not", async () => {
    const { context, url } = await readerContext();
    const listener = await rawClient(url);
    const payloads: string[] = [];

    listener.on("notification", (message) => {
      if (message.channel === TENANT_CACHE_CHANNEL) {
        payloads.push(message.payload ?? "");
      }
    });
    await listener.query(`listen ${TENANT_CACHE_CHANNEL}`);

    const pool = context.db.$client;

    await pool.query("update tenant_settings set session_idle_minutes = 30");
    await pool.query("update tenant_branding set company_name = 'Changed'");
    await pool.query("update tenant_module set enabled = false");
    await pool.query("insert into category (name, position) values ('A', 1)");

    await vi.waitFor(() => {
      expect(payloads.toSorted()).toEqual([
        "category",
        "tenant_branding",
        "tenant_module",
        "tenant_settings",
      ]);
    });

    payloads.length = 0;

    const saver = await rawClient(url);

    await saver.query("begin");
    await saver.query("update tenant_settings set session_idle_minutes = 45");
    await saver.query("rollback");
    // One session's notifications arrive in commit order, so the marker proves nothing came first.
    await saver.query(`select pg_notify('${TENANT_CACHE_CHANNEL}', 'marker')`);

    await vi.waitFor(() => {
      expect(payloads).toEqual(["marker"]);
    });
  });
});
