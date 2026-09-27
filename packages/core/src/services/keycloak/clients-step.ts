import { sql } from "drizzle-orm";

import type { EnvironmentSource } from "../../lib/environment/index.ts";
import {
  IDENTITY_CALLBACK_PATH,
  type TenantContext,
} from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import {
  probeAuthorization,
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

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "it could not be reached";
}

/**
 * The `clients` step (R-54): verify, through the realm-scoped `genie-admin` client, that the
 * three clients exist with the expected redirect URI, then record the Keycloak address setup used
 * (R-54c). `genie-admin` holds no client-management role and no `view-clients` role, so the admin
 * client list is not available: `genie-admin` authenticating proves its own client exists, a 302
 * from the public authorization endpoint proves `genie-ops-center` carries the expected redirect
 * URI, and a found-but-refused redirect proves `genie-studio` exists. A missing client is refused
 * by name.
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

  try {
    await serviceAccountToken(
      target,
      base.keycloakRealm,
      admin.adminClientId,
      admin.adminClientSecret
    );
  } catch (cause) {
    throw new Error(
      `the ${admin.adminClientId} client in realm "${base.keycloakRealm}" could not authenticate: ${messageOf(cause)}`,
      { cause }
    );
  }

  const expectedRedirect = `${context.env.publicUrl}${IDENTITY_CALLBACK_PATH}`;

  const signIn = await probeAuthorization(
    target,
    base.keycloakRealm,
    "genie-ops-center",
    expectedRedirect
  );

  if (signIn.clientNotFound) {
    throw new Error(
      `realm "${base.keycloakRealm}" is missing the genie-ops-center client`
    );
  }

  if (signIn.status !== 302) {
    throw new Error(
      `the genie-ops-center client is missing its redirect URI "${expectedRedirect}" in realm "${base.keycloakRealm}"`
    );
  }

  const studio = await probeAuthorization(
    target,
    base.keycloakRealm,
    "genie-studio",
    expectedRedirect
  );

  if (studio.clientNotFound) {
    throw new Error(
      `realm "${base.keycloakRealm}" is missing the genie-studio client`
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
