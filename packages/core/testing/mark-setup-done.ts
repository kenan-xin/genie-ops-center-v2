import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { SETUP_STEPS } from "../src/services/setup/index.ts";

/** Test-only stand-in for `genie-ops setup` in fixtures that expect a working app: every known step done. */
export async function markSetupDone(
  context: Pick<TenantContext, "db">
): Promise<void> {
  await context.db.$client.query(
    "insert into setup_step (step, state) select unnest($1::text[]), 'done' on conflict (step) do update set state = 'done', detail = null, updated_at = now()",
    [SETUP_STEPS]
  );
}
