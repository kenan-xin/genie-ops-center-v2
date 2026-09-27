import type { EnvironmentSource } from "../../lib/environment/index.ts";

/**
 * The Section 2 realm values the realm and clients steps read, taken from the raw environment at
 * step time rather than the Section 0 schema (environment contract, Required). The bootstrap
 * credential belongs to the realm step alone and is refused before any network call, so a stack
 * whose realm step already ran needs none of these.
 */

export type KeycloakBase = {
  readonly keycloakUrl: string;
  readonly keycloakRealm: string;
};

export type BootstrapCredentials = {
  readonly user: string;
  readonly password: string;
};

export type RealmSecrets = {
  readonly clientSecret: string;
  readonly adminClientSecret: string;
};

export type AdminClient = {
  readonly adminClientId: string;
  readonly adminClientSecret: string;
};

/** `KEYCLOAK_URL` and `KEYCLOAK_REALM`, required by both steps in managed mode. */
export function readKeycloakBase(source: EnvironmentSource): KeycloakBase {
  const keycloakUrl = source.KEYCLOAK_URL;
  const keycloakRealm = source.KEYCLOAK_REALM;

  if (keycloakUrl === undefined || keycloakUrl === "") {
    throw new Error(
      "the realm and clients steps need KEYCLOAK_URL; set it in .env"
    );
  }

  if (keycloakRealm === undefined || keycloakRealm === "") {
    throw new Error(
      "the realm and clients steps need KEYCLOAK_REALM; set it in .env"
    );
  }

  return { keycloakUrl, keycloakRealm };
}

/** The one-run bootstrap credential (DEC-37), required by the pending realm step only. */
export function readBootstrapCredentials(
  source: EnvironmentSource
): BootstrapCredentials {
  const user = source.KEYCLOAK_BOOTSTRAP_USER;
  const password = source.KEYCLOAK_BOOTSTRAP_PASSWORD;

  if (
    user === undefined ||
    user === "" ||
    password === undefined ||
    password === ""
  ) {
    throw new Error(
      "the realm step needs KEYCLOAK_BOOTSTRAP_USER and KEYCLOAK_BOOTSTRAP_PASSWORD, passed in the environment of this one command; a rerun after the realm step completed does not need them"
    );
  }

  return { user, password };
}

/** The two client secrets core fills into the realm representation (R-53). */
export function readRealmSecrets(source: EnvironmentSource): RealmSecrets {
  const clientSecret = source.KEYCLOAK_CLIENT_SECRET;
  const adminClientSecret = source.KEYCLOAK_ADMIN_CLIENT_SECRET;

  if (clientSecret === undefined || clientSecret === "") {
    throw new Error(
      "the realm step needs KEYCLOAK_CLIENT_SECRET; set it in .env"
    );
  }

  if (adminClientSecret === undefined || adminClientSecret === "") {
    throw new Error(
      "the realm step needs KEYCLOAK_ADMIN_CLIENT_SECRET; set it in .env"
    );
  }

  return { clientSecret, adminClientSecret };
}

/** The `genie-admin` service-account client id and secret the clients step authenticates with. */
export function readAdminClient(source: EnvironmentSource): AdminClient {
  const adminClientId = source.KEYCLOAK_ADMIN_CLIENT_ID ?? "genie-admin";
  const adminClientSecret = source.KEYCLOAK_ADMIN_CLIENT_SECRET;

  if (adminClientSecret === undefined || adminClientSecret === "") {
    throw new Error(
      "the clients step needs KEYCLOAK_ADMIN_CLIENT_SECRET; set it in .env"
    );
  }

  return { adminClientId, adminClientSecret };
}
