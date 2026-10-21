import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { SETUP_STEPS } from "../src/services/setup/index.ts";

/**
 * Test-only stand-in for `genie-ops setup` in fixtures that expect a working app: every known
 * step done, and the singleton rows the `seed` step owns in place. The settings row matters
 * beyond setup: the enforced session read of R-14 reads `session_idle_minutes` through the
 * settings reader on every authenticated request, and a deployment without the row fails closed.
 */
export async function markSetupDone(
  context: Pick<TenantContext, "db">
): Promise<void> {
  await context.db.$client.query(
    "insert into setup_step (step, state) select unnest($1::text[]), 'done' on conflict (step) do update set state = 'done', detail = null, updated_at = now()",
    [SETUP_STEPS]
  );

  await context.db.$client.query(
    "insert into tenant_settings default values on conflict do nothing"
  );

  // The seed step writes the two names, the locale and the time zone; the schema has no
  // default for them.
  await context.db.$client.query(
    `insert into tenant_branding (company_name, product_name, default_locale, default_time_zone)
     values ('E2E', 'Genie', 'en', 'UTC') on conflict do nothing`
  );
}
