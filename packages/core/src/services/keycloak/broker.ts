import {
  authenticationFlowExecutions,
  createExecutionConfig,
  type KeycloakTarget,
  readAuthenticationConfig,
  updateAuthenticationConfig,
} from "./client.ts";
import { isJsonObject } from "./representation.ts";

/**
 * The one brokered identity provider's fixed alias (Spec 2 R-58). The realm template's browser
 * flow names this alias as the default of the identity-provider-redirector at realm creation, and
 * `genie-ops idp set` writes the provider under the same alias. Fixing the alias is what lets
 * `idp set` run with `manage-identity-providers` alone: writing the browser flow needs
 * `manage-realm`, which `genie-admin` deliberately does not hold.
 *
 * Before `idp set` has run, the alias names no provider, so Keycloak shows the realm's own login
 * form instead of redirecting. After `idp set`, the same execution sends a person to the provider.
 */
export const BROKER_IDP_ALIAS = "company-login";

/** The browser flow's redirector authenticator and the config key that names the default. */
export const REDIRECTOR_PROVIDER_ID = "identity-provider-redirector";

export const REDIRECTOR_DEFAULT_PROVIDER = "defaultProvider";

/**
 * Points the browser flow's identity-provider-redirector at the fixed alias. The realm step calls
 * this at realm creation with the bootstrap credential; a realm created before this change lacks
 * the config and the runbook tells the operator how to add it once. An execution with no config
 * gets one created; an existing config keeps its other values and only the default changes.
 */
export async function configureDefaultRedirector(
  target: KeycloakTarget,
  realm: string,
  accessToken: string,
  alias: string = BROKER_IDP_ALIAS
): Promise<void> {
  const executions = await authenticationFlowExecutions(
    target,
    realm,
    accessToken,
    "browser"
  );

  const redirector = executions.find(
    (execution) => execution.providerId === REDIRECTOR_PROVIDER_ID
  );

  if (redirector === undefined) {
    throw new Error(
      "the realm's browser flow has no identity-provider-redirector execution to set"
    );
  }

  if (redirector.authenticationConfig === undefined) {
    await createExecutionConfig(target, realm, accessToken, redirector.id, {
      alias: "Identity Provider Redirector",
      config: { [REDIRECTOR_DEFAULT_PROVIDER]: alias },
    });

    return;
  }

  const current = await readAuthenticationConfig(
    target,
    realm,
    accessToken,
    redirector.authenticationConfig
  );

  const existing =
    current.config !== undefined && isJsonObject(current.config)
      ? current.config
      : {};

  await updateAuthenticationConfig(
    target,
    realm,
    accessToken,
    redirector.authenticationConfig,
    {
      ...current,
      config: { ...existing, [REDIRECTOR_DEFAULT_PROVIDER]: alias },
    }
  );
}

/** The first-broker-login flow's review-profile execution and its update-policy config key. */
export const REVIEW_PROFILE_PROVIDER_ID = "idp-review-profile";

export const REVIEW_PROFILE_UPDATE = "update.profile.on.first.login";

/**
 * Sets the first-broker-login flow to skip the profile review. The identity provider is the source
 * of truth for a brokered person's profile, so the realm has nothing to review; without this a
 * provider that sends no email (a plain SAML assertion, for example) stops the person on a Keycloak
 * review form instead of completing sign-in. Written with the bootstrap credential at realm
 * creation, like the redirector default.
 */
export async function configureFirstBrokerLogin(
  target: KeycloakTarget,
  realm: string,
  accessToken: string
): Promise<void> {
  const executions = await authenticationFlowExecutions(
    target,
    realm,
    accessToken,
    "first broker login"
  );

  const review = executions.find(
    (execution) => execution.providerId === REVIEW_PROFILE_PROVIDER_ID
  );

  if (review === undefined) return;

  if (review.authenticationConfig === undefined) {
    await createExecutionConfig(target, realm, accessToken, review.id, {
      alias: "Review Profile",
      config: { [REVIEW_PROFILE_UPDATE]: "off" },
    });

    return;
  }

  const current = await readAuthenticationConfig(
    target,
    realm,
    accessToken,
    review.authenticationConfig
  );

  const existing =
    current.config !== undefined && isJsonObject(current.config)
      ? current.config
      : {};

  await updateAuthenticationConfig(
    target,
    realm,
    accessToken,
    review.authenticationConfig,
    {
      ...current,
      config: { ...existing, [REVIEW_PROFILE_UPDATE]: "off" },
    }
  );
}
