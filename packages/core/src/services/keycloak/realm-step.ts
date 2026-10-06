import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";

import type { EnvironmentSource } from "../../lib/environment/index.ts";
import {
  type BrandingSeed,
  GENIE_STUDIO_CALLBACK_PATH,
  normalizeGenieStudioUrl,
} from "../../lib/tenant-config/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import {
  loadBrandingSeed,
  loadTenantYaml,
  type SetupConfigFiles,
} from "../setup/config.ts";
import {
  configureDefaultRedirector,
  configureFirstBrokerLogin,
} from "./broker.ts";
import {
  createRealm,
  masterAdminToken,
  realmExists,
  repairClientRedirects,
  type KeycloakTarget,
} from "./client.ts";
import {
  readBootstrapCredentials,
  readKeycloakBase,
  readRealmSecrets,
} from "./environment.ts";
import { normalizeKeycloakUrl } from "./normalize-url.ts";
import {
  buildRealmRepresentation,
  isJsonObject,
  type JsonObject,
  type JsonValue,
  type RealmSmtp,
} from "./representation.ts";
import { parseSmtpUrl } from "./smtp.ts";
import { loadRealmTemplate } from "./templates.ts";

/** What the realm step reads from the raw environment, beside the context's validated values. */
export type RealmStepOptions = {
  readonly source: EnvironmentSource;
  readonly output: (line: string) => void;
};

/**
 * Reads one `realm.overrides.json`. A missing file is a named refusal, because the tenant
 * generator always writes it beside `tenant.yaml` and a silently dropped override would leave the
 * realm weaker than the customer asked for (R-53). A file that is not a JSON object is refused too.
 */
async function loadRealmOverrides(path: string): Promise<JsonObject> {
  let text: string;

  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    // SAFETY: a Node fs error carries an optional `code`; a thrown non-error is not an ENOENT.
    if ((cause as { code?: string })?.code === "ENOENT") {
      throw new Error(
        `the realm step needs realm.overrides.json at ${path}; the tenant generator writes it beside tenant.yaml`,
        { cause }
      );
    }

    throw cause;
  }

  let parsed: JsonValue;

  try {
    // SAFETY: the file holds JSON, which is exactly a JsonValue.
    parsed = JSON.parse(text) as JsonValue;
  } catch (cause) {
    const detail =
      cause instanceof Error ? cause.message : "it could not be parsed";

    throw new Error(
      `realm.overrides.json at ${path} is not valid JSON: ${detail}`,
      { cause }
    );
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`realm.overrides.json at ${path} must be a JSON object`);
  }

  return parsed;
}

/** The SMTP values the local variant carries, parsed from the mail configuration (R-53, DEC-40). */
function realmSmtp(
  context: TenantContext,
  branding: BrandingSeed
): RealmSmtp | undefined {
  if (
    context.env.mailProvider !== "smtp" ||
    context.env.smtpUrl === undefined
  ) {
    return undefined;
  }

  const from = context.env.mailFrom;

  if (from === undefined) return undefined;

  return {
    ...parseSmtpUrl(context.env.smtpUrl),
    from,
    fromDisplayName: branding.email_sender_name ?? undefined,
    replyTo: branding.email_reply_to ?? undefined,
    replyToDisplayName: branding.email_sender_name ?? undefined,
  };
}

/** Writes the one source of `realm_supports_local_accounts` (R-52, DEC-36 amendment). */
async function writeRealmSupportsLocalAccounts(
  context: TenantContext,
  supports: boolean
): Promise<void> {
  await context.db
    .update(tenantSettings)
    .set({ realmSupportsLocalAccounts: supports })
    .where(sql`true`);
}

/**
 * Repairs the genie-studio client's redirect URIs on a rerun of the realm step (R-49a, R-53). The
 * bootstrap credential carries `manage-clients`, which `genie-admin` never holds, so the realm step
 * is the one place that can write them. The write is idempotent, so a rerun lands the values a
 * failed create or an earlier lack of the field left missing.
 */
function repairGenieStudioRedirects(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  genieStudioUrl: string
): Promise<void> {
  return repairClientRedirects(
    target,
    realm,
    accessToken,
    "genie-studio",
    [`${genieStudioUrl}${GENIE_STUDIO_CALLBACK_PATH}`],
    `${genieStudioUrl}/*`
  );
}

/**
 * The `realm` step (D2-3, R-53): create the realm from the template variant `local_accounts`
 * selects, merged with `realm.overrides.json`, filled with the values core owns, in one
 * `POST /admin/realms`. An existing realm keeps its clients and users and is recorded done, but
 * the brokered flow values and, when `tenant.yaml` sets `genie_studio_url`, the genie-studio
 * client's redirect URIs are repaired on the rerun. The bootstrap credential is read for this step
 * only and is refused before any network call when absent (DEC-37). The built representation holds
 * secrets and is never logged.
 *
 * In client-only mode (`realm: customer`) the customer owns the realm, so this step reads no
 * bootstrap credential, does no work, and answers `skipped` (R-54a); the `clients` step records
 * the address instead (R-54c).
 */
export async function realmStep(
  context: TenantContext,
  files: SetupConfigFiles,
  options: RealmStepOptions
): Promise<"skipped" | undefined> {
  const tenant = await loadTenantYaml(files.tenantConfig);
  const branding = await loadBrandingSeed(files.brandingSeed);

  const [settings] = await context.db.select().from(tenantSettings).limit(1);

  if ((settings?.realmMode ?? "managed") === "customer") {
    options.output(
      "realm step: client-only mode; the customer's realm is used and nothing is created"
    );

    return "skipped";
  }

  const base = readKeycloakBase(options.source);
  const bootstrap = readBootstrapCredentials(options.source);
  const secrets = readRealmSecrets(options.source);

  const localAccounts = tenant.local_accounts ?? false;
  const template = loadRealmTemplate(localAccounts);
  const overrides = await loadRealmOverrides(files.realmOverrides);
  const smtp = realmSmtp(context, branding);

  // R-49a: the genie-studio origin tenant.yaml carries, normalized once here. Unset leaves the
  // genie-studio client with no redirect URIs.
  const genieStudioUrl =
    tenant.genie_studio_url === undefined
      ? undefined
      : normalizeGenieStudioUrl(tenant.genie_studio_url);

  if (localAccounts && smtp === undefined) {
    throw new Error(
      "the local-accounts realm needs MAIL_PROVIDER=smtp with MAIL_FROM and SMTP_URL, because Keycloak sends its own set-password, reset-password and verify-email messages; set them in .env"
    );
  }

  const representation = buildRealmRepresentation(template, overrides, {
    realm: base.keycloakRealm,
    displayName: branding.company_name,
    publicUrl: context.env.publicUrl,
    clientSecret: secrets.clientSecret,
    adminClientSecret: secrets.adminClientSecret,
    genieStudioUrl,
    smtp,
  });

  const target: KeycloakTarget = {
    baseUrl: normalizeKeycloakUrl(base.keycloakUrl),
    fetch: globalThis.fetch,
  };

  const accessToken = await masterAdminToken(
    target,
    bootstrap.user,
    bootstrap.password
  );

  if (await realmExists(target, base.keycloakRealm, accessToken)) {
    // R-53: an existing realm keeps its clients and users, but the brokered flow values and, when
    // `genie_studio_url` is set, the genie-studio client's redirect URIs are repaired here. Every
    // write is idempotent, so a rerun after a failed write (a Keycloak restart between the create
    // and the writes, for example) lands the values it was missing.
    if (!localAccounts) {
      await configureDefaultRedirector(target, base.keycloakRealm, accessToken);
      await configureFirstBrokerLogin(target, base.keycloakRealm, accessToken);
    }

    if (genieStudioUrl !== undefined) {
      await repairGenieStudioRedirects(
        target,
        base.keycloakRealm,
        accessToken,
        genieStudioUrl
      );
    }

    await writeRealmSupportsLocalAccounts(context, localAccounts);

    options.output(
      genieStudioUrl === undefined
        ? `realm step: realm "${base.keycloakRealm}" already exists; clients and users left unchanged`
        : `realm step: realm "${base.keycloakRealm}" already exists; genie-studio's redirect URIs repaired`
    );

    return;
  }

  await createRealm(target, accessToken, representation);

  // R-58: the brokered variant's browser flow sends a person straight to the customer's identity
  // provider. The flow write needs `manage-realm`, which `genie-admin` deliberately never holds, and
  // this step already carries the bootstrap credential, so the default alias is set here once, at
  // realm creation. `genie-ops idp set` later writes the provider under the same fixed alias. The
  // local-accounts variant has no identity provider and keeps no redirector.
  if (!localAccounts) {
    await configureDefaultRedirector(target, base.keycloakRealm, accessToken);
    await configureFirstBrokerLogin(target, base.keycloakRealm, accessToken);
  }

  await writeRealmSupportsLocalAccounts(context, localAccounts);

  options.output(`realm step: realm "${base.keycloakRealm}" created`);
}
