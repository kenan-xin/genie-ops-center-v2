import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EnvironmentSource } from "../src/lib/environment/index.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { auditEvent, groupMember } from "../src/schema.ts";
import { keycloakProviderConfig } from "../src/services/auth/config.ts";
import {
  syncGroupMemberships,
  validateOAuthUser,
} from "../src/services/auth/onboarding.ts";
import { checkKeycloakAddress } from "../src/services/keycloak/address-guard.ts";
import { masterAdminToken } from "../src/services/keycloak/client.ts";
import {
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "../src/services/keycloak/representation.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import {
  readSetupProgress,
  setupSatisfied,
} from "../src/services/setup/index.ts";
import {
  CLIENT_FILE_DIRECTORY,
  insertUser,
  OPS_CENTER_CLIENT_FILE,
  renderClientFile,
  startDisposableDeployment,
  startDisposablePostgres,
  STUDIO_CLIENT_FILE,
} from "./index.ts";
import {
  KEYCLOAK_BOOTSTRAP_PASSWORD,
  KEYCLOAK_BOOTSTRAP_USER,
  startDisposableKeycloak,
  type DisposableKeycloak,
} from "./keycloak.ts";

const cleanups: Array<() => Promise<void>> = [];

let keycloak: DisposableKeycloak | undefined;

beforeAll(async () => {
  keycloak = await startDisposableKeycloak();
}, 180000);

afterAll(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  await keycloak?.stop();
});

type ConfigFiles = {
  readonly tenantConfig: string;
  readonly brandingSeed: string;
  readonly realmOverrides: string;
};

async function configFiles(
  input: {
    readonly realm?: string;
    readonly localAccounts?: boolean;
    readonly genieStudioUrl?: string;
    readonly overrides?: JsonObject;
  } = {}
): Promise<ConfigFiles> {
  const folder = await mkdtemp(join(tmpdir(), "genie-realm-step-"));

  cleanups.push(() => rm(folder, { recursive: true, force: true }));

  const tenantConfig = join(folder, "tenant.yaml");
  const brandingSeed = join(folder, "branding.seed.json");
  const realmOverrides = join(folder, "realm.overrides.json");

  await writeFile(
    tenantConfig,
    [
      "modules: []",
      ...(input.realm === undefined ? [] : [`realm: ${input.realm}`]),
      `local_accounts: ${input.localAccounts === true}`,
      ...(input.genieStudioUrl === undefined
        ? []
        : [`genie_studio_url: ${JSON.stringify(input.genieStudioUrl)}`]),
      "first_administrators:",
      "  - admin@example.invalid",
      "break_glass_email: break-glass@example.invalid",
      "",
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    brandingSeed,
    JSON.stringify({
      $schema: "../../deploy/schemas/branding.seed.schema.json",
      company_name: "Example Group",
      product_name: "Example Ops",
      default_locale: "en",
      default_time_zone: "Europe/Berlin",
    }),
    "utf8"
  );
  await writeFile(
    realmOverrides,
    JSON.stringify(input.overrides ?? {}),
    "utf8"
  );

  return { tenantConfig, brandingSeed, realmOverrides };
}

function source(
  postgresUrl: string,
  realm: string,
  extra: EnvironmentSource = {}
): EnvironmentSource {
  return {
    DATABASE_URL: postgresUrl,
    PUBLIC_URL: "https://genie.example.invalid",
    KEYCLOAK_URL: keycloak!.baseUrl,
    KEYCLOAK_REALM: realm,
    KEYCLOAK_BOOTSTRAP_USER: KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD: KEYCLOAK_BOOTSTRAP_PASSWORD,
    KEYCLOAK_CLIENT_SECRET: "client-secret-value",
    KEYCLOAK_ADMIN_CLIENT_SECRET: "admin-client-secret-value",
    ...extra,
  };
}

function setupArgs(files: ConfigFiles): readonly string[] {
  return [
    "setup",
    "--tenant-config",
    files.tenantConfig,
    "--branding-seed",
    files.brandingSeed,
  ];
}

function runnerOptions(
  env: EnvironmentSource
): Parameters<typeof runGenieOps>[1] {
  return {
    source: env,
    compiledModules: [],
    histories: [],
    output: () => {},
    errorOutput: () => {},
  };
}

/** Signs in to `master` and fetches a full realm representation from the admin API. */
async function adminRealm(realm: string): Promise<JsonObject> {
  const token = await masterAdminToken(
    { baseUrl: keycloak!.baseUrl, fetch: globalThis.fetch },
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD
  );

  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}`,
    {
      headers: { authorization: `Bearer ${token}` },
    }
  );

  // SAFETY: the admin realm endpoint returns a JSON object.
  return (await response.json()) as JsonObject;
}

/** Signs in to `master` and lists the full client representations of a realm. */
async function adminClients(realm: string): Promise<JsonObject[]> {
  const token = await masterAdminToken(
    { baseUrl: keycloak!.baseUrl, fetch: globalThis.fetch },
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD
  );

  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}/clients`,
    {
      headers: { authorization: `Bearer ${token}` },
    }
  );

  const body: unknown = await response.json();

  return Array.isArray(body) ? body.filter(isJsonObject) : [];
}

function clientBy(
  clients: JsonObject[],
  clientId: string
): JsonObject | undefined {
  return clients.find((client) => client.clientId === clientId);
}

function stringAttribute(
  client: JsonObject | undefined,
  name: string
): string | undefined {
  if (client === undefined) return undefined;

  const attributes = client.attributes;

  if (attributes === undefined || !isJsonObject(attributes)) return undefined;

  const value = attributes[name];

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a JSON attribute is a string or not.
  return typeof value === "string" ? value : undefined;
}

function groupsMapper(client: JsonObject | undefined): string | undefined {
  const mappers = client?.protocolMappers;

  if (!Array.isArray(mappers)) return undefined;

  for (const mapper of mappers) {
    if (!isJsonObject(mapper) || mapper.name !== "groups") continue;

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a protocol mapper name is a string or not.
    return typeof mapper.protocolMapper === "string"
      ? mapper.protocolMapper
      : undefined;
  }

  return undefined;
}

function markerMapper(client: JsonObject | undefined): JsonObject | undefined {
  const mappers = client?.protocolMappers;

  if (!Array.isArray(mappers)) return undefined;

  return mappers.find(
    (mapper): mapper is JsonObject =>
      isJsonObject(mapper) && mapper.name === "genie_groups"
  );
}

/** A `master`-realm admin token, for the test's own setup and teardown calls. */
async function masterToken(): Promise<string> {
  return masterAdminToken(
    { baseUrl: keycloak!.baseUrl, fetch: globalThis.fetch },
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD
  );
}

/** A realm-scoped `genie-admin` service-account token, as the running application would hold. */
async function adminClientToken(realm: string): Promise<string> {
  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/realms/${realm}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "genie-admin",
        client_secret: "admin-client-secret-value",
      }).toString(),
    }
  );

  // SAFETY: the token endpoint returns a JSON object with an access_token string.
  return ((await response.json()) as { access_token: string }).access_token;
}

/** The internal id of one client, read with the master token. */
async function clientIdOf(
  realm: string,
  clientId: string
): Promise<string | undefined> {
  const token = await masterToken();

  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers: { authorization: `Bearer ${token}` } }
  );

  const body: unknown = await response.json();
  const found = Array.isArray(body) ? body.find(isJsonObject) : undefined;

  return found === undefined ? undefined : String(found.id);
}

/** Deletes one client, the way a broken realm would be missing it. */
async function deleteClient(realm: string, clientId: string): Promise<void> {
  const token = await masterToken();
  const id = await clientIdOf(realm, clientId);

  if (id === undefined)
    throw new Error(`realm ${realm} has no client ${clientId}`);

  await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}/clients/${id}`,
    { method: "DELETE", headers: { authorization: `Bearer ${token}` } }
  );
}

/** Turns the standard flow off on one client, the way a mis-made client would be. */
async function disableStandardFlow(
  realm: string,
  clientId: string
): Promise<void> {
  const token = await masterToken();
  const client = clientBy(await adminClients(realm), clientId);

  if (client === undefined) {
    throw new Error(`realm ${realm} has no client ${clientId}`);
  }

  await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}/clients/${String(client.id)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ ...client, standardFlowEnabled: false }),
    }
  );
}

/**
 * Replaces one client's redirect URIs and post-logout redirect URI, the shape a realm created
 * before `genie_studio_url` existed would have (an empty list and no attribute).
 */
async function setClientRedirects(
  realm: string,
  clientId: string,
  redirectUris: readonly string[],
  postLogoutRedirectUris: string
): Promise<void> {
  const token = await masterToken();
  const client = clientBy(await adminClients(realm), clientId);

  if (client === undefined) {
    throw new Error(`realm ${realm} has no client ${clientId}`);
  }

  const attributes =
    client.attributes !== undefined && isJsonObject(client.attributes)
      ? client.attributes
      : {};

  attributes["post.logout.redirect.uris"] = postLogoutRedirectUris;

  const updated = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}/clients/${String(client.id)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...client,
        redirectUris: [...redirectUris],
        attributes,
      }),
    }
  );

  if (!updated.ok) {
    throw new Error(
      `setting ${clientId} redirects failed with ${updated.status}`
    );
  }
}

/** The config id of the browser flow's identity-provider-redirector, or undefined when unset. */
async function redirectorConfig(realm: string): Promise<string | undefined> {
  const token = await masterToken();

  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}/authentication/flows/browser/executions`,
    { headers: { authorization: `Bearer ${token}` } }
  );

  const body: unknown = await response.json();
  const executions = Array.isArray(body) ? body.filter(isJsonObject) : [];

  const redirector = executions.find(
    (execution) => execution.providerId === "identity-provider-redirector"
  );

  return redirector?.authenticationConfig === undefined
    ? undefined
    : String(redirector.authenticationConfig);
}

/** One client's secret value, read with the master token. */
async function readClientSecret(
  realm: string,
  clientId: string
): Promise<string | undefined> {
  const token = await masterToken();
  const id = await clientIdOf(realm, clientId);

  if (id === undefined) throw new Error(`realm ${realm} has no ${clientId}`);

  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}/clients/${id}/client-secret`,
    { headers: { authorization: `Bearer ${token}` } }
  );

  // SAFETY: the client-secret endpoint returns a JSON object with a `value` string.
  const body = (await response.json()) as JsonValue;

  if (!isJsonObject(body)) return undefined;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a JSON secret is a string or not.
  return typeof body.value === "string" ? body.value : undefined;
}

/** Every `setup_step` detail joined, for a non-leak assertion on a failed step's cause. */
async function setupStepDetails(postgresUrl: string): Promise<string> {
  const observer = new Client({ connectionString: postgresUrl });

  await observer.connect();

  try {
    const result = await observer.query<{ detail: string | null }>(
      "select detail from setup_step"
    );

    return result.rows.map((row) => row.detail ?? "").join("\n");
  } finally {
    await observer.end();
  }
}

describe("the realm and clients setup steps against a real Keycloak", () => {
  it("creates the brokered realm in one POST with the three clients, PKCE, brute force, the groups mapper and the display name", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles();
    const realm = `brokered-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    const realmRep = await adminRealm(realm);

    expect(realmRep.displayName).toBe("Example Group");
    expect(realmRep.bruteForceProtected).toBe(true);
    expect(realmRep.failureFactor).toBeGreaterThan(0);

    const clients = await adminClients(realm);
    const clientIds = clients.map((client) => client.clientId).toSorted();

    expect(clientIds).toEqual(
      expect.arrayContaining([
        "genie-admin",
        "genie-ops-center",
        "genie-studio",
      ])
    );

    const signIn = clientBy(clients, "genie-ops-center");

    expect(stringAttribute(signIn, "pkce.code.challenge.method")).toBe("S256");
    expect(signIn?.redirectUris).toEqual([
      "https://genie.example.invalid/api/auth/callback/keycloak",
    ]);
    expect(groupsMapper(signIn)).toBe("oidc-usermodel-attribute-mapper");

    // The brokered variant's redirector names the fixed alias, the control for the local case.
    expect(await redirectorConfig(realm)).toBeDefined();

    for (const clientId of ["genie-ops-center", "genie-studio"]) {
      expect(markerMapper(clientBy(clients, clientId))).toMatchObject({
        protocolMapper: "oidc-hardcoded-claim-mapper",
        config: {
          "claim.name": "genie_groups",
          "claim.value": "true",
          "jsonType.label": "boolean",
          "id.token.claim": "true",
          "access.token.claim": "true",
          "userinfo.token.claim": "true",
        },
      });
    }

    await expect(
      observer.query(
        `select realm_supports_local_accounts, keycloak_url_at_setup from tenant_settings`
      )
    ).resolves.toMatchObject({
      rows: [
        {
          realm_supports_local_accounts: false,
          keycloak_url_at_setup: keycloak!.baseUrl,
        },
      ],
    });

    await expect(
      observer.query(
        "select step, state from setup_step where step in ('realm', 'clients')"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "realm", state: "done" },
        { step: "clients", state: "done" },
      ],
    });
  }, 180000);

  it("creates the local-accounts realm with email verification, a password policy, SMTP and the group membership mapper", async () => {
    const postgres = await startDisposablePostgres();
    const files = await configFiles({ localAccounts: true });
    const realm = `local-${process.pid}-${Date.now()}`;

    cleanups.push(() => postgres.stop());

    await expect(
      runGenieOps(
        setupArgs(files),
        runnerOptions(
          source(postgres.url, realm, {
            MAIL_PROVIDER: "smtp",
            MAIL_FROM: "no-reply@example.invalid",
            // A plain smtp URL selects STARTTLS, and the user and password are percent-encoded.
            SMTP_URL:
              "smtp://user%40x:p%2Fq%2Bw%40%25@mail.example.invalid:587",
          })
        )
      )
    ).resolves.toBe(0);

    const realmRep = await adminRealm(realm);

    expect(realmRep.verifyEmail).toBe(true);
    expect(realmRep.passwordPolicy).toEqual(expect.any(String));
    // Keycloak masks the SMTP password in the representation, so it is the unit test that proves
    // the decode; here the host, user, port and transport flags prove the fill ran.
    expect(realmRep.smtpServer).toMatchObject({
      host: "mail.example.invalid",
      port: "587",
      user: "user@x",
      ssl: "false",
      starttls: "true",
    });

    const clients = await adminClients(realm);
    const signIn = clientBy(clients, "genie-ops-center");

    expect(groupsMapper(signIn)).toBe("oidc-group-membership-mapper");

    // AC-4, AC-11, R-50: the local variant carries no identity provider and its browser flow's
    // redirector names no default, so nobody is sent away from the realm's own form.
    expect(realmRep.identityProviders ?? []).toEqual([]);
    expect(await redirectorConfig(realm)).toBeUndefined();

    for (const clientId of ["genie-ops-center", "genie-studio"]) {
      expect(markerMapper(clientBy(clients, clientId))).toMatchObject({
        protocolMapper: "oidc-hardcoded-claim-mapper",
        config: {
          "claim.name": "genie_groups",
          "claim.value": "true",
          "jsonType.label": "boolean",
          "id.token.claim": "true",
          "access.token.claim": "true",
          "userinfo.token.claim": "true",
        },
      });
    }
  }, 180000);

  it("keeps memberships and audits when the test realm has no marker mapper or groups claim", async () => {
    const postgres = await startDisposablePostgres();
    const deployment = await startDisposableDeployment();
    const files = await configFiles();
    const realm = `missing-marker-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await deployment.stop();
      await postgres.stop();
    });

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    const client = clientBy(await adminClients(realm), "genie-ops-center");
    const mapper = markerMapper(client);

    if (client === undefined || mapper?.id === undefined) {
      throw new Error("test realm is missing the marker mapper");
    }

    const token = await masterToken();
    const clientUrl = `${keycloak!.baseUrl}/admin/realms/${realm}/clients/${String(client.id)}`;

    // Direct grants are enabled only in this disposable realm so the test can inspect an ID token.
    const updated = await globalThis.fetch(clientUrl, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ ...client, directAccessGrantsEnabled: true }),
    });

    expect(updated.status).toBe(204);

    const removed = await globalThis.fetch(
      `${clientUrl}/protocol-mappers/models/${String(mapper.id)}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } }
    );

    expect(removed.status).toBe(204);
    expect(
      markerMapper(clientBy(await adminClients(realm), "genie-ops-center"))
    ).toBeUndefined();

    const email = `no-marker-${process.pid}@example.invalid`;

    const created = await globalThis.fetch(
      `${keycloak!.baseUrl}/admin/realms/${realm}/users`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: email,
          email,
          emailVerified: true,
          firstName: "Test",
          lastName: "Person",
          enabled: true,
          credentials: [
            { type: "password", value: "test-only-password", temporary: false },
          ],
        }),
      }
    );

    expect(created.status).toBe(201);

    const signIn = await globalThis.fetch(
      `${keycloak!.baseUrl}/realms/${realm}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: "genie-ops-center",
          client_secret: "client-secret-value",
          username: email,
          password: "test-only-password",
          scope: "openid",
        }),
      }
    );

    expect(signIn.status, JSON.stringify(await signIn.clone().json())).toBe(
      200
    );

    // SAFETY: the token endpoint returned a JWT with a JSON claim set.
    const tokenBody = (await signIn.json()) as { id_token: string };

    // SAFETY: JSON.parse returns a JSON value from the JWT claim set.
    const claims = JSON.parse(
      Buffer.from(tokenBody.id_token.split(".")[1]!, "base64url").toString(
        "utf8"
      )
    ) as JsonValue;

    if (!isJsonObject(claims))
      throw new Error("ID token has no JSON claim set");

    expect(claims.groups).toBeUndefined();
    expect(claims.genie_groups).toBeUndefined();

    const userId = await insertUser(deployment.context);
    await syncGroupMemberships(deployment.context, userId, ["Retained"]);
    const scope = deployment.context.authRequestScope;

    await scope.run(async () => {
      expect(
        await validateOAuthUser({
          tenant: deployment.context,
          scope,
          data: {
            user: { id: userId, email },
            source: { action: "sign-in", oauth: { profile: claims } },
          },
        })
      ).toBeUndefined();
      await syncGroupMemberships(
        deployment.context,
        userId,
        scope.current()?.groups
      );
    });

    expect(
      await deployment.context.db
        .select()
        .from(groupMember)
        .where(
          and(eq(groupMember.userId, userId), eq(groupMember.source, "idp"))
        )
    ).toHaveLength(1);
    expect(
      await deployment.context.db
        .select()
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.actorUserId, userId),
            eq(auditEvent.action, "auth:groups_claim_absent")
          )
        )
    ).toHaveLength(1);
  }, 180000);

  it("leaves an existing realm unchanged and records the step done on a rerun", async () => {
    const postgres = await startDisposablePostgres();
    const files = await configFiles();
    const realm = `rerun-${process.pid}-${Date.now()}`;

    cleanups.push(() => postgres.stop());

    const env = source(postgres.url, realm);

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(env))
    ).resolves.toBe(0);

    const before = await adminRealm(realm);

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(env))
    ).resolves.toBe(0);

    const after = await adminRealm(realm);

    expect(after).toEqual(before);
  }, 180000);

  it("refuses a realm override whose key is outside the allow-list with a named cause", async () => {
    const postgres = await startDisposablePostgres();
    const files = await configFiles({ overrides: { users: [] } });
    const realm = `refused-${process.pid}-${Date.now()}`;

    cleanups.push(() => postgres.stop());

    const output: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(source(postgres.url, realm)),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.not.toBe(0);

    expect(output.join("\n")).toContain("users");
    expect(output.join("\n")).toContain("allow-list");
  }, 180000);

  it("limits the genie-admin service account to its own realm and holds no client-reading role", async () => {
    const postgres = await startDisposablePostgres();
    const files = await configFiles();
    const realm = `scoped-${process.pid}-${Date.now()}`;

    cleanups.push(() => postgres.stop());

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    const token = await adminClientToken(realm);

    // It cannot touch the master realm.
    const master = await globalThis.fetch(
      `${keycloak!.baseUrl}/admin/realms/master/clients`,
      { headers: { authorization: `Bearer ${token}` } }
    );

    expect(master.status).toBe(403);

    // It cannot read any client, even in its own realm: view-clients is not held.
    const own = await globalThis.fetch(
      `${keycloak!.baseUrl}/admin/realms/${realm}/clients`,
      { headers: { authorization: `Bearer ${token}` } }
    );

    expect(own.status).toBe(403);
  }, 180000);

  it("does not let genie-admin create a client or read another client's secret in its own realm", async () => {
    const postgres = await startDisposablePostgres();
    const files = await configFiles();
    const realm = `privilege-${process.pid}-${Date.now()}`;

    cleanups.push(() => postgres.stop());

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    const token = await adminClientToken(realm);

    // Creating a client needs manage-clients, which it does not hold.
    const created = await globalThis.fetch(
      `${keycloak!.baseUrl}/admin/realms/${realm}/clients`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ clientId: "should-not-exist" }),
      }
    );

    expect(created.status).toBe(403);

    // Reading the genie-studio client secret needs view-clients or manage-clients.
    const studioId = await clientIdOf(realm, "genie-studio");

    if (studioId === undefined) throw new Error("genie-studio is missing");

    const secret = await globalThis.fetch(
      `${keycloak!.baseUrl}/admin/realms/${realm}/clients/${studioId}/client-secret`,
      { headers: { authorization: `Bearer ${token}` } }
    );

    expect(secret.status).toBe(403);
  }, 180000);

  it("reuses an existing realm when the realm step has no done row after a crash", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles();
    const realm = `resume-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    const env = source(postgres.url, realm);

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(env))
    ).resolves.toBe(0);

    const before = await adminRealm(realm);

    // The crash between `POST /admin/realms` and the `setup_step` write: the realm is on the
    // server, but the step has no row, so the latch does not skip it.
    await observer.query(
      "delete from setup_step where step in ('realm', 'clients')"
    );

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(env))
    ).resolves.toBe(0);

    const after = await adminRealm(realm);

    expect(after).toEqual(before);

    await expect(
      observer.query(
        "select step, state from setup_step where step in ('realm', 'clients') order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "clients", state: "done" },
        { step: "realm", state: "done" },
      ],
    });
  }, 180000);

  it("never writes the bootstrap password or a client secret to the output or the setup_step detail", async () => {
    const postgres = await startDisposablePostgres();
    const files = await configFiles();
    const realm = `secrets-${process.pid}-${Date.now()}`;

    cleanups.push(() => postgres.stop());

    const clientSecret = `client-secret-${process.pid}`;
    const adminSecret = `admin-secret-${process.pid}`;
    const wrongBootstrap = `wrong-bootstrap-${process.pid}`;

    // A failing run: the wrong bootstrap password must not reach the output or the cause.
    const failedOutput: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(
          source(postgres.url, realm, {
            KEYCLOAK_BOOTSTRAP_PASSWORD: wrongBootstrap,
            KEYCLOAK_CLIENT_SECRET: clientSecret,
            KEYCLOAK_ADMIN_CLIENT_SECRET: adminSecret,
          })
        ),
        output: (line) => failedOutput.push(line),
        errorOutput: (line) => failedOutput.push(line),
      })
    ).resolves.not.toBe(0);

    const failedText = failedOutput.join("\n");

    expect(failedText).not.toContain(wrongBootstrap);
    expect(failedText).not.toContain(clientSecret);
    expect(failedText).not.toContain(adminSecret);
    expect(await setupStepDetails(postgres.url)).not.toContain(wrongBootstrap);

    // A passing run: the real bootstrap password and the two client secrets stay hidden too.
    const passedOutput: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(
          source(postgres.url, realm, {
            KEYCLOAK_CLIENT_SECRET: clientSecret,
            KEYCLOAK_ADMIN_CLIENT_SECRET: adminSecret,
          })
        ),
        output: (line) => passedOutput.push(line),
        errorOutput: (line) => passedOutput.push(line),
      })
    ).resolves.toBe(0);

    const passedText = passedOutput.join("\n");

    expect(passedText).not.toContain(KEYCLOAK_BOOTSTRAP_PASSWORD);
    expect(passedText).not.toContain(clientSecret);
    expect(passedText).not.toContain(adminSecret);
    expect(await setupStepDetails(postgres.url)).not.toContain(clientSecret);
  }, 180000);

  it("refuses and names a missing client", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles();
    const realm = `missing-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    // Remove genie-studio, then rerun only the clients step.
    await deleteClient(realm, "genie-studio");
    await observer.query("delete from setup_step where step = 'clients'");

    const output: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(source(postgres.url, realm)),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.not.toBe(0);

    expect(output.join("\n")).toContain("genie-studio");
  }, 180000);

  it("refuses a missing genie-studio even when the realm error page is not English", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });

    const files = await configFiles({
      overrides: {
        internationalizationEnabled: true,
        supportedLocales: ["de"],
        defaultLocale: "de",
      },
    });

    const realm = `locale-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    // A German realm renders `Client nicht gefunden.`, so a word-based check would pass; the
    // random-client comparison does not.
    await deleteClient(realm, "genie-studio");
    await observer.query("delete from setup_step where step = 'clients'");

    const output: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(source(postgres.url, realm)),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.not.toBe(0);

    expect(output.join("\n")).toContain("genie-studio");
  }, 180000);

  it("refuses when the sign-in client's standard flow is off", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles();
    const realm = `flowoff-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    // With the standard flow off the authorization endpoint still 302s to the redirect URI, but
    // with `error=unauthorized_client`, which the healthy-answer check refuses.
    await disableStandardFlow(realm, "genie-ops-center");
    await observer.query("delete from setup_step where step = 'clients'");

    const output: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(source(postgres.url, realm)),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.not.toBe(0);

    expect(output.join("\n")).toContain("genie-ops-center");
  }, 180000);

  it("resumes after an induced realm step failure", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles();
    const realm = `resume-fail-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    // A wrong bootstrap password fails the realm step.
    await expect(
      runGenieOps(
        setupArgs(files),
        runnerOptions(
          source(postgres.url, realm, {
            KEYCLOAK_BOOTSTRAP_PASSWORD: "wrong",
          })
        )
      )
    ).resolves.not.toBe(0);

    await expect(
      observer.query("select state from setup_step where step = 'realm'")
    ).resolves.toMatchObject({ rows: [{ state: "failed" }] });

    // The right credential resumes and completes the realm and clients steps.
    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    await expect(
      observer.query(
        "select step, state from setup_step where step in ('realm', 'clients') order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "clients", state: "done" },
        { step: "realm", state: "done" },
      ],
    });
  }, 180000);

  it("refuses the realm step before any network call when the bootstrap credential is absent", async () => {
    const postgres = await startDisposablePostgres();
    const files = await configFiles();
    const realm = `no-bootstrap-${process.pid}-${Date.now()}`;

    cleanups.push(() => postgres.stop());

    const output: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(
          source(postgres.url, realm, {
            // Unreachable, so a network call would fail with a connection error and not this.
            KEYCLOAK_URL: "http://127.0.0.1:1",
            KEYCLOAK_BOOTSTRAP_USER: undefined,
            KEYCLOAK_BOOTSTRAP_PASSWORD: undefined,
          })
        ),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.not.toBe(0);

    expect(output.join("\n")).toContain("KEYCLOAK_BOOTSTRAP_USER");
    expect(output.join("\n")).not.toContain("ECONNREFUSED");
    expect(output.join("\n")).not.toContain("fetch failed");
  }, 180000);
});

describe("genie_studio_url fills and repairs genie-studio's redirects (R-49a, R-53)", () => {
  const STUDIO_URL = "https://studio.example.invalid";
  const STUDIO_REDIRECT = `${STUDIO_URL}/api/v1/auth/oidc/callback`;

  const LEGACY_REDIRECT =
    "https://legacy.example.invalid/api/auth/callback/keycloak";

  const LEGACY_POST_LOGOUT = "https://legacy.example.invalid";

  it("fills the two URIs at realm creation and the clients step proves the redirect", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles({ genieStudioUrl: STUDIO_URL });
    const realm = `studio-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    const studio = clientBy(await adminClients(realm), "genie-studio");

    expect(studio?.redirectUris).toEqual([STUDIO_REDIRECT]);
    expect(stringAttribute(studio, "post.logout.redirect.uris")).toBe(
      `${STUDIO_URL}/*`
    );

    // The clients step proved genie-studio's redirect through the public endpoint, so both the
    // realm and clients steps recorded done (R-54).
    await expect(
      observer.query(
        "select step, state from setup_step where step in ('realm', 'clients') order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "clients", state: "done" },
        { step: "realm", state: "done" },
      ],
    });
  }, 180000);

  it("refuses when genie-studio's registered redirect is not the one the field names", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles({ genieStudioUrl: STUDIO_URL });
    const realm = `studio-wrong-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    // A client whose redirect does not match the field, with the realm step already done. The
    // realm step does not rerun, so the client stays wrong and only the clients step can catch it.
    await setClientRedirects(
      realm,
      "genie-studio",
      ["https://wrong.example.invalid/api/v1/auth/oidc/callback"],
      `${STUDIO_URL}/*`
    );
    await observer.query("delete from setup_step where step = 'clients'");

    const output: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(source(postgres.url, realm)),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.not.toBe(0);

    expect(output.join("\n")).toContain("genie-studio");
  }, 180000);

  it("merges genie-studio's redirects on a rerun, keeping existing values, the secret and no duplicates (R-49a, R-53)", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles({ genieStudioUrl: STUDIO_URL });
    const realm = `studio-repair-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    const secretBefore = await readClientSecret(realm, "genie-studio");

    // A realm created before genie_studio_url existed, or a client edited by hand: it carries
    // another deployment's values and lacks the two this field names. Drop the realm and clients
    // rows so the next setup reruns both steps.
    await setClientRedirects(
      realm,
      "genie-studio",
      [LEGACY_REDIRECT],
      LEGACY_POST_LOGOUT
    );
    await observer.query(
      "delete from setup_step where step in ('realm', 'clients')"
    );

    const output: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(source(postgres.url, realm)),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.toBe(0);

    // The repair merges: the legacy values stay and the two new ones are added.
    expect(output.join("\n")).toContain("added genie-studio");

    const repaired = clientBy(await adminClients(realm), "genie-studio");

    expect(repaired?.redirectUris).toEqual([LEGACY_REDIRECT, STUDIO_REDIRECT]);
    expect(stringAttribute(repaired, "post.logout.redirect.uris")).toBe(
      `${LEGACY_POST_LOGOUT}##${STUDIO_URL}/*`
    );
    // The full-representation PUT does not disturb the client secret.
    expect(await readClientSecret(realm, "genie-studio")).toBe(secretBefore);

    // A second rerun of the realm step finds every value already present: nothing is added and no
    // value is duplicated.
    await observer.query("delete from setup_step where step = 'realm'");

    const secondOutput: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(source(postgres.url, realm)),
        output: (line) => secondOutput.push(line),
        errorOutput: (line) => secondOutput.push(line),
      })
    ).resolves.toBe(0);

    expect(secondOutput.join("\n")).toContain("were already present");

    const again = clientBy(await adminClients(realm), "genie-studio");

    expect(again?.redirectUris).toEqual([LEGACY_REDIRECT, STUDIO_REDIRECT]);
    expect(stringAttribute(again, "post.logout.redirect.uris")).toBe(
      `${LEGACY_POST_LOGOUT}##${STUDIO_URL}/*`
    );
  }, 180000);
});

/** Creates a realm and imports client representations, as the customer's IT would (R-54a). */
async function createRealmWithClients(
  realm: string,
  clients: readonly JsonObject[]
): Promise<void> {
  const token = await masterToken();

  const created = await globalThis.fetch(`${keycloak!.baseUrl}/admin/realms`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ realm, enabled: true, sslRequired: "none" }),
  });

  if (!created.ok && created.status !== 409) {
    throw new Error(`creating realm ${realm} failed with ${created.status}`);
  }

  for (const client of clients) {
    // oxlint-disable-next-line no-await-in-loop -- each client is its own admin call.
    const imported = await globalThis.fetch(
      `${keycloak!.baseUrl}/admin/realms/${realm}/clients`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(client),
      }
    );

    if (!imported.ok) {
      // oxlint-disable-next-line no-await-in-loop -- reading the failure body belongs to this call.
      const detail = await imported.text();

      throw new Error(
        `importing client ${String(client.clientId)} into ${realm} failed with ${imported.status}: ${detail}`
      );
    }
  }
}

/** Renders one shipped client file for a deployment URL. */
function renderShipped(file: string, deploymentUrl: string) {
  // `import.meta.dirname` is `packages/core/testing`; three levels up is the repository root,
  // where `deploy/keycloak/` lives.
  const folder = resolve(
    import.meta.dirname,
    "../../..",
    CLIENT_FILE_DIRECTORY
  );

  return renderClientFile(resolve(folder, file), deploymentUrl);
}

/** Turns direct grants on for one client, so a test can inspect an ID token. */
async function enableDirectGrants(
  realm: string,
  clientId: string
): Promise<void> {
  const token = await masterToken();
  const client = clientBy(await adminClients(realm), clientId);

  if (client === undefined)
    throw new Error(`realm ${realm} has no ${clientId}`);

  const updated = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}/clients/${String(client.id)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ ...client, directAccessGrantsEnabled: true }),
    }
  );

  if (!updated.ok) {
    throw new Error(`enabling direct grants on ${clientId} failed`);
  }
}

/** The `aud` claim of an ID token minted by a direct grant, as a list of client ids. */
async function idTokenAudiences(input: {
  readonly realm: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly email: string;
  readonly password: string;
}): Promise<readonly string[]> {
  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/realms/${input.realm}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: input.clientId,
        client_secret: input.clientSecret,
        username: input.email,
        password: input.password,
        scope: "openid",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `direct grant for ${input.email} failed with ${response.status}: ${await response.text()}`
    );
  }

  // SAFETY: the token endpoint returned a JWT with a JSON claim set.
  const body = (await response.json()) as { readonly id_token?: string };

  if (body.id_token === undefined) throw new Error("no ID token in the answer");

  // SAFETY: JSON.parse returns a JSON value from the JWT claim set.
  const claims = JSON.parse(
    Buffer.from(body.id_token.split(".")[1]!, "base64url").toString("utf8")
  ) as JsonValue;

  if (!isJsonObject(claims))
    throw new Error("ID token claims are not an object");

  const aud = claims.aud;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a JWT `aud` is a string or a string list.
  if (typeof aud === "string") return [aud];

  return Array.isArray(aud)
    ? // oxlint-disable-next-line anti-slop/no-runtime-typeof -- each list entry is a string or not.
      aud.filter((value): value is string => typeof value === "string")
    : [];
}

describe("client-only mode against a real Keycloak (R-54a, R-54c)", () => {
  it("skips the realm and clients steps, reads no bootstrap credential, records the address, and lets the guard see client-only mode", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles({ realm: "customer" });
    const realm = `client-only-${process.pid}-${Date.now()}`;
    const deploymentUrl = "https://genie.example.invalid";

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    // The customer's IT creates the realm and imports the two shipped client files.
    await createRealmWithClients(realm, [
      await renderShipped(OPS_CENTER_CLIENT_FILE, deploymentUrl),
      await renderShipped(STUDIO_CLIENT_FILE, deploymentUrl),
    ]);

    const output: string[] = [];

    // No bootstrap credential and no admin client secret at all: client-only mode reads neither.
    const env: EnvironmentSource = {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: deploymentUrl,
      KEYCLOAK_URL: keycloak!.baseUrl,
      KEYCLOAK_REALM: realm,
      KEYCLOAK_CLIENT_SECRET: "client-secret-value",
    };

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(env),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.toBe(0);

    await expect(
      observer.query(
        "select step, state from setup_step where step in ('realm', 'clients') order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "clients", state: "skipped" },
        { step: "realm", state: "skipped" },
      ],
    });

    // R-54c: the skipped clients step still records the normalized address setup used.
    await expect(
      observer.query(
        "select realm_mode, keycloak_url_at_setup, realm_supports_local_accounts from tenant_settings"
      )
    ).resolves.toMatchObject({
      rows: [
        {
          realm_mode: "customer",
          keycloak_url_at_setup: keycloak!.baseUrl,
          realm_supports_local_accounts: false,
        },
      ],
    });

    // Setup created no genie-admin client: the customer owns the realm (R-54a).
    expect(clientBy(await adminClients(realm), "genie-admin")).toBeUndefined();

    // The address the guard reads is now present, so it sees client-only mode and refuses the
    // bundled Keycloak profile (R-54c).
    const applicationContext = createTenantContext(
      {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: deploymentUrl,
        BETTER_AUTH_SECRET: "x".repeat(32),
        KEYCLOAK_URL: keycloak!.baseUrl,
        KEYCLOAK_REALM: realm,
        KEYCLOAK_CLIENT_ID: "genie-ops-center",
        KEYCLOAK_CLIENT_SECRET: "client-secret-value",
      },
      silentLogger(),
      [],
      undefined,
      "application"
    );

    try {
      await expect(
        checkKeycloakAddress({
          context: applicationContext,
          source: { STACK_PROFILES: "bundled-keycloak" },
        })
      ).resolves.toMatchObject({
        ok: false,
        cause: "client_only_bundled_keycloak",
      });
    } finally {
      await applicationContext.db.$client.end();
    }

    expect(output.join("\n")).not.toContain("KEYCLOAK_BOOTSTRAP");
  }, 180000);

  it("writes the recorded address on a rerun of a settled stack whose column is null (R-54c)", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles({ realm: "customer" });
    const realm = `repair-${process.pid}-${Date.now()}`;
    const deploymentUrl = "https://genie.example.invalid";

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    await createRealmWithClients(realm, [
      await renderShipped(OPS_CENTER_CLIENT_FILE, deploymentUrl),
    ]);

    const env: EnvironmentSource = {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: deploymentUrl,
      KEYCLOAK_URL: keycloak!.baseUrl,
      KEYCLOAK_REALM: realm,
      KEYCLOAK_CLIENT_SECRET: "client-secret-value",
    };

    await expect(
      runGenieOps(setupArgs(files), runnerOptions(env))
    ).resolves.toBe(0);

    // A stack whose steps predate the column: settled `skipped`/`done`, address null.
    await observer.query(
      "update tenant_settings set keycloak_url_at_setup = null"
    );

    await expect(
      observer.query(
        "select step, state from setup_step where step in ('realm', 'clients') order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "clients", state: "skipped" },
        { step: "realm", state: "skipped" },
      ],
    });

    await expect(
      observer.query("select keycloak_url_at_setup from tenant_settings")
    ).resolves.toMatchObject({ rows: [{ keycloak_url_at_setup: null }] });

    // The rerun re-runs the settled `clients` step once, only to record the address, and needs no
    // bootstrap credential to do it.
    await expect(
      runGenieOps(setupArgs(files), runnerOptions(env))
    ).resolves.toBe(0);

    await expect(
      observer.query(
        "select state, keycloak_url_at_setup from setup_step, tenant_settings where step = 'clients'"
      )
    ).resolves.toMatchObject({
      rows: [{ state: "skipped", keycloak_url_at_setup: keycloak!.baseUrl }],
    });
  }, 180000);

  it("refuses realm customer together with local_accounts true (R-54a)", async () => {
    const postgres = await startDisposablePostgres();
    const files = await configFiles({ realm: "customer", localAccounts: true });
    const output: string[] = [];

    cleanups.push(() => postgres.stop());

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions({
          DATABASE_URL: postgres.url,
          PUBLIC_URL: "https://genie.example.invalid",
          KEYCLOAK_URL: keycloak!.baseUrl,
          KEYCLOAK_REALM: `refused-${process.pid}`,
        }),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.not.toBe(0);

    expect(output.join("\n")).toContain("local_accounts");
  }, 180000);

  it("imports the two shipped client files as working clients with PKCE, the groups mapper and the marker", async () => {
    const realm = `client-files-${process.pid}-${Date.now()}`;
    const deploymentUrl = "https://genie.example.invalid";

    const opsCenter = await renderShipped(
      OPS_CENTER_CLIENT_FILE,
      deploymentUrl
    );

    const studio = await renderShipped(STUDIO_CLIENT_FILE, deploymentUrl);

    await createRealmWithClients(realm, [opsCenter, studio]);

    const clients = await adminClients(realm);

    for (const clientId of ["genie-ops-center", "genie-studio"]) {
      const client = clientBy(clients, clientId);

      expect(stringAttribute(client, "pkce.code.challenge.method")).toBe(
        "S256"
      );
      expect(groupsMapper(client)).toBe("oidc-group-membership-mapper");
      expect(markerMapper(client)).toMatchObject({
        protocolMapper: "oidc-hardcoded-claim-mapper",
        config: { "claim.name": "genie_groups", "claim.value": "true" },
      });
    }

    expect(clientBy(clients, "genie-ops-center")?.redirectUris).toEqual([
      `${deploymentUrl}/api/auth/callback/keycloak`,
    ]);

    // The public authorization endpoint treats the imported client as a healthy client: the
    // prompt=none probe with a PKCE challenge redirects to the registered redirect URI with
    // `error=login_required`. PKCE is required, so the challenge is part of the probe.
    const probe = await globalThis.fetch(
      `${keycloak!.baseUrl}/realms/${realm}/protocol/openid-connect/auth?` +
        new URLSearchParams({
          client_id: "genie-ops-center",
          redirect_uri: `${deploymentUrl}/api/auth/callback/keycloak`,
          response_type: "code",
          scope: "openid",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          prompt: "none",
        }).toString(),
      { redirect: "manual" }
    );

    expect(probe.status).toBe(302);
    // SAFETY: a 302 from the authorization endpoint carries a Location header.
    const location = probe.headers.get("location") ?? "";
    expect(
      location.startsWith(`${deploymentUrl}/api/auth/callback/keycloak`)
    ).toBe(true);
    expect(new URL(location).searchParams.get("error")).toBe("login_required");
  }, 180000);

  it("passes a renamed client id through to the aud check (R-54a, R-54d)", async () => {
    const realm = `renamed-client-${process.pid}-${Date.now()}`;
    const deploymentUrl = "https://genie.example.invalid";
    const renamedClientId = "genie-ops-center-renamed";
    const clientSecret = "renamed-client-secret-value";

    const opsCenter = await renderShipped(
      OPS_CENTER_CLIENT_FILE,
      deploymentUrl
    );

    await createRealmWithClients(realm, [
      { ...opsCenter, clientId: renamedClientId, secret: clientSecret },
    ]);
    await enableDirectGrants(realm, renamedClientId);

    const email = `renamed-${process.pid}@genie.example.invalid`;
    const token = await masterToken();

    const created = await globalThis.fetch(
      `${keycloak!.baseUrl}/admin/realms/${realm}/users`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: email,
          email,
          emailVerified: true,
          firstName: "Renamed",
          lastName: "Person",
          enabled: true,
          requiredActions: [],
          credentials: [
            {
              type: "password",
              value: "renamed-password-14",
              temporary: false,
            },
          ],
        }),
      }
    );

    expect(created.status).toBe(201);

    // The token the realm mints for the renamed client carries that id in `aud`, the value the
    // app compares against the configured KEYCLOAK_CLIENT_ID (R-54d). This is the positive half;
    // `auth-audience.integration.test.ts` proves a foreign `aud` is refused.
    expect(
      await idTokenAudiences({
        realm,
        clientId: renamedClientId,
        clientSecret,
        email,
        password: "renamed-password-14",
      })
    ).toEqual([renamedClientId]);

    // The app consumes the renamed id from KEYCLOAK_CLIENT_ID and keeps id-token verification on.
    const provider = keycloakProviderConfig({
      keycloakUrl: keycloak!.baseUrl,
      realm,
      clientId: renamedClientId,
      clientSecret,
      publicUrl: deploymentUrl,
    });

    expect(provider.clientId).toBe(renamedClientId);
    expect(provider.requireIdTokenVerification).toBe(true);
  }, 180000);
});

describe("the R-54c address repair (R-54c)", () => {
  it("never moves a settled clients step when the repair cannot run, and the gate stays open", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await configFiles();
    const realm = `repair-managed-${process.pid}-${Date.now()}`;

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
    });
    await observer.connect();

    // A managed stack that finished normally: `clients` is `done` and the address is recorded.
    await expect(
      runGenieOps(setupArgs(files), runnerOptions(source(postgres.url, realm)))
    ).resolves.toBe(0);

    await expect(
      observer.query(
        "select step, state from setup_step where step in ('realm', 'clients') order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "clients", state: "done" },
        { step: "realm", state: "done" },
      ],
    });

    // Simulate a stack whose `clients` step predates the column.
    await observer.query(
      "update tenant_settings set keycloak_url_at_setup = null"
    );

    // The rerun cannot run the repair: no admin secret. Run through `runStep` it would overwrite
    // the settled row; run outside it, the row must survive and the command must fail.
    const output: string[] = [];

    await expect(
      runGenieOps(setupArgs(files), {
        ...runnerOptions(
          source(postgres.url, realm, {
            KEYCLOAK_ADMIN_CLIENT_SECRET: undefined,
          })
        ),
        output: (line) => output.push(line),
        errorOutput: (line) => output.push(line),
      })
    ).resolves.not.toBe(0);

    expect(output.join("\n")).toContain("KEYCLOAK_ADMIN_CLIENT_SECRET");

    await expect(
      observer.query(
        "select step, state from setup_step where step in ('realm', 'clients') order by step"
      )
    ).resolves.toMatchObject({
      rows: [
        { step: "clients", state: "done" },
        { step: "realm", state: "done" },
      ],
    });

    await expect(
      observer.query("select keycloak_url_at_setup from tenant_settings")
    ).resolves.toMatchObject({ rows: [{ keycloak_url_at_setup: null }] });

    // The gate reads the same settled predicate, so the running app keeps serving.
    const applicationContext = createTenantContext(
      {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: "https://genie.example.invalid",
        BETTER_AUTH_SECRET: "x".repeat(32),
        KEYCLOAK_URL: keycloak!.baseUrl,
        KEYCLOAK_REALM: realm,
        KEYCLOAK_CLIENT_ID: "genie-ops-center",
        KEYCLOAK_CLIENT_SECRET: "client-secret-value",
      },
      silentLogger(),
      [],
      undefined,
      "application"
    );

    try {
      expect(setupSatisfied(await readSetupProgress(applicationContext))).toBe(
        true
      );
    } finally {
      await applicationContext.db.$client.end();
    }
  }, 180000);
});
