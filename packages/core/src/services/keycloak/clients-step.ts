import { sql } from "drizzle-orm";

import type { EnvironmentSource } from "../../lib/environment/index.ts";
import {
  IDENTITY_CALLBACK_PATH,
  type TenantContext,
} from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import {
  listClients,
  serviceAccountToken,
  type KeycloakTarget,
} from "./client.ts";
import { readAdminClient, readKeycloakBase } from "./environment.ts";
import { normalizeKeycloakUrl } from "./normalize-url.ts";

/** What the clients step reads from the raw environment, beside the context's validated values. */
export type ClientsStepOptions = {
  readonly source: EnvironmentSource;
  readonly output: (line: string) => void;
};

/**
 * The `clients` step (R-54): verify, through the realm-scoped `genie-admin` client, that the
 * three clients exist with the expected redirect URI, then record the Keycloak address setup used
 * (R-54c). `genie-admin` holds no `manage-clients` role, so a missing client is refused by name
 * and the operator reruns the realm step or repairs the realm.
 *
 * In customer mode the clients check is S2-15's work; this step records nothing and does no work
 * there (the `skipped` state lands with S2-15).
 */
export async function clientsStep(
  context: TenantContext,
  options: ClientsStepOptions
): Promise<void> {
  const [settings] = await context.db.select().from(tenantSettings).limit(1);

  if ((settings?.realmMode ?? "managed") === "customer") {
    return;
  }

  const base = readKeycloakBase(options.source);
  const admin = readAdminClient(options.source);

  const target: KeycloakTarget = {
    baseUrl: normalizeKeycloakUrl(base.keycloakUrl),
    fetch: globalThis.fetch,
  };

  const accessToken = await serviceAccountToken(
    target,
    base.keycloakRealm,
    admin.adminClientId,
    admin.adminClientSecret
  );

  const clients = await listClients(target, base.keycloakRealm, accessToken);

  const byClientId = new Map(
    clients.map((client) => [client.clientId, client] as const)
  );

  const expectedRedirect = `${context.env.publicUrl}${IDENTITY_CALLBACK_PATH}`;

  const signIn = byClientId.get("genie-ops-center");

  if (signIn === undefined || !signIn.redirectUris.includes(expectedRedirect)) {
    throw new Error(
      `the genie-ops-center client is missing its redirect URI "${expectedRedirect}" in realm "${base.keycloakRealm}"`
    );
  }

  const missing = ["genie-studio", "genie-admin"].filter(
    (clientId) => byClientId.get(clientId) === undefined
  );

  if (missing.length > 0) {
    throw new Error(
      `realm "${base.keycloakRealm}" is missing the ${missing.join(" and ")} client; genie-admin cannot create clients`
    );
  }

  await context.db
    .update(tenantSettings)
    .set({ keycloakUrlAtSetup: normalizeKeycloakUrl(base.keycloakUrl) })
    .where(sql`true`);

  options.output(
    `clients step: verified genie-ops-center, genie-studio and genie-admin in realm "${base.keycloakRealm}"`
  );
}
