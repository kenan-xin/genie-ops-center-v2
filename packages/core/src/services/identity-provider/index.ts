import type { EnvironmentSource } from "../../lib/environment/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import { BROKER_IDP_ALIAS } from "../keycloak/broker.ts";
import {
  createIdentityProvider,
  createIdentityProviderMapper,
  importIdentityProviderConfig,
  listIdentityProviderMappers,
  type KeycloakTarget,
  serviceAccountToken,
  updateIdentityProvider,
  updateIdentityProviderMapper,
} from "../keycloak/client.ts";
import { readAdminClient, readKeycloakBase } from "../keycloak/environment.ts";
import { normalizeKeycloakUrl } from "../keycloak/normalize-url.ts";
import type { JsonObject } from "../keycloak/representation.ts";

/**
 * `genie-ops idp set`: write the customer's identity provider into the realm under the fixed
 * `company-login` alias and add the Attribute Importer mapper that fills the `groups` user
 * attribute the brokered realm template reads (Spec 2 R-58, R-50). The realm template already
 * names that alias as the browser flow's default redirector, so the command never touches the
 * flow: it runs through the realm-scoped `genie-admin` client with `manage-identity-providers`
 * and `manage-realm` is never needed (`DEC-36`, `DEC-37`). Nothing about the provider is stored in
 * `customers/<slug>/`.
 *
 * LDAP and Active Directory federation is deferred (`docs/specs/02-identity-and-access.md`,
 * Deferred), so this command accepts OIDC and SAML only.
 */

/** The protocols this command writes; LDAP federation is deferred. */
export type IdpProtocol = "oidc" | "saml";

/** Every value `idp set` needs, already parsed from the command line. */
export type IdpSetOptions = {
  readonly source: EnvironmentSource;
  readonly protocol: IdpProtocol;
  /** The fixed alias the realm template's redirector names; only {@link BROKER_IDP_ALIAS} is valid. */
  readonly alias: string;
  /** OIDC: the issuer or discovery URL. */
  readonly issuerUrl: string | undefined;
  /** SAML: the metadata URL. */
  readonly metadataUrl: string | undefined;
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  /** SAML: the service-provider entity id the customer's provider expects. */
  readonly entityId: string | undefined;
  /** The claim (OIDC) or attribute (SAML) that carries group names. */
  readonly groupsClaim: string;
  readonly output: (line: string) => void;
};

/** The default claim or attribute name that carries group names (runbook, "The `groups` claim"). */
export const DEFAULT_GROUPS_CLAIM = "groups";

/** The user attribute the brokered realm template reads as the `groups` claim (R-50). */
export const GROUPS_USER_ATTRIBUTE = "groups";

/** The Keycloak identity-provider factory ids. */
export const IDENTITY_PROVIDER_IDS: Readonly<Record<IdpProtocol, string>> = {
  oidc: "oidc",
  saml: "saml",
};

/** The Attribute Importer mapper provider id per protocol (R-58). */
export const ATTRIBUTE_IMPORTER_IDS: Readonly<Record<IdpProtocol, string>> = {
  oidc: "oidc-user-attribute-idp-mapper",
  saml: "saml-user-attribute-idp-mapper",
};

/**
 * The mapper sync mode. `FORCE` re-evaluates the user attribute on every sign-in, so a sign-in
 * whose claim is empty clears the attribute and the marker rule of `DEC-41` offboards. `IMPORT`
 * or the default `LEGACY` would leave a stale attribute behind, which defeats offboarding.
 */
export const IMPORTER_SYNC_MODE = "FORCE";

/** The name every mapper this command writes carries, so a rerun replaces its own row. */
export const GROUPS_MAPPER_NAME = "groups";

/** The first-broker-login flow every realm carries; a brokered provider names it explicitly. */
const FIRST_BROKER_LOGIN_FLOW = "first broker login";

/** The named cause a client-only deployment refuses `idp set` with (R-58, ADR 0010). */
export const CLIENT_ONLY_REFUSAL =
  "genie-ops idp set is not available in client-only mode, because the realm has no genie-admin service client (ADR 0010)";

/**
 * The discovery document URL Keycloak fetches for an OIDC provider. The operator may pass the
 * issuer or the discovery URL; Keycloak's generic `oidc` factory parses the discovery JSON, so a
 * bare issuer gets the well-known suffix appended.
 */
export function oidcDiscoveryUrl(issuerOrDiscovery: string): string {
  const trimmed = issuerOrDiscovery.replace(/\/+$/, "");

  return trimmed.endsWith("/.well-known/openid-configuration")
    ? trimmed
    : `${trimmed}/.well-known/openid-configuration`;
}

/** The identity provider representation, with the client secret it holds never logged. */
async function providerRepresentation(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  options: IdpSetOptions
): Promise<JsonObject> {
  if (options.protocol === "oidc") {
    if (options.issuerUrl === undefined) {
      throw new Error(
        "idp set --protocol oidc needs an issuer or discovery URL"
      );
    }

    const config = await importIdentityProviderConfig(
      target,
      realm,
      accessToken,
      IDENTITY_PROVIDER_IDS.oidc,
      oidcDiscoveryUrl(options.issuerUrl)
    );

    config.clientId = options.clientId ?? "";
    config.clientSecret = options.clientSecret ?? "";
    config.defaultScope = "openid";

    return {
      alias: options.alias,
      displayName: options.alias,
      providerId: IDENTITY_PROVIDER_IDS.oidc,
      enabled: true,
      trustEmail: true,
      storeToken: false,
      linkOnly: false,
      firstBrokerLoginFlowAlias: FIRST_BROKER_LOGIN_FLOW,
      config,
    };
  }

  if (options.metadataUrl === undefined) {
    throw new Error("idp set --protocol saml needs a metadata URL");
  }

  const config = await importIdentityProviderConfig(
    target,
    realm,
    accessToken,
    IDENTITY_PROVIDER_IDS.saml,
    options.metadataUrl
  );

  // The remote IdP identifies this service provider by the entity id; the customer's provider
  // registers it, and the runbook calls it the reply address. Keycloak's SAML identity-provider
  // config keys the service-provider entity id as `entityId` (the remote IdP's own id is
  // `idpEntityId`, filled by the metadata import).
  config.entityId = options.entityId ?? "";

  return {
    alias: options.alias,
    displayName: options.alias,
    providerId: IDENTITY_PROVIDER_IDS.saml,
    enabled: true,
    trustEmail: true,
    storeToken: false,
    linkOnly: false,
    firstBrokerLoginFlowAlias: FIRST_BROKER_LOGIN_FLOW,
    config,
  };
}

/** The Attribute Importer mapper that copies the named claim or attribute into `groups`. */
export function groupsMapper(options: {
  readonly protocol: IdpProtocol;
  readonly alias: string;
  readonly groupsClaim: string;
}): JsonObject {
  const config: JsonObject = {
    "syncMode": IMPORTER_SYNC_MODE,
    "user.attribute": GROUPS_USER_ATTRIBUTE,
  };

  if (options.protocol === "oidc") {
    config.claim = options.groupsClaim;
  } else {
    config["attribute.name"] = options.groupsClaim;
  }

  return {
    name: GROUPS_MAPPER_NAME,
    identityProviderAlias: options.alias,
    identityProviderMapper: ATTRIBUTE_IMPORTER_IDS[options.protocol],
    config,
  };
}

/** Creates the mapper, or replaces the one a previous run wrote, so `idp set` is idempotent. */
async function upsertGroupsMapper(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  options: IdpSetOptions
): Promise<void> {
  const mapper = groupsMapper(options);

  const existing = (
    await listIdentityProviderMappers(target, realm, accessToken, options.alias)
  ).find(
    (entry) =>
      entry.name === GROUPS_MAPPER_NAME &&
      entry.identityProviderMapper ===
        ATTRIBUTE_IMPORTER_IDS[options.protocol] &&
      entry.id !== undefined
  );

  if (existing?.id !== undefined) {
    await updateIdentityProviderMapper(
      target,
      realm,
      accessToken,
      options.alias,
      existing.id,
      // The update replaces the whole mapper, so the id it is addressed by must be present.
      { ...mapper, id: existing.id }
    );

    return;
  }

  await createIdentityProviderMapper(
    target,
    realm,
    accessToken,
    options.alias,
    mapper
  );
}

/** Reads `realm_mode`; a client-only deployment has no `genie-admin` client (R-58, ADR 0010). */
async function assertManagedRealm(context: TenantContext): Promise<void> {
  const [settings] = await context.db
    .select({ realmMode: tenantSettings.realmMode })
    .from(tenantSettings)
    .limit(1);

  if ((settings?.realmMode ?? "managed") === "customer") {
    throw new Error(CLIENT_ONLY_REFUSAL);
  }
}

/**
 * The work of `genie-ops idp set`. It refuses in client-only mode before any network call, obtains
 * a realm-scoped token for `genie-admin`, writes or replaces the provider under the fixed alias,
 * and upserts the Attribute Importer mapper. The browser flow already defaults to that alias, so
 * no `manage-realm` right is needed. The client secret travels only in the create/update request
 * body and never reaches the output, an audit row or a thrown message.
 */
export async function idpSet(
  context: TenantContext,
  options: IdpSetOptions
): Promise<void> {
  if (options.alias !== BROKER_IDP_ALIAS) {
    throw new Error(
      `idp set writes the provider under the fixed alias "${BROKER_IDP_ALIAS}"; "${options.alias}" is not accepted`
    );
  }

  await assertManagedRealm(context);

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

  const representation = await providerRepresentation(
    target,
    base.keycloakRealm,
    accessToken,
    options
  );

  const outcome = await createIdentityProvider(
    target,
    base.keycloakRealm,
    accessToken,
    representation
  );

  if (outcome === "exists") {
    await updateIdentityProvider(
      target,
      base.keycloakRealm,
      accessToken,
      options.alias,
      representation
    );
  }

  await upsertGroupsMapper(target, base.keycloakRealm, accessToken, options);

  options.output(
    `idp set: realm "${base.keycloakRealm}" brokers to the "${options.alias}" provider (${options.protocol})`
  );
}
