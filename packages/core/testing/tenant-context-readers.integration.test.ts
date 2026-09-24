import { afterEach, describe, expect, it, vi } from "vitest";

import { startDisposableDeployment } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function readerContext() {
  const deployment = await startDisposableDeployment();
  const context = deployment.context;

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
    await deployment.stop();
  });

  return context;
}

describe("tenant context readers", () => {
  it("serves cached settings branding and entitlement values without a second database read", async () => {
    const context = await readerContext();
    const query = vi.spyOn(context.db.$client, "query");

    expect((await context.settings.get()).sessionIdleMinutes).toBe(15);
    expect((await context.settings.get()).sessionIdleMinutes).toBe(15);
    expect((await context.branding.get()).companyName).toBe("Acme");
    expect((await context.branding.get()).companyName).toBe("Acme");
    expect(await context.entitlements.isEnabled("placeholder")).toBe(true);
    expect(await context.entitlements.isEnabled("placeholder")).toBe(true);

    const reads = query.mock.calls.filter(([statement]) =>
      /select .*tenant_(settings|branding|module)/is.test(String(statement))
    );

    expect(reads).toHaveLength(3);
  });

  it("rereads settings branding and entitlements after ten seconds without save invalidation", async () => {
    const context = await readerContext();
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

    const reads = query.mock.calls.filter(([statement]) =>
      /select .*tenant_(settings|branding|module)/is.test(String(statement))
    );

    expect(reads.length).toBeGreaterThanOrEqual(6);
  });
});
