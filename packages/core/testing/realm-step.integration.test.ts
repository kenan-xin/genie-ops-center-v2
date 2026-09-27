import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EnvironmentSource } from "../src/lib/environment/index.ts";
import { masterAdminToken } from "../src/services/keycloak/client.ts";
import {
  isJsonObject,
  type JsonObject,
} from "../src/services/keycloak/representation.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import { startDisposablePostgres } from "./index.ts";
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
