import {
  startIdentityStandins,
  type IdentityStandins,
} from "./identity-standins-process.ts";
import { scopedPort } from "./worktree-scope.ts";

/**
 * A tenant realm in the identity stand-in Keycloak, for the e2e browser proofs (tech plan D2-2).
 *
 * One address rule (Spec 2 R-54c/d): `KEYCLOAK_URL` is the address the browser and the container
 * both use, and Keycloak's `KC_HOSTNAME` is that same address, so the issuer is that address. The
 * stand-in publishes a fixed host port and advertises `host.docker.internal`; the Playwright
 * projects map `host.docker.internal` to `127.0.0.1`, and the app container reaches it through
 * `extra_hosts: host.docker.internal:host-gateway`. No internal compose alias is ever used.
 *
 * The realm and its one local user are created through the Keycloak admin API, so the browser
 * signs in on the realm's own login form (brokering to the `company` realm is S2-13).
 */
export const E2E_REALM = "genie";

export const E2E_CLIENT_ID = "genie-ops-center";

export const E2E_CLIENT_SECRET = "e2e-ops-center-secret";

export const E2E_USER_EMAIL = "e2e.person@example.com";

export const E2E_USER_PASSWORD = "e2e-person-password-14";

const ADMIN_USER = "admin";

const ADMIN_PASSWORD = "admin";

/** The one fixed host port the stand-in Keycloak publishes, the same value its process uses. */
export function standinKeycloakPort(): number {
  return scopedPort(15080);
}

/** The browser-visible, container-reachable Keycloak address (never an internal compose alias). */
export function standinKeycloakUrl(port = standinKeycloakPort()): string {
  return `http://host.docker.internal:${port}`;
}

export type E2eKeycloak = {
  /** The loopback address the test process uses for admin calls. */
  readonly adminUrl: string;
  /** The address the app and the browser both use; the issuer Keycloak advertises. */
  readonly keycloakUrl: string;
  readonly realm: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Creates a realm user with a password and a verified email. */
  readonly createUser: (input: {
    readonly email: string;
    readonly password: string;
    readonly firstName?: string;
    readonly lastName?: string;
  }) => Promise<void>;
  readonly stop: () => Promise<void>;
};

async function adminToken(adminUrl: string): Promise<string> {
  const response = await fetch(
    `${adminUrl}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: ADMIN_USER,
        password: ADMIN_PASSWORD,
      }).toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Keycloak admin token refused with ${response.status}`);
  }

  // SAFETY: this is the token endpoint's documented JSON body, and the assertion below checks the
  // one field this helper reads before using it.
  const body = (await response.json()) as { access_token?: string };

  if (body.access_token === undefined) {
    throw new Error("Keycloak admin token response carried no access_token");
  }

  return body.access_token;
}

/** Creates the realm when it is absent; a 409 means a previous run left it in place. */
async function ensureRealm(
  adminUrl: string,
  token: string,
  realm: string
): Promise<void> {
  const response = await fetch(`${adminUrl}/admin/realms`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      realm,
      enabled: true,
      sslRequired: "none",
      loginWithEmailAllowed: true,
      registrationAllowed: false,
    }),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(
      `Creating the tenant realm ${realm} failed with ${response.status}: ${await response.text()}`
    );
  }
}

async function ensureClient(
  adminUrl: string,
  token: string,
  input: { readonly realm: string; readonly publicUrl: string }
): Promise<void> {
  const response = await fetch(
    `${adminUrl}/admin/realms/${input.realm}/clients`,
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        clientId: E2E_CLIENT_ID,
        enabled: true,
        protocol: "openid-connect",
        publicClient: false,
        secret: E2E_CLIENT_SECRET,
        standardFlowEnabled: true,
        directAccessGrantsEnabled: true,
        redirectUris: [`${input.publicUrl}/api/auth/callback/keycloak`],
        attributes: {
          "pkce.code.challenge.method": "S256",
          // Keycloak 26 carries the post-logout redirect as a client attribute, not a top-level
          // field. R-17 uses the bare PUBLIC_URL as the post_logout_redirect_uri.
          "post.logout.redirect.uris": `${input.publicUrl}/*`,
        },
      }),
    }
  );

  if (!response.ok && response.status !== 409) {
    throw new Error(
      `Creating the ${E2E_CLIENT_ID} client failed with ${response.status}: ${await response.text()}`
    );
  }
}

export async function startE2eKeycloak(input: {
  /** The application's PUBLIC_URL, which the realm client's redirect URI is derived from. */
  readonly publicUrl: string;
  readonly realm?: string;
  readonly standins?: IdentityStandins;
}): Promise<E2eKeycloak> {
  // The caller may own a stand-in stack already (the integration layer starts one once); otherwise
  // this borrows one and stops it with the realm.
  const standins = input.standins ?? (await startIdentityStandins());
  const ownsStandins = input.standins === undefined;
  const adminUrl = standins.keycloakUrl;
  const realm = input.realm ?? E2E_REALM;
  const token = await adminToken(adminUrl);

  await ensureRealm(adminUrl, token, realm);
  await ensureClient(adminUrl, token, { realm, publicUrl: input.publicUrl });

  // The app reaches the issuer through the same browser-visible address (the container's
  // extra_hosts alias), so the address it is configured with is `keycloakIssuer`.
  return {
    adminUrl,
    keycloakUrl: standins.keycloakIssuer,
    realm,
    clientId: E2E_CLIENT_ID,
    clientSecret: E2E_CLIENT_SECRET,
    createUser: async (user) => {
      const response = await fetch(`${adminUrl}/admin/realms/${realm}/users`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: user.email,
          email: user.email,
          enabled: true,
          emailVerified: true,
          firstName: user.firstName ?? "E2E",
          lastName: user.lastName ?? "Person",
          credentials: [
            { type: "password", value: user.password, temporary: false },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Creating the realm user ${user.email} failed with ${response.status}: ${await response.text()}`
        );
      }
    },
    stop: async () => {
      if (ownsStandins) await standins.stop();
    },
  };
}
