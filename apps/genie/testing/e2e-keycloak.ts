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
 * No client is built here. A stack that only needs discovery to answer gets a bare realm. The
 * stack that signs in gets its realm and its `genie-ops-center` client from the real `genie-ops
 * setup` realm step with the shipped template, so the browser proof exercises the template's
 * redirect URI, PKCE and post-logout values (R-5, R-49a). The realm's one local user is created
 * through the admin API, so the browser signs in on the realm's own login form (brokering to the
 * `company` realm is S2-13).
 */
export const E2E_REALM = "genie";

/** The realm the sign-in stack's setup run creates, apart from the bare realm other stacks use. */
export const E2E_SIGN_IN_REALM = "genie-e2e";

export const E2E_CLIENT_ID = "genie-ops-center";

export const E2E_CLIENT_SECRET = "e2e-ops-center-secret";

export const E2E_ADMIN_CLIENT_SECRET = "e2e-admin-client-secret";

export const E2E_USER_PASSWORD = "e2e-person-password-14";

type RealmUserRepresentation = {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly emailVerified: boolean;
  readonly enabled: boolean;
  readonly attributes?: { readonly groups?: readonly string[] };
};

/**
 * Every browser sign-in uses a realm user no other test signs in at the same moment. The shipped
 * template turns brute-force protection on, and Keycloak then marks a user temporarily disabled
 * when the same user signs in from parallel workers. One user per spec and Playwright project
 * keeps the template unchanged and the proofs independent.
 */
export const E2E_PROJECTS = ["phone", "desktop"] as const;

/** The specs whose signed-in person holds the reader role (`placeholder:read` and module use). */
export const E2E_READER_SPECS = [
  "placeholder",
  "generated",
  "auth",
  "sessions",
] as const;

export type E2eReaderSpec = (typeof E2E_READER_SPECS)[number];

/** The pre-added reader of one spec and project. */
export function e2eReaderEmail(spec: E2eReaderSpec, project: string): string {
  return `e2e.${spec}.${project}@example.com`;
}

/**
 * The sign-out proof's own realm user. Better Auth keeps one id token per account, so a concurrent
 * sign-in of the same person would replace the token the hint is read from, and Keycloak would
 * then ask for a confirmation instead of ending the session.
 */
export function e2eSignOutEmail(project: string): string {
  return `e2e.sign-out.${project}@example.com`;
}

/** A realm user whose email is also a break-glass account's (R-62). */
export function e2eBreakGlassEmail(project: string): string {
  return `e2e.break-glass.${project}@example.com`;
}

export function e2eOnboardingEmail(
  caseName: "admitted" | "refused" | "offboarded",
  project: string
): string {
  return `e2e.onboarding-${caseName}.${project}@example.com`;
}

/** The stand-in's master administrator, which `genie-ops setup` uses as its bootstrap credential. */
export const E2E_BOOTSTRAP_USER = "admin";

export const E2E_BOOTSTRAP_PASSWORD = "admin";

/** The one fixed host port the stand-in Keycloak publishes, the same value its process uses. */
export function standinKeycloakPort(): number {
  return scopedPort(15080);
}

/** The browser-visible, container-reachable Keycloak address (never an internal compose alias). */
export function standinKeycloakUrl(port = standinKeycloakPort()): string {
  return `http://host.docker.internal:${port}`;
}

/** The loopback address the test process uses for admin calls. */
function standinAdminUrl(): string {
  return `http://127.0.0.1:${standinKeycloakPort()}`;
}

export type E2eKeycloak = {
  /** The loopback address the test process uses for admin calls. */
  readonly adminUrl: string;
  /** The address the app and the browser both use; the issuer Keycloak advertises. */
  readonly keycloakUrl: string;
  readonly realm: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly stop: () => Promise<void>;
};

/** A fresh master token for each call: the admin-cli token lives for one minute. */
async function adminToken(adminUrl: string): Promise<string> {
  const response = await fetch(
    `${adminUrl}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: E2E_BOOTSTRAP_USER,
        password: E2E_BOOTSTRAP_PASSWORD,
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

/** One admin API call against the stand-in, with a fresh token. */
async function admin(path: string, init: RequestInit = {}): Promise<Response> {
  const adminUrl = standinAdminUrl();
  const token = await adminToken(adminUrl);

  return fetch(`${adminUrl}/admin${path}`, {
    ...init,
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

/** Creates a bare realm when it is absent; a 409 means a previous run left it in place. */
async function ensureRealm(realm: string): Promise<void> {
  const response = await admin("/realms", {
    method: "POST",
    body: JSON.stringify({ realm, enabled: true, sslRequired: "none" }),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(
      `Creating the tenant realm ${realm} failed with ${response.status}: ${await response.text()}`
    );
  }
}

/**
 * Removes a realm a previous run left, so the setup run's realm step creates it from the template
 * instead of recording an existing realm as done.
 */
export async function deleteRealm(realm: string): Promise<void> {
  const response = await admin(`/realms/${realm}`, { method: "DELETE" });

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Deleting the realm ${realm} failed with ${response.status}`
    );
  }
}

/** Creates a realm user with a password and a verified email. */
export async function createRealmUser(
  realm: string,
  user: { readonly email: string; readonly password: string }
): Promise<void> {
  const response = await admin(`/realms/${realm}/users`, {
    method: "POST",
    body: JSON.stringify({
      username: user.email,
      email: user.email,
      enabled: true,
      emailVerified: true,
      firstName: "E2E",
      lastName: "Person",
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
}

/** The tenant template maps the multivalued `groups` user attribute into the ID token. */
export async function setRealmUserGroups(
  realm: string,
  email: string,
  groups: readonly string[]
): Promise<void> {
  const found = await admin(
    `/realms/${realm}/users?exact=true&email=${encodeURIComponent(email)}`
  );

  // SAFETY: the admin user search answers a JSON list of user representations; only id is read.
  const [person] = (await found.json()) as readonly { readonly id: string }[];

  if (person === undefined)
    throw new Error(`No realm user ${email} in ${realm}`);

  const current = await admin(`/realms/${realm}/users/${person.id}`);

  if (!current.ok)
    throw new Error(
      `Reading realm user ${email} failed with ${current.status}`
    );

  // SAFETY: the admin endpoint answers a Keycloak user representation; the update preserves all
  // existing fields and changes only the mapped groups attribute.
  const representation = (await current.json()) as RealmUserRepresentation;

  const updated = await admin(`/realms/${realm}/users/${person.id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...representation,
      attributes: { ...representation.attributes, groups },
    }),
  });

  if (!updated.ok) {
    throw new Error(
      `Updating realm groups for ${email} failed with ${updated.status}: ${await updated.text()}`
    );
  }

  const readBack = await admin(`/realms/${realm}/users/${person.id}`);

  // SAFETY: only this synthetic test user's multivalued groups attribute is inspected.
  const actual = (await readBack.json()) as RealmUserRepresentation;

  if (
    JSON.stringify(actual.attributes?.groups ?? []) !== JSON.stringify(groups)
  ) {
    throw new Error(`Realm groups attribute was not stored for ${email}`);
  }
}

/** Allow the test administrator to set the brokered mapper's multivalued groups attribute. */
export async function allowE2eRealmGroupsAttribute(
  realm: string
): Promise<void> {
  const current = await admin(`/realms/${realm}/users/profile`);

  if (!current.ok)
    throw new Error(`Reading realm user profile failed with ${current.status}`);

  // SAFETY: the admin endpoint returns the full user-profile configuration; every existing field
  // is preserved, and only the unmanaged attribute policy changes for this disposable test realm.
  const profile = (await current.json()) as {
    readonly attributes?: readonly { readonly name: string }[];
  };

  const updated = await admin(`/realms/${realm}/users/profile`, {
    method: "PUT",
    body: JSON.stringify({
      ...profile,
      unmanagedAttributePolicy: "ADMIN_EDIT",
    }),
  });

  if (!updated.ok) {
    throw new Error(
      `Updating realm user profile failed with ${updated.status}: ${await updated.text()}`
    );
  }
}

/** The ids of one user's realm sessions, so a sign-out proof can see its own session end. */
export async function realmSessionIds(
  realm: string,
  email: string
): Promise<readonly string[]> {
  const found = await admin(
    `/realms/${realm}/users?exact=true&email=${encodeURIComponent(email)}`
  );

  // SAFETY: the admin user search answers a JSON list of user representations; only `id` is read.
  const [person] = (await found.json()) as readonly { readonly id: string }[];

  if (person === undefined)
    throw new Error(`No realm user ${email} in ${realm}`);

  const sessions = await admin(`/realms/${realm}/users/${person.id}/sessions`);

  // SAFETY: the sessions endpoint answers a JSON list of session representations; only `id` is read.
  return ((await sessions.json()) as readonly { readonly id: string }[]).map(
    (session) => session.id
  );
}

export async function startE2eKeycloak(
  input: {
    readonly realm?: string;
    /**
     * False for the stack whose setup run creates the realm from the template; any realm a
     * previous run left under that name is removed first.
     */
    readonly createRealm?: boolean;
    readonly standins?: IdentityStandins;
  } = {}
): Promise<E2eKeycloak> {
  // The caller may own a stand-in stack already (the integration layer starts one once); otherwise
  // this borrows one and stops it with the realm.
  const standins = input.standins ?? (await startIdentityStandins());
  const ownsStandins = input.standins === undefined;
  const realm = input.realm ?? E2E_REALM;

  if (input.createRealm === false) await deleteRealm(realm);
  else await ensureRealm(realm);

  // The app reaches the issuer through the same browser-visible address (the container's
  // extra_hosts alias), so the address it is configured with is `keycloakIssuer`.
  return {
    adminUrl: standins.keycloakUrl,
    keycloakUrl: standins.keycloakIssuer,
    realm,
    clientId: E2E_CLIENT_ID,
    clientSecret: E2E_CLIENT_SECRET,
    stop: async () => {
      if (ownsStandins) await standins.stop();
    },
  };
}
