import { type JsonObject } from "@genie/core";

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

/**
 * The provisioning password the global setup writes onto every break-glass account, so the browser
 * proof can sign in and then replace it (R-57, R-62 to R-65). The real `break_glass` step prints
 * its own generated value; this test-only value is hashed with the app's hasher and written by SQL.
 */
export const E2E_BREAK_GLASS_PASSWORD = "e2e-break-glass-password-14";

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

/**
 * The specs whose signed-in person holds the reader role (`placeholder:read`, module use, and
 * `core:audit:read` for the audit log's browser proof).
 */
export const E2E_READER_SPECS = [
  "placeholder",
  "generated",
  "auth",
  "sessions",
  "audit",
  "s-a",
  "groups",
  "people",
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

/**
 * The first administrator one Playwright project signs in as (Spec 2 R-56, AC-19). The address is
 * listed in `tenant.yaml`'s `first_administrators`, so `admin_seed` pre-adds the pending person
 * before that project's first realm sign-in activates them.
 */
export function e2eAdministratorEmail(project: string): string {
  return `e2e.admin.${project}@example.com`;
}

export function e2eOnboardingEmail(
  caseName: "admitted" | "refused" | "offboarded",
  project: string
): string {
  return `e2e.onboarding-${caseName}.${project}@example.com`;
}

/**
 * The Groups and Roles proof's own realm users (S2-11). Both carry the same directory claim
 * value: the group a directory group is pre-added for, mapped to a role, so a `jit` sign-in is
 * admitted, and refused once that group is archived.
 */
export function e2eGroupsRolesEmail(
  caseName: "admitted" | "refused",
  project: string
): string {
  return `e2e.groups-roles-${caseName}.${project}@example.com`;
}

/**
 * The directory claim value the S2-11 proof pre-adds and maps. It is scoped to the project,
 * because the phone and desktop projects share one database: a group the phone run archived must
 * not collide with the desktop run's own group.
 */
export function e2eGroupsRolesGroup(project: string): string {
  return `E2E s2-11 mapped ${project}`;
}

/** The stand-in realm that plays the customer's company login (tech plan D2-2). */
export const COMPANY_REALM = "company";

/** The company realm's OIDC client and its secret, the provider `idp set` brokers to. */
export const COMPANY_OIDC_CLIENT_ID = "genie-oidc";

export const COMPANY_OIDC_CLIENT_SECRET = "company-oidc-secret";

/** A company-realm person's email and password, from the imported realm. */
export function companyEmail(name: "alice" | "bob" | "carol"): string {
  return `${name}@company.example`;
}

export function companyPassword(): string {
  return "password";
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

/** The Mailpit stand-in's HTTP API on loopback, for a spec that reads a sent message. */
export function standinMailpitUrl(): string {
  return `http://127.0.0.1:${scopedPort(18025)}`;
}

/** The published SMTP port Mailpit listens on, reachable by a container through the host. */
export function standinSmtpPort(): number {
  return scopedPort(15025);
}

/**
 * The local-accounts scenario S-F. A second e2e stack runs beside the shared brokered one, with
 * `local_accounts: true`, its own realm on the same Keycloak stand-in, and its own database. Its
 * app and browser address is its own scoped port.
 */
export const E2E_LOCAL_REALM = "genie-e2e-local";

/**
 * The S-F app's own host port, in its own band: 3400 is the shared local sign-in stack, 3500 and
 * 3600 are the S2-13 brokered scenarios, so S-F sits at 3700.
 */
export function e2eLocalHostPort(): number {
  return scopedPort(3700);
}

/** The S-F app's browser address. */
export function e2eLocalBaseUrl(): string {
  return `http://127.0.0.1:${e2eLocalHostPort()}`;
}

/** The S-F administrator one Playwright project signs in as, pre-added by `admin_seed`. */
export function e2eLocalAdminEmail(project: string): string {
  return `e2e.local-admin.${project}@example.com`;
}

/** The local-account person the S-F spec adds, project-scoped because both projects share one DB. */
export function e2eLocalPersonEmail(project: string): string {
  return `e2e.local-person.${project}@example.com`;
}

/** A password that meets the local realm's policy (length 14, three classes, not the username). */
export const E2E_LOCAL_PERSON_PASSWORD = "Local-person-Passw0rd!";

/** The S-F administrator's password, which the local realm's stricter policy accepts. */
export const E2E_LOCAL_ADMIN_PASSWORD = "Local-admin-Passw0rd!";

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
  /** The loopback address of the Mailpit stand-in's HTTP API. */
  readonly mailpitUrl: string;
  /** The published SMTP port a container reaches Mailpit on through `host.docker.internal`. */
  readonly smtpPort: number;
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

/**
 * Merges attributes and replaces the redirect URIs of one realm client. Keycloak validates a SAML
 * AuthnRequest's assertion-consumer URL against the client's redirect URIs as well as its ACS
 * attributes, so registering the broker's exact ACS URL needs both.
 */
export async function updateRealmClient(
  realm: string,
  clientId: string,
  update: {
    readonly attributes: Readonly<Record<string, string>>;
    readonly redirectUris: readonly string[];
  }
): Promise<void> {
  const found = await admin(
    `/realms/${realm}/clients?clientId=${encodeURIComponent(clientId)}`
  );

  // SAFETY: the admin client search answers a JSON list of client representations.
  const [client] = (await found.json()) as readonly {
    readonly id: string;
    readonly attributes?: Record<string, string>;
  }[];

  if (client === undefined) {
    throw new Error(`No realm client ${clientId} in ${realm}`);
  }

  const updated = await admin(`/realms/${realm}/clients/${client.id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...client,
      attributes: { ...client.attributes, ...update.attributes },
      redirectUris: update.redirectUris,
    }),
  });

  if (!updated.ok) {
    throw new Error(
      `Updating client ${clientId} in ${realm} failed with ${updated.status}`
    );
  }
}

/**
 * Imports one client representation into a realm, as the customer's IT does in client-only mode
 * (R-54a). A 409 means a previous run already imported it, so the existing client is updated with
 * the current representation; S-C then always tests the shipped file, never a stale one.
 */
export async function importRealmClient(
  realm: string,
  client: JsonObject
): Promise<void> {
  const response = await admin(`/realms/${realm}/clients`, {
    method: "POST",
    body: JSON.stringify(client),
  });

  if (response.ok) return;

  if (response.status !== 409) {
    throw new Error(
      `Importing client ${String(client.clientId)} into ${realm} failed with ${response.status}: ${await response.text()}`
    );
  }

  const found = await admin(
    `/realms/${realm}/clients?clientId=${encodeURIComponent(String(client.clientId))}`
  );

  // SAFETY: the admin client search answers a JSON list of client representations; only `id` is read.
  const [existing] = (await found.json()) as readonly {
    readonly id?: string;
  }[];

  if (existing?.id === undefined) {
    throw new Error(`No realm client ${String(client.clientId)} in ${realm}`);
  }

  const updated = await admin(`/realms/${realm}/clients/${existing.id}`, {
    method: "PUT",
    body: JSON.stringify(client),
  });

  if (!updated.ok) {
    throw new Error(
      `Updating client ${String(client.clientId)} in ${realm} failed with ${updated.status}: ${await updated.text()}`
    );
  }
}

/** The generated secret of one confidential client, as the customer's IT returns it (R-54a). */
export async function realmClientSecret(
  realm: string,
  clientId: string
): Promise<string> {
  const found = await admin(
    `/realms/${realm}/clients?clientId=${encodeURIComponent(clientId)}`
  );

  // SAFETY: the admin client search answers a JSON list of client representations.
  const [match] = (await found.json()) as readonly { readonly id?: string }[];

  if (match?.id === undefined) {
    throw new Error(`No realm client ${clientId} in ${realm}`);
  }

  const client = await admin(`/realms/${realm}/clients/${match.id}`);

  // SAFETY: the admin client endpoint answers a client representation; only `secret` is read.
  const representation = (await client.json()) as { readonly secret?: string };

  if (representation.secret === undefined || representation.secret === "") {
    throw new Error(`Client ${clientId} in ${realm} carries no secret`);
  }

  return representation.secret;
}

/** The fields of an identity provider mapper the tests write. */
export type IdentityProviderMapperInput = {
  readonly name: string;
  readonly identityProviderAlias: string;
  readonly identityProviderMapper: string;
  readonly config: Readonly<Record<string, string>>;
};

/** The fields of a protocol mapper the tests write. */
export type ProtocolMapperInput = {
  readonly name: string;
  readonly protocol: string;
  readonly protocolMapper: string;
  readonly config: Readonly<Record<string, string>>;
};

/** Adds an identity provider mapper when it is absent (a 409 means it is already there). */
export async function addIdentityProviderMapper(
  realm: string,
  alias: string,
  mapper: IdentityProviderMapperInput
): Promise<void> {
  const response = await admin(
    `/realms/${realm}/identity-provider/instances/${encodeURIComponent(alias)}/mappers`,
    { method: "POST", body: JSON.stringify(mapper) }
  );

  if (!response.ok && response.status !== 409) {
    throw new Error(
      `Adding a mapper to ${alias} in ${realm} failed with ${response.status}`
    );
  }
}

/** Adds a protocol mapper to one realm client when it is absent. */ export async function addClientProtocolMapper(
  realm: string,
  clientId: string,
  mapper: ProtocolMapperInput
): Promise<void> {
  const found = await admin(
    `/realms/${realm}/clients?clientId=${encodeURIComponent(clientId)}`
  );

  // SAFETY: the admin client search answers a JSON list of client representations.
  const [client] = (await found.json()) as readonly { readonly id: string }[];

  if (client === undefined) {
    throw new Error(`No realm client ${clientId} in ${realm}`);
  }

  const response = await admin(
    `/realms/${realm}/clients/${client.id}/protocol-mappers/models`,
    { method: "POST", body: JSON.stringify(mapper) }
  );

  if (!response.ok && response.status !== 409) {
    throw new Error(
      `Adding a protocol mapper to ${clientId} in ${realm} failed with ${response.status}`
    );
  }
}

/** Removes a realm user by email when present, so a rerun starts from a clean person. */
export async function deleteRealmUser(
  realm: string,
  email: string
): Promise<void> {
  const found = await admin(
    `/realms/${realm}/users?exact=true&email=${encodeURIComponent(email)}`
  );

  // SAFETY: the admin user search answers a JSON list of user representations.
  const [person] = (await found.json()) as readonly { readonly id: string }[];

  if (person === undefined) return;

  await admin(`/realms/${realm}/users/${person.id}`, { method: "DELETE" });
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

/** The id of one realm group by exact name, or nothing when it does not exist. */
async function realmGroupId(
  realm: string,
  name: string
): Promise<string | undefined> {
  const response = await admin(
    `/realms/${realm}/groups?search=${encodeURIComponent(name)}&exact=true`
  );

  if (!response.ok) {
    throw new Error(
      `Listing groups of ${realm} failed with ${response.status}`
    );
  }

  // SAFETY: the admin groups search answers a JSON list of group representations.
  const body = (await response.json()) as readonly {
    readonly id?: string;
    readonly name?: string;
  }[];

  return body.find((entry) => entry.name === name)?.id;
}

/** Creates a realm group when it is absent and returns its id. */
export async function ensureRealmGroup(
  realm: string,
  name: string
): Promise<string> {
  const existing = await realmGroupId(realm, name);

  if (existing !== undefined) return existing;

  const created = await admin(`/realms/${realm}/groups`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  if (!created.ok && created.status !== 409) {
    throw new Error(
      `Creating group ${name} in ${realm} failed with ${created.status}`
    );
  }

  const id = await realmGroupId(realm, name);

  if (id === undefined) throw new Error(`Group ${name} was not created`);

  return id;
}

/**
 * Replaces a realm user's realm-group memberships with exactly `names`. This is the real claim the
 * company realm's group-membership mapper emits, unlike the user-attribute path the tenant realm
 * uses, so the S2-13 brokering proofs change a company person's groups here.
 */
export async function setRealmUserGroupMemberships(
  realm: string,
  email: string,
  names: readonly string[]
): Promise<void> {
  const found = await admin(
    `/realms/${realm}/users?exact=true&email=${encodeURIComponent(email)}`
  );

  // SAFETY: the admin user search answers a JSON list of user representations.
  const [person] = (await found.json()) as readonly { readonly id: string }[];

  if (person === undefined)
    throw new Error(`No realm user ${email} in ${realm}`);

  const current = await admin(`/realms/${realm}/users/${person.id}/groups`);

  // SAFETY: the memberships endpoint answers a JSON list of group representations.
  const memberships = (await current.json()) as readonly {
    readonly id: string;
  }[];

  for (const membership of memberships) {
    // oxlint-disable-next-line no-await-in-loop -- each removal is its own admin call.
    await admin(`/realms/${realm}/users/${person.id}/groups/${membership.id}`, {
      method: "DELETE",
    });
  }

  for (const name of names) {
    // oxlint-disable-next-line no-await-in-loop -- each join is its own admin call.
    const groupId = await ensureRealmGroup(realm, name);

    // oxlint-disable-next-line no-await-in-loop -- each join is its own admin call.
    const joined = await admin(
      `/realms/${realm}/users/${person.id}/groups/${groupId}`,
      { method: "PUT" }
    );

    if (!joined.ok) {
      throw new Error(
        `Adding ${email} to ${name} in ${realm} failed with ${joined.status}`
      );
    }
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
    mailpitUrl: standins.mailpitUrl,
    smtpPort: standins.smtpPort,
    stop: async () => {
      if (ownsStandins) await standins.stop();
    },
  };
}
