import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";

import type { EnvironmentSource } from "../../lib/environment/index.ts";
import type { BrandingSeed } from "../../lib/tenant-config/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import {
  loadBrandingSeed,
  loadTenantYaml,
  type SetupConfigFiles,
} from "../setup/config.ts";
import {
  createRealm,
  masterAdminToken,
  realmExists,
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
 * The `realm` step (D2-3, R-53): create the realm from the template variant `local_accounts`
 * selects, merged with `realm.overrides.json`, filled with the values core owns, in one
 * `POST /admin/realms`. An existing realm is left unchanged and recorded done. The bootstrap
 * credential is read for this step only and is refused before any network call when absent
 * (DEC-37). The built representation holds secrets and is never logged.
 *
 * In customer mode the realm is S2-15's work; this step records nothing and does no work there
 * (the `skipped` state lands with S2-15).
 */
export async function realmStep(
  context: TenantContext,
  files: SetupConfigFiles,
  options: RealmStepOptions
): Promise<void> {
  const tenant = await loadTenantYaml(files.tenantConfig);
  const branding = await loadBrandingSeed(files.brandingSeed);

  const [settings] = await context.db.select().from(tenantSettings).limit(1);

  if ((settings?.realmMode ?? "managed") === "customer") {
    return;
  }

  const base = readKeycloakBase(options.source);
  const bootstrap = readBootstrapCredentials(options.source);
  const secrets = readRealmSecrets(options.source);

  const localAccounts = tenant.local_accounts ?? false;
  const template = loadRealmTemplate(localAccounts);
  const overrides = await loadRealmOverrides(files.realmOverrides);
  const smtp = realmSmtp(context, branding);

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
    await writeRealmSupportsLocalAccounts(context, localAccounts);

    options.output(
      `realm step: realm "${base.keycloakRealm}" already exists; left unchanged`
    );

    return;
  }

  await createRealm(target, accessToken, representation);

  await writeRealmSupportsLocalAccounts(context, localAccounts);

  options.output(`realm step: realm "${base.keycloakRealm}" created`);
}
