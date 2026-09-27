import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { EnvironmentSource } from "../../lib/environment/index.ts";
import {
  IDENTITY_CALLBACK_PATH,
  type TenantContext,
} from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import {
  type AuthorizationProbe,
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
 * True when the authorization probe answers a healthy client: a 302 whose Location is the client's
 * registered redirect URI and carries `error=login_required`, which is what a client with the
 * standard flow on returns for the `prompt=none` probe with no session. A reverse-proxy 302, a
 * foreign Location, `error=unauthorized_client` (standard flow off) and any other answer fail.
 */
function isHealthyAuthorization(
  probe: AuthorizationProbe,
  expectedRedirect: string
): boolean {
  if (probe.status !== 302 || probe.location === undefined) return false;

  if (!probe.location.startsWith(expectedRedirect)) return false;

  if (!URL.canParse(probe.location)) return false;

  return new URL(probe.location).searchParams.get("error") === "login_required";
}

/**
 * The `clients` step (R-54): verify that the three clients exist and refuse with a message that
 * names the missing client when they do not, then record the Keycloak address setup used (R-54c).
 * `genie-admin` holds no client-management role and no `view-clients` role, so the admin client
 * list is not available, and the public authorization endpoint is used instead: `genie-admin`
 * authenticating proves its own client exists, a healthy redirect proves `genie-ops-center`
 * carries the expected redirect URI, and an error text that differs from a probe of a client that
 * cannot exist proves `genie-studio` exists.
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

  // genie-ops-center: a healthy client with no session redirects to its registered redirect URI
  // with `error=login_required`, because the probe asks with `prompt=none`.
  const signIn = await probeAuthorization(
    target,
    base.keycloakRealm,
    "genie-ops-center",
    expectedRedirect
  );

  if (!isHealthyAuthorization(signIn, expectedRedirect)) {
    throw new Error(
      `the genie-ops-center client is missing its redirect URI "${expectedRedirect}" in realm "${base.keycloakRealm}" (the authorization endpoint answered status ${signIn.status})`
    );
  }

  // genie-studio: prove it exists without reading the error text's wording or language. A client
  // that exists but refuses the redirect answers different text from a client that does not exist,
  // in the realm's own locale, so the two probes are compared. A disabled genie-studio counts as
  // present: it keeps the same "invalid redirect" answer as an enabled one, so the operator meets
  // it at genie-studio's own sign-in rather than here.
  const studio = await probeAuthorization(
    target,
    base.keycloakRealm,
    "genie-studio",
    expectedRedirect
  );

  const absent = await probeAuthorization(
    target,
    base.keycloakRealm,
    `genie-probe-${randomUUID()}`,
    expectedRedirect
  );

  if (
    studio.status !== 400 ||
    absent.status !== 400 ||
    studio.errorText === "" ||
    studio.errorText === absent.errorText
  ) {
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
