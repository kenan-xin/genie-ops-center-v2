import type { TenantContext } from "../src/lib/tenant-context/index.ts";

/**
 * A test-only stand-in for the `seed` step (R-20), which does not exist yet. It marks the named
 * modules enabled so a fixture that expects a compiled module to answer is not refused by R-8.
 *
 * `genie-ops setup`'s seed step replaces this once it lands (genie-ops-center-v2-1ia.2); delete
 * this helper then. It lives under `testing/`, outside `src/`, so the D-13 boundary scan does not
 * see it.
 */
export async function enableModules(
  context: Pick<TenantContext, "db">,
  moduleIds: readonly string[]
): Promise<void> {
  await Promise.all(
    moduleIds.map((moduleId) =>
      context.db.$client.query(
        "insert into tenant_module (module_id, enabled) values ($1, true) on conflict (module_id) do update set enabled = true",
        [moduleId]
      )
    )
  );
}
