import type { TenantContext } from "../src/lib/tenant-context/index.ts";

/** Test-only stand-in for `genie-ops setup` in fixtures that expect a working app. */
export async function markSetupDone(
  context: Pick<TenantContext, "db">
): Promise<void> {
  await context.db.$client.query(
    "insert into setup_step (step, state) values ('migrations', 'done'), ('seed', 'done') on conflict (step) do update set state = 'done', detail = null, updated_at = now()"
  );
}
