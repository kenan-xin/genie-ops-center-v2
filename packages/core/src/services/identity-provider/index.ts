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
  readIdentityProvider,
  serviceAccountToken,
  updateIdentityProvider,
  updateIdentityProviderMapper,
} from "../keycloak/client.ts";
import {
  readAdminClient,
  readIdpClientSecret,
  readKeycloakBase,
} from "../keycloak/environment.ts";
import { normalizeKeycloakUrl } from "../keycloak/normalize-url.ts";
import type { JsonObject } from "../keycloak/representation.ts";

/**
 * `genie-ops idp set`: write the customer's identity provider into the realm under the fixed
 * `company-login` alias and add the Attribute Importer mappers that fill the `groups` user
 * attribute (and, for SAML, `email`, `firstName` and `lastName`) the brokered realm reads
 * (Spec 2 R-58, R-50). The realm step sets that alias as the browser flow's default redirector and
 * turns off the profile review, so the command never touches the flow: it runs through the
 * realm-scoped `genie-admin` client with `manage-identity-providers` and `manage-realm` is never
 * needed (`DEC-36`, `DEC-37`). Nothing about the provider is stored in `customers/<slug>/`.
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
  /** The fixed alias the realm step's redirector names; only {@link BROKER_IDP_ALIAS} is valid. */
  readonly alias: string;
  /** OIDC: the issuer or discovery URL. */
  readonly issuerUrl: string | undefined;
  /** SAML: the metadata URL. */
  readonly metadataUrl: string | undefined;
  readonly clientId: string | undefined;
  /** SAML: the service-provider entity id the customer's provider expects. */
  readonly entityId: string | undefined;
  /** The claim (OIDC) or attribute (SAML) that carries group names. */
  readonly groupsClaim: string;
  /** SAML: the attribute that carries the person's email. */
  readonly emailAttribute: string;
  /** SAML: the attribute that carries the person's first name. */
  readonly firstNameAttribute: string;
  /** SAML: the attribute that carries the person's last name. */
  readonly lastNameAttribute: string;
  readonly output: (line: string) => void;
};

/** The default claim or attribute name that carries group names (runbook, "The `groups` claim"). */
export const DEFAULT_GROUPS_CLAIM = "groups";

/** The default SAML attribute names a real provider sends (runbook, "Add the customer's identity provider"). */
export const DEFAULT_EMAIL_ATTRIBUTE = "email";

export const DEFAULT_FIRST_NAME_ATTRIBUTE = "firstName";

export const DEFAULT_LAST_NAME_ATTRIBUTE = "lastName";

/** The user attribute the brokered realm reads as the `groups` claim (R-50). */
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
 * Parses and checks the issuer or metadata URL `idp set` was given (R-58). It is called from the
 * command parser, before any context or audit row, so a URL that carries a username or password is
 * refused as a parse failure and never reaches `audit_event`. HTTPS is required unless the operator
 * passes `--allow-http` for a local or test provider, so a network attacker between Keycloak and
 * the provider cannot swap the metadata that decides which tokens are trusted. The flag is an
 * explicit command-line choice, kept in the audit row, rather than a runtime mode the production
 * build constant-folds away.
 */
export function assertIdpUrl(value: string, allowHttp: boolean): string {
  if (!URL.canParse(value)) {
    throw new Error("the issuer or metadata URL must be a URL");
  }

  const url = new URL(value);

  if (url.username !== "" || url.password !== "") {
    throw new Error(
      "the issuer or metadata URL must not carry a username or password"
    );
  }

  if (!allowHttp && url.protocol !== "https:") {
    throw new Error(
      "the issuer or metadata URL must be https; pass --allow-http only for a local or test provider"
    );
  }

  return value;
}

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
    config.clientSecret = readIdpClientSecret(options.source);
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

/** One Attribute Importer mapper, keyed by the user attribute it fills. */
export function attributeImporter(options: {
  readonly protocol: IdpProtocol;
  readonly alias: string;
  readonly attributeName: string;
  readonly userAttribute: string;
}): JsonObject {
  const config: JsonObject = {
    "syncMode": IMPORTER_SYNC_MODE,
    "user.attribute": options.userAttribute,
  };

  if (options.protocol === "oidc") {
    config.claim = options.attributeName;
  } else {
    config["attribute.name"] = options.attributeName;
  }

  return {
    name: options.userAttribute,
    identityProviderAlias: options.alias,
    identityProviderMapper: ATTRIBUTE_IMPORTER_IDS[options.protocol],
    config,
  };
}

/** The `groups` Attribute Importer, kept as its own export for the unit test. */
export function groupsMapper(options: {
  readonly protocol: IdpProtocol;
  readonly alias: string;
  readonly groupsClaim: string;
}): JsonObject {
  return attributeImporter({
    protocol: options.protocol,
    alias: options.alias,
    attributeName: options.groupsClaim,
    userAttribute: GROUPS_USER_ATTRIBUTE,
  });
}

/**
 * Every mapper `idp set` writes. The `groups` mapper is always there. For SAML the provider is the
 * only source of the person's profile, so `email`, `firstName` and `lastName` are imported too;
 * without an email the tenant realm cannot create the brokered person. OIDC carries those in the
 * id token, so it needs only `groups`.
 */
export function providerMappers(options: {
  readonly protocol: IdpProtocol;
  readonly alias: string;
  readonly groupsClaim: string;
  readonly emailAttribute: string;
  readonly firstNameAttribute: string;
  readonly lastNameAttribute: string;
}): readonly JsonObject[] {
  const mappers = [
    groupsMapper({
      protocol: options.protocol,
      alias: options.alias,
      groupsClaim: options.groupsClaim,
    }),
  ];

  if (options.protocol === "saml") {
    mappers.push(
      attributeImporter({
        protocol: "saml",
        alias: options.alias,
        attributeName: options.emailAttribute,
        userAttribute: "email",
      }),
      attributeImporter({
        protocol: "saml",
        alias: options.alias,
        attributeName: options.firstNameAttribute,
        userAttribute: "firstName",
      }),
      attributeImporter({
        protocol: "saml",
        alias: options.alias,
        attributeName: options.lastNameAttribute,
        userAttribute: "lastName",
      })
    );
  }

  return mappers;
}

/**
 * Creates each mapper, or replaces the one a previous run wrote (matched by name, which is the user
 * attribute it fills). A protocol switch is refused before this runs, so every existing mapper is
 * already the same kind and no stale mapper of the other protocol can exist.
 */
async function upsertMappers(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  options: IdpSetOptions
): Promise<void> {
  const existing = await listIdentityProviderMappers(
    target,
    realm,
    accessToken,
    options.alias
  );

  for (const mapper of providerMappers(options)) {
    const current = existing.find(
      (entry) => entry.name === mapper.name && entry.id !== undefined
    );

    if (current?.id === undefined) {
      // oxlint-disable-next-line no-await-in-loop -- each mapper is its own admin call.
      await createIdentityProviderMapper(
        target,
        realm,
        accessToken,
        options.alias,
        mapper
      );

      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- each mapper is its own admin call.
    await updateIdentityProviderMapper(
      target,
      realm,
      accessToken,
      options.alias,
      current.id,
      { ...mapper, id: current.id }
    );
  }
}

/** The named cause a rerun that changes the protocol under the fixed alias is refused with. */
export function protocolSwitchRefusal(from: string, to: string): string {
  return `idp set cannot switch the "${BROKER_IDP_ALIAS}" provider from ${from} to ${to}: its existing federated links would be lost. Delete the provider in the Keycloak admin console (which also removes its mappers) and run idp set again.`;
}

/**
 * Writes the provider, or updates it in place when the alias already exists. A rerun that changes
 * the protocol is refused, because Keycloak keeps the federated links on the existing provider and
 * gives no way to migrate them to the other protocol.
 */
async function upsertProvider(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  options: IdpSetOptions,
  representation: JsonObject
): Promise<void> {
  const outcome = await createIdentityProvider(
    target,
    realm,
    accessToken,
    representation
  );

  if (outcome === "created") return;

  const existing = await readIdentityProvider(
    target,
    realm,
    accessToken,
    options.alias
  );

  if (
    existing !== undefined &&
    existing.providerId !== representation.providerId
  ) {
    throw new Error(
      protocolSwitchRefusal(
        String(existing.providerId),
        String(representation.providerId)
      )
    );
  }

  await updateIdentityProvider(
    target,
    realm,
    accessToken,
    options.alias,
    representation
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
 * and upserts the Attribute Importer mappers. The realm step already set the browser flow's
 * redirector default and review, so no `manage-realm` right is needed. The client secret is read
 * from `IDP_CLIENT_SECRET` and travels only in the request body: it never reaches the output, an
 * audit row or a thrown message.
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

  await upsertProvider(
    target,
    base.keycloakRealm,
    accessToken,
    options,
    representation
  );

  await upsertMappers(target, base.keycloakRealm, accessToken, options);

  options.output(
    `idp set: realm "${base.keycloakRealm}" brokers to the "${options.alias}" provider (${options.protocol})`
  );
}
