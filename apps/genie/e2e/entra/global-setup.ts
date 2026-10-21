import { startEntraStack, stopEntraStack } from "./stack.ts";
import { ENTRA_SECRET, entraTenantFromEnv } from "./tenant.ts";

/** Starts the Entra stack only when the tenant secret is present; otherwise the suite skips. */
export default async function globalSetup(): Promise<void> {
  const tenant = entraTenantFromEnv();

  if (tenant === undefined) {
    console.log(`${ENTRA_SECRET} is not set: the Entra suite skips.`);

    return;
  }

  try {
    await startEntraStack(tenant);
  } catch (error) {
    await stopEntraStack();

    throw error;
  }
}
