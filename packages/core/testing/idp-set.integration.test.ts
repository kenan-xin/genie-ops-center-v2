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

/**
 * The address Keycloak uses to fetch its own realm metadata for `import-config`. Both realms live
 * in the one container, so the container reaches itself on loopback; the test process uses the
 * mapped address for its own admin calls.
 */
const CONTAINER_KEYCLOAK_URL = "http://localhost:8080";

const PUBLIC_URL = "https://test.example.invalid";

const PROVIDER_SECRET = "company-oidc-secret-that-must-not-leak";

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
      protocolMappers: [
        {
          name: "groups",
          protocol: "openid-connect",
          protocolMapper: "oidc-group-membership-mapper",
          consentRequired: false,
          config: {
            "full.path": "false",
            "claim.name": "groups",
            "id.token.claim": "true",
            "access.token.claim": "true",
          },
        },
      ],
    },
  ],
};

beforeAll(async () => {
  keycloak = await startDisposableKeycloak();

  const bootstrapTarget: KeycloakTarget = {
    baseUrl: keycloak.baseUrl,
    fetch: globalThis.fetch,
  };

  const token = await masterAdminToken(
    bootstrapTarget,
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD
  );

  await createRealm(bootstrapTarget, token, COMPANY_REALM);
}, 180000);

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

async function adminJson<T>(path: string, realm: string): Promise<T> {
  const token = await masterAdminToken(
    target(),
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD
  );

  const response = await globalThis.fetch(
    `${keycloak!.baseUrl}/admin/realms/${realm}${path}`,
    { headers: { authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new Error(`GET ${path} answered ${response.status}`);
  }

  // SAFETY: every endpoint read here returns JSON of the shape the test asserts on.
  return (await response.json()) as T;
}

type ConfigFiles = {
  readonly tenantConfig: string;
  readonly brandingSeed: string;
  readonly realmOverrides: string;
};

async function configFiles(): Promise<ConfigFiles> {
  const folder = await mkdtemp(join(tmpdir(), "genie-idp-set-"));
  cleanups.push(() => rm(folder, { recursive: true, force: true }));

  const tenantConfig = join(folder, "tenant.yaml");
  const brandingSeed = join(folder, "branding.seed.json");
  const realmOverrides = join(folder, "realm.overrides.json");

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
  await writeFile(realmOverrides, "{}", "utf8");

  return { tenantConfig, brandingSeed, realmOverrides };
}

function lineCapture() {
  const lines: string[] = [];
  const write = (line: string) => lines.push(line);

  return { lines, output: write, errorOutput: write };
}

type TenantFixture = {
  readonly context: Awaited<
    ReturnType<typeof startDisposableDeployment>
  >["context"];
  readonly source: EnvironmentSource;
  readonly realm: string;
  readonly lines: string[];
  readonly options: Parameters<typeof runGenieOps>[1];
};

/** A real Postgres, a real realm from `genie-ops setup`, and the source the runner reads. */
async function tenantFixture(slug: string): Promise<TenantFixture> {
  const realm = `genie-${slug}`;

  const bootstrapEnv = {
    PUBLIC_URL,
    BETTER_AUTH_SECRET: "x".repeat(32),
    KEYCLOAK_URL: keycloak!.baseUrl,
    KEYCLOAK_REALM: realm,
    KEYCLOAK_CLIENT_ID: "genie-ops-center",
    KEYCLOAK_CLIENT_SECRET: "client-secret-value",
    KEYCLOAK_ADMIN_CLIENT_SECRET: "admin-client-secret-value",
    KEYCLOAK_BOOTSTRAP_USER,
    KEYCLOAK_BOOTSTRAP_PASSWORD,
  };

  const deployment = await startDisposableDeployment([], { env: bootstrapEnv });
  cleanups.push(deployment.stop);

  const source: EnvironmentSource = {
    ...bootstrapEnv,
    DATABASE_URL: deployment.context.env.databaseUrl,
  };

  const files = await configFiles();
  const captured = lineCapture();

  const options = {
    source,
    compiledModules: [],
    histories: [],
    ...captured,
  };

  await expect(
    runGenieOps(
      [
        "setup",
        "--tenant-config",
        files.tenantConfig,
        "--branding-seed",
        files.brandingSeed,
      ],
      options
    )
  ).resolves.toBe(0);

  return {
    context: deployment.context,
    source,
    realm,
    lines: captured.lines,
    options,
  };
}

type Authorization = {
  readonly status: number;
  readonly location: string | undefined;
};

/** The status of the realm's authorization endpoint, and its redirect target when it leaves. */
async function authorization(realm: string): Promise<Authorization> {
  const query = new URLSearchParams({
    client_id: "genie-ops-center",
    redirect_uri: `${PUBLIC_URL}/api/auth/callback/keycloak`,
    response_type: "code",
    scope: "openid",
    // The shipped client requires PKCE with S256 (R-49a).
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
  };
}

type Connector = {
  readonly providerId?: string;
  readonly config?: Record<string, string>;
};

type Mapper = {
  readonly identityProviderMapper?: string;
  readonly config?: Record<string, string>;
};

function oidcArgs(): readonly string[] {
  return [
    "idp",
    "set",
    "--protocol",
    "oidc",
    "--issuer-url",
    `${CONTAINER_KEYCLOAK_URL}/realms/company`,
    "--client-id",
    "genie-oidc",
    "--client-secret",
    PROVIDER_SECRET,
  ];
}

async function idpAuditRows(
  fixture: TenantFixture
): Promise<Array<{ action: string; metadata: unknown }>> {
  const result = await fixture.context.db.$client.query<{
    action: string;
    metadata: unknown;
  }>(
    "select action, metadata from audit_event where action = 'ops:idp-set' order by occurred_at, id"
  );

  return result.rows;
}

describe("genie-ops idp set", () => {
  it("writes an OIDC provider and a FORCE Attribute Importer, and the realm redirects to it", async () => {
    const fixture = await tenantFixture("oidc");

    // R-58: before idp set the fixed alias names no provider, so the realm shows its own form and
    // does not leave for the provider.
    const before = await authorization(fixture.realm);

    expect(before.location ?? "").not.toContain(`/broker/${BROKER_IDP_ALIAS}/`);

    await expect(runGenieOps([...oidcArgs()], fixture.options)).resolves.toBe(
      0
    );

    const provider = await adminJson<Connector>(
      `/identity-provider/instances/${BROKER_IDP_ALIAS}`,
      fixture.realm
    );

    expect(provider.providerId).toBe("oidc");
    expect(provider.config?.authorizationUrl).toContain("/realms/company/");

    const mappers = await adminJson<readonly Mapper[]>(
      `/identity-provider/instances/${BROKER_IDP_ALIAS}/mappers`,
      fixture.realm
    );

    // FORCE re-evaluates the attribute on every sign-in, so a sign-in with no groups clears it and
    // the marker rule of DEC-41 offboards. IMPORT or LEGACY would leave a stale attribute.
    expect(mappers).toHaveLength(1);
    expect(mappers[0]).toMatchObject({
      identityProviderMapper: "oidc-user-attribute-idp-mapper",
      config: {
        "syncMode": "FORCE",
        "user.attribute": "groups",
        "claim": "groups",
      },
    });

    // The realm template named the alias as the default redirector at creation; after idp set the
    // same authorization request leaves for the provider.
    const redirect = await authorization(fixture.realm);

    expect(redirect.location ?? "", redirect.location).toContain(
      `/broker/${BROKER_IDP_ALIAS}/`
    );

    const rows = await idpAuditRows(fixture);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({
      args: expect.any(Array),
      outcome: "success",
    });
    expect(JSON.stringify(rows[0]?.metadata)).not.toContain(PROVIDER_SECRET);
  }, 200000);

  it("writes a SAML provider and a FORCE Attribute Importer", async () => {
    const fixture = await tenantFixture("saml");

    await expect(
      runGenieOps(
        [
          "idp",
          "set",
          "--protocol",
          "saml",
          "--metadata-url",
          `${CONTAINER_KEYCLOAK_URL}/realms/company/protocol/saml/descriptor`,
          "--entity-id",
          "genie-saml",
        ],
        fixture.options
      )
    ).resolves.toBe(0);

    const provider = await adminJson<Connector>(
      `/identity-provider/instances/${BROKER_IDP_ALIAS}`,
      fixture.realm
    );

    expect(provider.providerId).toBe("saml");
    expect(provider.config?.entityID).toBe("genie-saml");
    expect(provider.config?.singleSignOnServiceUrl).toContain(
      "/realms/company/"
    );

    const mappers = await adminJson<readonly Mapper[]>(
      `/identity-provider/instances/${BROKER_IDP_ALIAS}/mappers`,
      fixture.realm
    );

    expect(mappers[0]).toMatchObject({
      identityProviderMapper: "saml-user-attribute-idp-mapper",
      config: {
        "syncMode": "FORCE",
        "user.attribute": "groups",
        "attribute.name": "groups",
      },
    });
  }, 200000);

  it("updates the provider in place on a second run", async () => {
    const fixture = await tenantFixture("repeat");

    await expect(runGenieOps([...oidcArgs()], fixture.options)).resolves.toBe(
      0
    );
    await expect(runGenieOps([...oidcArgs()], fixture.options)).resolves.toBe(
      0
    );

    const mappers = await adminJson<readonly Mapper[]>(
      `/identity-provider/instances/${BROKER_IDP_ALIAS}/mappers`,
      fixture.realm
    );

    expect(mappers).toHaveLength(1);
  }, 200000);

  it("refuses in client-only mode with the named cause", async () => {
    const fixture = await tenantFixture("client-only");

    await fixture.context.db
      .update(tenantSettings)
      .set({ realmMode: "customer" });

    const captured = lineCapture();

    await expect(
      runGenieOps([...oidcArgs()], { ...fixture.options, ...captured })
    ).resolves.not.toBe(0);

    expect(captured.lines.join("\n")).toContain("client-only mode");
  }, 200000);
});
