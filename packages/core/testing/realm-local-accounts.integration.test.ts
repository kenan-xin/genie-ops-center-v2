import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { EnvironmentSource } from "../src/lib/environment/index.ts";
import { tenantSettings } from "../src/schema.ts";
import { BROKER_IDP_ALIAS } from "../src/services/keycloak/broker.ts";
import {
  createRealm,
  masterAdminToken,
  type KeycloakTarget,
} from "../src/services/keycloak/client.ts";
import { type JsonObject } from "../src/services/keycloak/representation.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import { startDisposableDeployment } from "./index.ts";
import {
  KEYCLOAK_BOOTSTRAP_PASSWORD,
  KEYCLOAK_BOOTSTRAP_USER,
  startDisposableKeycloak,
  type DisposableKeycloak,
} from "./keycloak.ts";

const cleanups: Array<() => Promise<void>> = [];

let keycloak: DisposableKeycloak | undefined;

/** Both realms live in one container, so Keycloak reaches the company realm on loopback. */
const CONTAINER_KEYCLOAK_URL = "http://localhost:8080";

const PUBLIC_URL = "https://test.example.invalid";

const PROVIDER_SECRET = "company-oidc-secret-that-must-not-leak";

const SMTP_PASSWORD = "smtp-secret-do-not-log";

/** The local template's policy, which a realm without its own policy receives (R-58a). */
const TEMPLATE_POLICY =
  "length(14) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and notUsername";

const OVERRIDE_POLICY = "length(20) and notUsername";

const COMPANY_REALM: JsonObject = {
  realm: "company",
  enabled: true,
  sslRequired: "none",
  clients: [
    {
      clientId: "genie-oidc",
      enabled: true,
      protocol: "openid-connect",
      publicClient: false,
      secret: PROVIDER_SECRET,
      standardFlowEnabled: true,
      redirectUris: ["*"],
      webOrigins: ["*"],
    },
  ],
};

beforeAll(async () => {
  keycloak = await startDisposableKeycloak();

  const token = await masterAdminToken(
    target(),
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD
  );

  await createRealm(target(), token, COMPANY_REALM);
}, 240000);

afterAll(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  await keycloak?.stop();
});

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function target(): KeycloakTarget {
  return { baseUrl: keycloak!.baseUrl, fetch: globalThis.fetch };
}

async function adminRequest(
  method: "GET" | "PUT",
  path: string,
  realm: string,
  body?: JsonObject
): Promise<Response> {
  const token = await masterAdminToken(
    target(),
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD
  );

  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}${path}`,
    {
      method,
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? null : JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new Error(`${method} ${path} answered ${response.status}`);
  }

  return response;
}

async function adminJson<T>(path: string, realm: string): Promise<T> {
  // SAFETY: every endpoint read here returns JSON of the shape the test asserts on.
  return (await (await adminRequest("GET", path, realm)).json()) as T;
}

/** The admin writes a test plants before the command runs. */
async function adminPut(
  path: string,
  realm: string,
  body: JsonObject
): Promise<void> {
  await adminRequest("PUT", path, realm, body);
}

type ConfigFiles = {
  readonly tenantConfig: string;
  readonly brandingSeed: string;
};

async function configFiles(passwordPolicy?: string): Promise<ConfigFiles> {
  const folder = await mkdtemp(join(tmpdir(), "genie-local-accounts-"));
  cleanups.push(() => rm(folder, { recursive: true, force: true }));

  const tenantConfig = join(folder, "tenant.yaml");
  const brandingSeed = join(folder, "branding.seed.json");

  await writeFile(
    tenantConfig,
    [
      "modules: []",
      "local_accounts: false",
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
      company_name: "Example Group",
      product_name: "Example Ops",
      default_locale: "en",
      default_time_zone: "Europe/Berlin",
    }),
    "utf8"
  );
  await writeFile(
    join(folder, "realm.overrides.json"),
    JSON.stringify(passwordPolicy === undefined ? {} : { passwordPolicy }),
    "utf8"
  );

  return { tenantConfig, brandingSeed };
}

function lineCapture() {
  const lines: string[] = [];
  const write = (line: string) => lines.push(line);

  return { lines, output: write, errorOutput: write };
}

/** The environment the runner reads for one realm, with the local variant's SMTP values. */
function tenantEnvironment(realm: string) {
  return {
    PUBLIC_URL,
    BETTER_AUTH_SECRET: "x".repeat(32),
    KEYCLOAK_URL: keycloak!.baseUrl,
    KEYCLOAK_REALM: realm,
    KEYCLOAK_CLIENT_ID: "genie-ops-center",
    KEYCLOAK_CLIENT_SECRET: "client-secret-value",
    KEYCLOAK_ADMIN_CLIENT_SECRET: "admin-client-secret-value",
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD,
    IDP_CLIENT_SECRET: PROVIDER_SECRET,
    MAIL_PROVIDER: "smtp",
    MAIL_FROM: "genie@example.invalid",
    SMTP_URL: `smtp://mailer:${SMTP_PASSWORD}@mail.example.invalid:587`,
  };
}

type TenantFixture = {
  readonly context: Awaited<
    ReturnType<typeof startDisposableDeployment>
  >["context"];
  readonly source: EnvironmentSource;
  readonly realm: string;
  readonly files: ConfigFiles;
  readonly lines: string[];
  readonly options: Parameters<typeof runGenieOps>[1];
};

function setupArgs(files: ConfigFiles): readonly string[] {
  return [
    "setup",
    "--tenant-config",
    files.tenantConfig,
    "--branding-seed",
    files.brandingSeed,
  ];
}

const OIDC_ARGS: readonly string[] = [
  "idp",
  "set",
  "--protocol",
  "oidc",
  "--issuer-url",
  `${CONTAINER_KEYCLOAK_URL}/realms/company`,
  "--client-id",
  "genie-oidc",
  "--allow-http",
];

/**
 * A real Postgres and a brokered realm from `genie-ops setup`, with the OIDC provider from
 * `genie-ops idp set` unless `withProvider` is false.
 */
async function tenantFixture(
  slug: string,
  options: {
    readonly passwordPolicy?: string;
    readonly withProvider?: boolean;
  } = {}
): Promise<TenantFixture> {
  const realm = `genie-${slug}`;
  const env = tenantEnvironment(realm);
  const deployment = await startDisposableDeployment([], { env });
  cleanups.push(deployment.stop);

  const source: EnvironmentSource = {
    ...env,
    DATABASE_URL: deployment.context.env.databaseUrl,
  };

  const files = await configFiles(options.passwordPolicy);
  const captured = lineCapture();

  const runOptions = {
    source,
    compiledModules: [],
    histories: [],
    ...captured,
  };

  await expect(runGenieOps(setupArgs(files), runOptions)).resolves.toBe(0);

  if (options.withProvider !== false) {
    await expect(runGenieOps(OIDC_ARGS, runOptions)).resolves.toBe(0);
  }

  return {
    context: deployment.context,
    source,
    realm,
    files,
    lines: captured.lines,
    options: runOptions,
  };
}

function enableArgs(...domains: readonly string[]): readonly string[] {
  return [
    "realm",
    "local-accounts",
    "enable",
    ...domains.flatMap((domain) => ["--sso-domain", domain]),
  ];
}

type RealmPage = {
  readonly status: number;
  readonly location: string | undefined;
  readonly body: string;
};

/** The realm's authorization endpoint without a hint: its status, redirect and page body. */
async function realmPage(realm: string): Promise<RealmPage> {
  const query = new URLSearchParams({
    client_id: "genie-ops-center",
    redirect_uri: `${PUBLIC_URL}/api/auth/callback/keycloak`,
    response_type: "code",
    scope: "openid",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
  });

  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/realms/${realm}/protocol/openid-connect/auth?${query}`,
    { redirect: "manual" }
  );

  return {
    status: response.status,
    location: response.headers.get("location") ?? undefined,
    body: await response.text(),
  };
}

type Execution = {
  readonly providerId?: string;
  readonly authenticationConfig?: string;
};

type AuthenticationConfig = {
  readonly config?: Record<string, string>;
};

/** The config of one flow's execution, found by its provider id. */
async function executionConfig(
  realm: string,
  flow: string,
  providerId: string
): Promise<AuthenticationConfig & { readonly id: string }> {
  const executions = await adminJson<readonly Execution[]>(
    `/authentication/flows/${encodeURIComponent(flow)}/executions`,
    realm
  );

  const id =
    executions.find((execution) => execution.providerId === providerId)
      ?.authenticationConfig ?? "";

  return {
    id,
    ...(await adminJson<AuthenticationConfig>(
      `/authentication/config/${id}`,
      realm
    )),
  };
}

/** The browser flow redirector's default provider, or nothing when the key is gone. */
async function redirectorDefault(realm: string): Promise<string | undefined> {
  const config = await executionConfig(
    realm,
    "browser",
    "identity-provider-redirector"
  );

  return config.config?.defaultProvider;
}

type SettingsRow = {
  readonly realm_supports_local_accounts: boolean;
  readonly local_accounts_enabled: boolean;
  readonly sso_email_domains: readonly string[];
};

async function settingsRow(fixture: {
  readonly context: TenantFixture["context"];
}): Promise<SettingsRow> {
  const result = await fixture.context.db.$client.query<SettingsRow>(
    "select realm_supports_local_accounts, local_accounts_enabled, sso_email_domains from tenant_settings"
  );

  return result.rows[0]!;
}

async function enableAuditRows(fixture: {
  readonly context: TenantFixture["context"];
}): Promise<Array<{ metadata: unknown }>> {
  const result = await fixture.context.db.$client.query<{ metadata: unknown }>(
    "select metadata from audit_event where action = 'ops:realm-local-accounts-enable' order by occurred_at, id"
  );

  return result.rows;
}

type ProtocolMapper = {
  readonly name?: string;
  readonly protocolMapper?: string;
};

const UNCHANGED_SETTINGS = {
  realm_supports_local_accounts: false,
  sso_email_domains: [],
};

describe("genie-ops realm local-accounts enable", () => {
  it("applies the local parts, records the domains and writes one audit row on a brokered realm with a provider", async () => {
    const fixture = await tenantFixture("enable");

    const before = await realmPage(fixture.realm);

    expect(before.location ?? "").toContain(`/broker/${BROKER_IDP_ALIAS}/`);

    await adminPut(
      "/authentication/required-actions/CONFIGURE_TOTP",
      fixture.realm,
      {
        ...(await adminJson<JsonObject>(
          "/authentication/required-actions/CONFIGURE_TOTP",
          fixture.realm
        )),
        enabled: false,
      }
    );

    const captured = lineCapture();

    await expect(
      runGenieOps(enableArgs("company.example", "partner-sso.example"), {
        ...fixture.options,
        ...captured,
      })
    ).resolves.toBe(0);

    // R-58a step 1: the realm page shows its password form beside the provider button.
    const after = await realmPage(fixture.realm);

    expect(after.status, after.location).toBe(200);
    expect(after.body).toContain('name="password"');
    expect(after.body).toContain(`/broker/${BROKER_IDP_ALIAS}/login`);

    // R-58a step 2: the local variant's realm settings.
    const realm = await adminJson<{
      readonly verifyEmail?: boolean;
      readonly resetPasswordAllowed?: boolean;
      readonly passwordPolicy?: string;
      readonly smtpServer?: Record<string, string>;
    }>("", fixture.realm);

    expect(realm).toMatchObject({
      verifyEmail: true,
      resetPasswordAllowed: true,
      passwordPolicy: TEMPLATE_POLICY,
      smtpServer: {
        host: "mail.example.invalid",
        from: "genie@example.invalid",
      },
    });

    await expect(
      adminJson(
        "/authentication/required-actions/CONFIGURE_TOTP",
        fixture.realm
      )
    ).resolves.toMatchObject({ enabled: true, defaultAction: false });

    // R-50 as amended: the one `groups` mapper stays the User Attribute mapper.
    const [client] = await adminJson<
      readonly { readonly protocolMappers?: readonly ProtocolMapper[] }[]
    >("/clients?clientId=genie-ops-center", fixture.realm);

    const mappers = client?.protocolMappers ?? [];

    expect(mappers.filter((mapper) => mapper.name === "groups")).toEqual([
      expect.objectContaining({
        protocolMapper: "oidc-usermodel-attribute-mapper",
      }),
    ]);
    expect(
      mappers.some(
        (mapper) => mapper.protocolMapper === "oidc-group-membership-mapper"
      )
    ).toBe(false);

    // R-58a steps 3 and 4.
    await expect(settingsRow(fixture)).resolves.toMatchObject({
      realm_supports_local_accounts: true,
      sso_email_domains: ["company.example", "partner-sso.example"],
    });

    const rows = await enableAuditRows(fixture);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({
      args: ["company.example", "partner-sso.example"],
      outcome: "success",
    });

    for (const secret of [KEYCLOAK_BOOTSTRAP_PASSWORD, SMTP_PASSWORD]) {
      expect(captured.lines.join("\n")).not.toContain(secret);
      expect(JSON.stringify(rows[0]?.metadata)).not.toContain(secret);
    }
  }, 240000);

  it("changes nothing on a second run, keeps the switch and an override policy, and replaces the list on a rerun with other domains", async () => {
    const fixture = await tenantFixture("rerun", {
      passwordPolicy: OVERRIDE_POLICY,
    });

    await expect(
      runGenieOps(enableArgs("company.example"), fixture.options)
    ).resolves.toBe(0);

    const first = await adminJson<JsonObject>("", fixture.realm);

    expect(first.passwordPolicy).toBe(OVERRIDE_POLICY);

    // An administrator turns the Local accounts switch on between the runs.
    await fixture.context.db.$client.query(
      "update tenant_settings set local_accounts_enabled = true"
    );

    await expect(
      runGenieOps(enableArgs("company.example"), fixture.options)
    ).resolves.toBe(0);

    await expect(adminJson("", fixture.realm)).resolves.toEqual(first);
    await expect(settingsRow(fixture)).resolves.toEqual({
      realm_supports_local_accounts: true,
      local_accounts_enabled: true,
      sso_email_domains: ["company.example"],
    });

    await expect(
      runGenieOps(enableArgs("other.example"), fixture.options)
    ).resolves.toBe(0);

    await expect(settingsRow(fixture)).resolves.toMatchObject({
      sso_email_domains: ["other.example"],
    });
  }, 240000);

  it("refuses client-only mode before it reads the bootstrap credential", async () => {
    // No setup run and no realm: a migrated database whose settings row records client-only
    // mode, and an environment without the bootstrap credential.
    const {
      KEYCLOAK_BOOTSTRAP_USER: _user,
      KEYCLOAK_BOOTSTRAP_PASSWORD: _password,
      ...env
    } = tenantEnvironment("genie-client-only");

    const deployment = await startDisposableDeployment([], { env });

    cleanups.push(deployment.stop);
    await deployment.context.db
      .insert(tenantSettings)
      .values({ realmMode: "customer" });

    const captured = lineCapture();

    await expect(
      runGenieOps(enableArgs("company.example"), {
        source: { ...env, DATABASE_URL: deployment.context.env.databaseUrl },
        compiledModules: [],
        histories: [],
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).toContain("client-only mode");
    await expect(settingsRow(deployment)).resolves.toMatchObject(
      UNCHANGED_SETTINGS
    );

    const rows = await enableAuditRows(deployment);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({ outcome: "failure" });
  }, 240000);

  it("refuses a realm without a provider and leaves it unchanged", async () => {
    const fixture = await tenantFixture("no-provider", { withProvider: false });
    const captured = lineCapture();

    await expect(
      runGenieOps(enableArgs("company.example"), {
        ...fixture.options,
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).toContain("run genie-ops idp set first");
    await expect(redirectorDefault(fixture.realm)).resolves.toBe(
      BROKER_IDP_ALIAS
    );
    await expect(settingsRow(fixture)).resolves.toMatchObject(
      UNCHANGED_SETTINGS
    );
  }, 240000);

  it("refuses without the SMTP values and leaves the realm unchanged", async () => {
    const fixture = await tenantFixture("no-smtp");

    const {
      MAIL_PROVIDER: _provider,
      MAIL_FROM: _from,
      SMTP_URL: _url,
      ...source
    } = fixture.source;

    const captured = lineCapture();

    await expect(
      runGenieOps(enableArgs("company.example"), {
        ...fixture.options,
        source,
        ...captured,
      })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).toContain("MAIL_PROVIDER=smtp");
    await expect(redirectorDefault(fixture.realm)).resolves.toBe(
      BROKER_IDP_ALIAS
    );
    await expect(settingsRow(fixture)).resolves.toMatchObject(
      UNCHANGED_SETTINGS
    );
  }, 240000);
});

describe("the realm step after realm local-accounts enable", () => {
  it("keeps the realm page and the settings, and still repairs the profile review (R-53a)", async () => {
    const fixture = await tenantFixture("setup-rerun");

    await expect(
      runGenieOps(enableArgs("company.example"), fixture.options)
    ).resolves.toBe(0);

    const review = await executionConfig(
      fixture.realm,
      "first broker login",
      "idp-review-profile"
    );

    await adminPut(`/authentication/config/${review.id}`, fixture.realm, {
      ...review,
      config: { ...review.config, "update.profile.on.first.login": "on" },
    });

    await fixture.context.db.$client.query(
      "delete from setup_step where step = 'realm'"
    );

    await expect(
      runGenieOps(setupArgs(fixture.files), fixture.options)
    ).resolves.toBe(0);

    const page = await realmPage(fixture.realm);

    expect(page.status, page.location).toBe(200);
    await expect(settingsRow(fixture)).resolves.toMatchObject({
      realm_supports_local_accounts: true,
      sso_email_domains: ["company.example"],
    });

    const repaired = await executionConfig(
      fixture.realm,
      "first broker login",
      "idp-review-profile"
    );

    expect(repaired.config?.["update.profile.on.first.login"]).toBe("off");
  }, 240000);
});
