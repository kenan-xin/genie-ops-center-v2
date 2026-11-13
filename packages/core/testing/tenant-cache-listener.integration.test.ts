import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
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
 * Two contexts over one deployment, the way two app copies share a database. Each is compiled with
 * `placeholder`, so its entitlement reader answers for it, and each has a pool name, so its listener
 * shows in `pg_stat_activity` as `<name>:<id>:cache`.
 */
async function twoCopies(): Promise<{ a: TenantContext; b: TenantContext }> {
  const postgres = await startDisposablePostgres();

  const copy = (name: string) =>
    createTenantContext(
      {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: "https://test.example.invalid",
      },
      silentLogger(),
      ["placeholder"],
      name
    );

  const a = copy("copy-a");
  const b = copy("copy-b");

  cleanups.push(async () => {
    await a.cacheListener.stop();
    await b.cacheListener.stop();
    await a.db.$client.end();
    await b.db.$client.end();
    await postgres.stop();
  });

  await runMigrations({
    env: a.env,
    pool: a.db.$client,
    histories: migrationPlan([]),
    compiledModuleIds: ["placeholder"],
  });

  await a.db.$client.query(
    "insert into tenant_settings (onboarding_mode, local_accounts_enabled, realm_supports_local_accounts, session_idle_minutes) values ('invite', false, false, 15)"
  );
  await a.db.$client.query(
    "insert into tenant_branding (company_name, product_name, default_locale, default_time_zone) values ('Acme', 'Genie', 'en', 'UTC')"
  );
  await a.db.$client.query(
    "insert into tenant_module (module_id, enabled) values ('placeholder', true)"
  );

  return { a, b };
}

/** What B serves from its readers: the three values a save changes. */
async function served(context: TenantContext) {
  return {
    idle: (await context.settings.get()).sessionIdleMinutes,
    company: (await context.branding.get()).companyName,
    enabled: await context.entitlements.isEnabled("placeholder"),
  };
}

const OLD = { idle: 15, company: "Acme", enabled: true };

const NEW = { idle: 30, company: "Changed", enabled: false };

async function save(context: TenantContext): Promise<void> {
  await context.db.$client.query(
    "update tenant_settings set session_idle_minutes = 30"
  );
  await context.db.$client.query(
    "update tenant_branding set company_name = 'Changed'"
  );
  await context.db.$client.query(
    "update tenant_module set enabled = false where module_id = 'placeholder'"
  );
}

/** The listener backends whose application name ends in `:cache`, read through `context`. */
async function listenerBackends(context: TenantContext): Promise<number> {
  const result = await context.db.$client.query<{ count: number }>(
    "select count(*)::int as count from pg_stat_activity where application_name like '%:cache'"
  );

  return result.rows[0]?.count ?? 0;
}

describe("tenant cache listener", () => {
  it("a save in one context clears the cache of another context within a second", async () => {
    const { a, b } = await twoCopies();

    await a.cacheListener.start();
    await b.cacheListener.start();

    expect(await served(b)).toEqual(OLD);

    const saved = Date.now();

    await save(a);

    await vi.waitFor(async () => expect(await served(b)).toEqual(NEW), {
      timeout: 1000,
      interval: 50,
    });
    expect(Date.now() - saved).toBeLessThan(1000);
  });

  it("a missed notification still expires in ten seconds", async () => {
    const { a, b } = await twoCopies();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    expect(await served(b)).toEqual(OLD);

    await save(a);

    expect(await served(b)).toEqual(OLD);

    vi.advanceTimersByTime(10001);

    expect(await served(b)).toEqual(NEW);
  });

  it("a dropped connection reconnects and clears the caches", async () => {
    const { a, b } = await twoCopies();

    await b.cacheListener.start();

    expect(await served(b)).toEqual(OLD);

    // The save fires no trigger, so only the clear after the reconnect can show it to B.
    await a.db.$client.query(
      "begin; set local session_replication_role = replica; update tenant_settings set session_idle_minutes = 30; update tenant_branding set company_name = 'Changed'; update tenant_module set enabled = false; commit"
    );

    expect(await served(b)).toEqual(OLD);

    await a.db.$client.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where application_name like '%:cache'"
    );

    await vi.waitFor(async () => expect(await served(b)).toEqual(NEW), {
      timeout: 5000,
      interval: 50,
    });
    // One reconnect, not one per `error` and `end` event of the dropped client.
    await vi.waitFor(async () => expect(await listenerBackends(a)).toBe(1));
  });

  it("stop before start is a no-op, and stop ends the listener backend", async () => {
    const { a } = await twoCopies();

    await a.cacheListener.stop();

    await a.cacheListener.start();
    await a.cacheListener.start();

    expect(await listenerBackends(a)).toBe(1);

    await a.cacheListener.stop();

    await vi.waitFor(async () => expect(await listenerBackends(a)).toBe(0));
  });
});
