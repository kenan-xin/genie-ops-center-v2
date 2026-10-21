import type { EnvironmentSource } from "../../lib/environment/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { tenantSettings } from "../../schema.ts";
import { normalizeKeycloakUrl } from "./normalize-url.ts";

/**
 * The address guard of Spec 2 R-54c. A stack's realm may live on its own bundled Keycloak, on
 * Genie's shared server, or on the customer's server; `realm_mode` and `keycloak_url_at_setup`
 * record what setup did, and every process that consumes the realm must agree with them. The
 * guard refuses to start on either mismatch, so a stack that was pointed at another server by
 * editing `.env` fails loudly instead of authenticating against the wrong realm.
 *
 * It runs after migrations and before the process serves requests or does its work, reads
 * `tenant_settings` once, and is skipped until setup has written the values: before that the
 * setup gate already refuses sign-in, and there is nothing to compare.
 */

/** The Compose profile that starts a stack's own Keycloak (R-54b). */
export const BUNDLED_KEYCLOAK_PROFILE = "bundled-keycloak";

/**
 * The two named causes of R-54c. `client_only_bundled_keycloak` is client-only mode while the
 * stack runs its own Keycloak; `keycloak_url_mismatch` is a `KEYCLOAK_URL` that is not the
 * address setup used.
 */
export type KeycloakAddressCause =
  | "client_only_bundled_keycloak"
  | "keycloak_url_mismatch";

/** The fixed message each cause carries; the spec quotes both. */
export const KEYCLOAK_ADDRESS_MESSAGES: Readonly<
  Record<KeycloakAddressCause, string>
> = {
  client_only_bundled_keycloak:
    "client-only mode, but the stack runs its own Keycloak",
  keycloak_url_mismatch: "KEYCLOAK_URL is not the Keycloak that setup used",
};

/** What one comparison answers. A skip is `ok`, because there is nothing to refuse. */
export type KeycloakAddressResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly cause: KeycloakAddressCause;
      readonly message: string;
    };

/** The stored facts the comparison reads; both are nullable so a test can drive the skips. */
export type KeycloakAddressFacts = {
  readonly realmMode: string | null;
  readonly keycloakUrlAtSetup: string | null;
};

/** The environment facts the comparison reads. */
export type KeycloakAddressEnvironment = {
  readonly keycloakUrl: string | undefined;
  readonly stackProfiles: string | undefined;
};

/** A comma-separated Compose profile list, trimmed; an unset or empty value is the empty list. */
export function stackProfiles(value: string | undefined): readonly string[] {
  if (value === undefined) return [];

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * The pure R-54c comparison. It answers `ok` while setup has not written `keycloak_url_at_setup`,
 * because there is no recorded address to compare against yet (R-54c). Once it is written, either
 * cause refuses: client-only mode with the bundled profile active, or a `KEYCLOAK_URL` that is
 * not the address setup recorded. Both sides are compared after the R-54c normalization, so
 * `https://ID.example.com:443/` and `https://id.example.com` agree.
 */
export function keycloakAddressResult(
  facts: KeycloakAddressFacts,
  environment: KeycloakAddressEnvironment
): KeycloakAddressResult {
  if (facts.keycloakUrlAtSetup === null) return { ok: true };

  if (
    facts.realmMode === "customer" &&
    stackProfiles(environment.stackProfiles).includes(BUNDLED_KEYCLOAK_PROFILE)
  ) {
    return {
      ok: false,
      cause: "client_only_bundled_keycloak",
      message: KEYCLOAK_ADDRESS_MESSAGES.client_only_bundled_keycloak,
    };
  }

  if (
    environment.keycloakUrl !== undefined &&
    normalizeKeycloakUrl(environment.keycloakUrl) !==
      normalizeKeycloakUrl(facts.keycloakUrlAtSetup)
  ) {
    return {
      ok: false,
      cause: "keycloak_url_mismatch",
      message: KEYCLOAK_ADDRESS_MESSAGES.keycloak_url_mismatch,
    };
  }

  return { ok: true };
}

/** The refusal the two callers (`bootstrap` and `genie-ops`) surface and log. */
export class KeycloakAddressError extends Error {
  readonly code: KeycloakAddressCause;

  constructor(result: { readonly cause: KeycloakAddressCause }) {
    super(KEYCLOAK_ADDRESS_MESSAGES[result.cause]);
    this.name = "KeycloakAddressError";
    this.code = result.cause;
  }
}

export type KeycloakAddressInput = {
  readonly context: TenantContext;
  readonly source: EnvironmentSource;
};

/** One read of `tenant_settings` for the comparison. A missing row is the pre-setup skip. */
async function readFacts(
  context: TenantContext
): Promise<KeycloakAddressFacts> {
  const [row] = await context.db
    .select({
      realmMode: tenantSettings.realmMode,
      keycloakUrlAtSetup: tenantSettings.keycloakUrlAtSetup,
    })
    .from(tenantSettings)
    .limit(1);

  return {
    realmMode: row?.realmMode ?? null,
    keycloakUrlAtSetup: row?.keycloakUrlAtSetup ?? null,
  };
}

/**
 * The R-54c check a caller may branch on. It reads `tenant_settings` and compares it with
 * `KEYCLOAK_URL` and `STACK_PROFILES` from the environment.
 *
 * A context whose validation profile carries no `KEYCLOAK_URL` (migrate, setup, a worker without
 * an identity consumer) builds no auth member, and the guard has nothing to compare, so it skips
 * without reading the database.
 */
export async function checkKeycloakAddress(
  input: KeycloakAddressInput
): Promise<KeycloakAddressResult> {
  if (input.context.env?.auth === undefined) return { ok: true };

  return keycloakAddressResult(await readFacts(input.context), {
    keycloakUrl: input.context.env.auth.keycloakUrl,
    stackProfiles: input.source.STACK_PROFILES,
  });
}

/**
 * The guard a process calls after migrations and before it serves or works. It throws the named
 * refusal so the process exits with the cause in its log (R-54c).
 */
export async function assertKeycloakAddress(
  input: KeycloakAddressInput
): Promise<void> {
  const result = await checkKeycloakAddress(input);

  if (!result.ok) throw new KeycloakAddressError(result);
}
