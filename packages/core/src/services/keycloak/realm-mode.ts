import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";

/**
 * Refuses client-only mode with the caller's named cause (ADR 0010): the customer owns that realm,
 * so no command that writes it may run. It reads `realm_mode` before any credential or network
 * call.
 */
export async function assertManagedRealm(
  context: TenantContext,
  refusal: string
): Promise<void> {
  const [settings] = await context.db
    .select({ realmMode: tenantSettings.realmMode })
    .from(tenantSettings)
    .limit(1);

  if ((settings?.realmMode ?? "managed") === "customer") {
    throw new Error(refusal);
  }
}
