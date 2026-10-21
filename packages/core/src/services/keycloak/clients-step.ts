import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { EnvironmentSource } from "../../lib/environment/index.ts";
import {
  GENIE_STUDIO_CALLBACK_PATH,
  normalizeGenieStudioUrl,
} from "../../lib/tenant-config/index.ts";
import {
  IDENTITY_CALLBACK_PATH,
  type TenantContext,
} from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import { loadTenantYaml, type SetupConfigFiles } from "../setup/config.ts";
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
 * When `tenant.yaml` sets `genie_studio_url`, the realm step filled genie-studio's redirect URI
 * (R-49a, R-53), so this step proves it the same locale-free way it proves `genie-ops-center`'s.
 *
 * In client-only mode (`realm: customer`) the customer's IT imported the two client files into
 * their realm, so there is no `genie-admin` to authenticate with and nothing to verify. This step
 * reads no bootstrap credential and no admin secret, does no network call, records the normalized
 * address setup used (R-54c, so the address guard sees client-only mode), and answers `skipped`
 * (R-54a).
 */
export async function clientsStep(
  context: TenantContext,
  files: SetupConfigFiles,
  options: ClientsStepOptions
): Promise<"skipped" | undefined> {
  const base = readKeycloakBase(options.source);
  const normalized = normalizeKeycloakUrl(base.keycloakUrl);

  const [settings] = await context.db.select().from(tenantSettings).limit(1);

  if ((settings?.realmMode ?? "managed") === "customer") {
    await recordKeycloakUrlAtSetup(context, normalized);

    options.output(
      `clients step: client-only mode; recorded ${normalized} as the Keycloak address and verified nothing`
    );

    return "skipped";
  }

  const tenant = await loadTenantYaml(files.tenantConfig);

  const admin = readAdminClient(options.source);

  const target: KeycloakTarget = {
    baseUrl: normalized,
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

  if (tenant.genie_studio_url === undefined) {
    // No genie-studio URL is configured, so the client keeps no redirect URIs and cannot be probed
    // like a healthy client. Prove it exists without reading the error text's wording or language:
    // a client that exists but refuses the redirect answers different text from a client that does
    // not exist, in the realm's own locale, so the two probes are compared. A disabled genie-studio
    // counts as present: it keeps the same "invalid redirect" answer as an enabled one, so the
    // operator meets it at genie-studio's own sign-in rather than here.
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
  } else {
    // The realm step filled genie-studio's redirect URI from `genie_studio_url`, so prove it the
    // same locale-free way as `genie-ops-center`: a healthy client redirects to that URI with
    // `error=login_required`. This also proves the client still exists.
    const expectedStudioRedirect = `${normalizeGenieStudioUrl(tenant.genie_studio_url)}${GENIE_STUDIO_CALLBACK_PATH}`;

    const studio = await probeAuthorization(
      target,
      base.keycloakRealm,
      "genie-studio",
      expectedStudioRedirect
    );

    if (!isHealthyAuthorization(studio, expectedStudioRedirect)) {
      throw new Error(
        `the genie-studio client is missing its redirect URI "${expectedStudioRedirect}" in realm "${base.keycloakRealm}" (the authorization endpoint answered status ${studio.status})`
      );
    }
  }

  await recordKeycloakUrlAtSetup(context, normalized);

  options.output(
    `clients step: verified genie-ops-center, genie-studio and genie-admin in realm "${base.keycloakRealm}"`
  );
}

/** Writes the normalized address setup used, the one value the R-54c guard compares (R-54c). */
async function recordKeycloakUrlAtSetup(
  context: TenantContext,
  normalizedUrl: string
): Promise<void> {
  await context.db
    .update(tenantSettings)
    .set({ keycloakUrlAtSetup: normalizedUrl })
    .where(sql`true`);
}
