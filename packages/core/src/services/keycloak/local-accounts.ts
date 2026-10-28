import { sql } from "drizzle-orm";
import { cloneDeep } from "es-toolkit";
import { z } from "zod";

import type { EnvironmentSource } from "../../lib/environment/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import { BROKER_IDP_ALIAS, clearDefaultRedirector } from "./broker.ts";
import {
  type KeycloakTarget,
  masterAdminToken,
  readIdentityProvider,
  readRealm,
  readRequiredAction,
  updateRealm,
  updateRequiredAction,
} from "./client.ts";
import { readBootstrapCredentials, readKeycloakBase } from "./environment.ts";
import { normalizeKeycloakUrl } from "./normalize-url.ts";
import { assertManagedRealm } from "./realm-mode.ts";
import {
  fillSmtpServer,
  isJsonObject,
  type JsonObject,
} from "./representation.ts";
import { REALM_SMTP_REFUSAL, realmSmtp } from "./smtp.ts";
import { loadRealmTemplate } from "./templates.ts";

/**
 * `genie-ops realm local-accounts enable` (Spec 2 R-58a, `DEC-36` as amended 2026-10-27): a
 * brokered realm also holds local email and password accounts beside its identity provider. The
 * flow write needs `manage-realm`, so the command runs with the bootstrap credential (`DEC-37`).
 * It keeps the realm's one `groups` mapper, the User Attribute mapper, and adds no Group
 * Membership mapper (R-50 as amended). It never writes `emailTheme` (`DEC-40`).
 */

/**
 * One `--sso-domain` value (R-58a): a lower-case domain name of at least two labels, with no `@`
 * and no trailing dot. `z.hostname()` alone accepts `Company.example`, `company.example.` and
 * `company`, and no email domain can equal one of those after the R-40b lower-casing.
 */
export const SSO_DOMAIN = z.hostname().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);

export const LOCAL_ACCOUNTS_CLIENT_ONLY_REFUSAL =
  "genie-ops realm local-accounts enable is not available in client-only mode, because the realm belongs to the customer (ADR 0010)";

export const NO_PROVIDER_REFUSAL = `the realm holds no identity provider under "${BROKER_IDP_ALIAS}"; run genie-ops idp set first`;

const COMMAND = "genie-ops realm local-accounts enable";

/** The optional authenticator-app required action of the local variant (R-58a step 2). */
const CONFIGURE_TOTP = "CONFIGURE_TOTP";

export type EnableLocalAccountsOptions = {
  readonly source: EnvironmentSource;
  readonly ssoDomains: readonly string[];
  readonly output: (line: string) => void;
};

/**
 * The realm settings of the local variant (R-58a step 2). The realm keeps its own password policy
 * when it has one, a `realm.overrides.json` value from realm creation, so a stricter customer rule
 * is never weakened.
 */
function localRealmSettings(
  current: JsonObject,
  smtp: NonNullable<ReturnType<typeof realmSmtp>>
): JsonObject {
  const template = loadRealmTemplate(true);
  const smtpServer = cloneDeep(template.smtpServer);

  if (smtpServer === undefined || !isJsonObject(smtpServer)) {
    throw new Error("the local realm template carries no smtpServer block");
  }

  fillSmtpServer(smtpServer, smtp);

  const ownPolicy = current.passwordPolicy;

  return {
    verifyEmail: template.verifyEmail ?? true,
    resetPasswordAllowed: template.resetPasswordAllowed ?? true,
    passwordPolicy:
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a realm JSON value is a string or not.
      typeof ownPolicy === "string" && ownPolicy !== ""
        ? ownPolicy
        : (template.passwordPolicy ?? ""),
    smtpServer,
  };
}

/**
 * The work of the command. Every refusal comes before the first realm write: client-only mode,
 * then the bootstrap credential, the SMTP values and the provider. The runner writes the audit
 * row. The bootstrap password and the SMTP password never reach the output or a thrown message.
 */
export async function enableLocalAccounts(
  context: TenantContext,
  options: EnableLocalAccountsOptions
): Promise<void> {
  await assertManagedRealm(context, LOCAL_ACCOUNTS_CLIENT_ONLY_REFUSAL);

  const base = readKeycloakBase(options.source);
  const bootstrap = readBootstrapCredentials(options.source, COMMAND);

  const branding = await context.branding.get();

  const smtp = realmSmtp(context.env, {
    name: branding.emailSenderName,
    replyTo: branding.emailReplyTo,
  });

  if (smtp === undefined) throw new Error(REALM_SMTP_REFUSAL);

  const target: KeycloakTarget = {
    baseUrl: normalizeKeycloakUrl(base.keycloakUrl),
    fetch: globalThis.fetch,
  };

  const realm = base.keycloakRealm;

  const accessToken = await masterAdminToken(
    target,
    bootstrap.user,
    bootstrap.password
  );

  if (
    (await readIdentityProvider(
      target,
      realm,
      accessToken,
      BROKER_IDP_ALIAS
    )) === undefined
  ) {
    throw new Error(NO_PROVIDER_REFUSAL);
  }

  await clearDefaultRedirector(target, realm, accessToken);

  await updateRealm(
    target,
    realm,
    accessToken,
    localRealmSettings(await readRealm(target, realm, accessToken), smtp)
  );

  const totp = await readRequiredAction(
    target,
    realm,
    accessToken,
    CONFIGURE_TOTP
  );

  await updateRequiredAction(target, realm, accessToken, CONFIGURE_TOTP, {
    ...totp,
    enabled: true,
    defaultAction: false,
  });

  // R-58a step 3: a rerun replaces the list. The administrator's Local accounts switch is theirs.
  await context.db
    .update(tenantSettings)
    .set({
      ssoEmailDomains: [...options.ssoDomains],
      realmSupportsLocalAccounts: true,
    })
    .where(sql`true`);

  options.output(
    `realm local-accounts enable: realm "${realm}" holds local accounts beside "${BROKER_IDP_ALIAS}"; SSO domains: ${options.ssoDomains.join(", ")}`
  );
}
