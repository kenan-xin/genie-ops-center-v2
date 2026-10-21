import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { IMAGE } from "../../testing/image-tag.ts";
import type { EntraTenant } from "./tenant.ts";

const run = promisify(execFile);

/**
 * The scheduled Entra run's stack. Entra accepts a plain-HTTP redirect URI only on `localhost`,
 * so Keycloak, Postgres and the app share one network namespace (the Keycloak container's), where
 * `localhost` is the same address for the app, Keycloak and the browser on the host. The one
 * address rule of R-54c holds: `KEYCLOAK_URL` is Keycloak's issuer for both.
 */
export const KEYCLOAK_PORT = 18080;

export const APP_PORT = 3480;

export const KEYCLOAK_URL = `http://localhost:${KEYCLOAK_PORT}`;

export const APP_URL = `http://localhost:${APP_PORT}`;

export const REALM = "genie-entra";

/** The broker reply address the Entra app registration must list as a Web redirect URI. */
export const BROKER_REDIRECT_URI = `${KEYCLOAK_URL}/realms/${REALM}/broker/company-login/endpoint`;

/** The readable name the proof gives the assigned group (R-24c). */
export const GROUP_LABEL = "Entra test group";

const NAMES = {
  keycloak: "genie-entra-keycloak",
  database: "genie-entra-database",
  app: "genie-entra-app",
} as const;

/** Throwaway values for this one disposable stack, like the e2e compose file's. */
const BOOTSTRAP = { user: "admin", password: "admin" } as const;

const CLIENT_SECRET = "entra-run-ops-center-secret";

const ADMIN_CLIENT_SECRET = "entra-run-admin-client-secret";

async function docker(args: readonly string[]): Promise<string> {
  const { stdout } = await run("docker", [...args]);

  return stdout.trim();
}

async function waitFor(
  label: string,
  ready: () => Promise<boolean>
): Promise<void> {
  const deadline = Date.now() + 180_000;

  /* eslint-disable no-await-in-loop -- each attempt exists only because the previous did not answer. */
  while (Date.now() < deadline) {
    if (await ready().catch(() => false)) return;

    await sleep(1000);
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(`${label} never became ready`);
}

/** One SQL statement list against the stack's database. */
export async function sql(statements: string): Promise<readonly string[]> {
  const out = await docker([
    "exec",
    NAMES.database,
    "psql",
    "-U",
    "genie",
    "-d",
    "genie",
    "-v",
    "ON_ERROR_STOP=1",
    "-t",
    "-A",
    "-c",
    statements,
  ]);

  return out.split("\n").filter((line) => line !== "");
}

export async function stopEntraStack(): Promise<void> {
  await run("docker", [
    "rm",
    "-f",
    NAMES.app,
    NAMES.database,
    NAMES.keycloak,
  ]).catch(() => undefined);
}

/** Copies the setup files into the app container and runs `genie-ops setup` and `idp set`. */
async function setUp(tenant: EntraTenant): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), "genie-entra-"));

  try {
    const files = {
      "tenant.yaml": [
        "modules: []",
        "local_accounts: false",
        "first_administrators:",
        `  - ${tenant.assigned.email}`,
        "break_glass_email: entra-break-glass@example.invalid",
        "",
      ].join("\n"),
      "branding.seed.json": JSON.stringify({
        company_name: "Entra Run",
        product_name: "Entra Run Ops",
        default_locale: "en",
        default_time_zone: "UTC",
      }),
      "realm.overrides.json": "{}",
    };

    for (const [name, text] of Object.entries(files)) {
      // oxlint-disable-next-line no-await-in-loop -- three small files, copied in order.
      await writeFile(join(folder, name), text, "utf8");
      // oxlint-disable-next-line no-await-in-loop -- three small files, copied in order.
      await docker(["cp", join(folder, name), `${NAMES.app}:/tmp/${name}`]);
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }

  await docker([
    "exec",
    "-e",
    `KEYCLOAK_BOOTSTRAP_USER=${BOOTSTRAP.user}`,
    "-e",
    `KEYCLOAK_BOOTSTRAP_PASSWORD=${BOOTSTRAP.password}`,
    NAMES.app,
    "genie-ops",
    "setup",
    "--tenant-config",
    "/tmp/tenant.yaml",
    "--branding-seed",
    "/tmp/branding.seed.json",
  ]);

  // The provider secret reaches this one command through its environment, never argv (R-58).
  await run(
    "docker",
    [
      "exec",
      "-e",
      "IDP_CLIENT_SECRET",
      NAMES.app,
      "genie-ops",
      "idp",
      "set",
      "--protocol",
      "oidc",
      "--issuer-url",
      `https://login.microsoftonline.com/${tenant.tenantId}/v2.0`,
      "--client-id",
      tenant.clientId,
    ],
    { env: { ...process.env, IDP_CLIENT_SECRET: tenant.clientSecret } }
  );
}

/**
 * The application state the proofs read: `jit` onboarding, the assigned group pre-added by its
 * object id with a readable label and the reader role (DEC-52, R-24c), and the overage person
 * pre-added, because a new person whose claim arrives absent is refused.
 */
function seedSql(tenant: EntraTenant): string {
  return [
    "insert into role (name, permissions, is_system) values ('Entra reader', array['placeholder:read', 'placeholder:use'], false) on conflict (name) do nothing",
    `insert into "group" (name, external_id, display_label, source, last_seen_at) values ('${tenant.groupId}', '${tenant.groupId}', '${GROUP_LABEL}', 'idp', null) on conflict do nothing`,
    `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'group', g.id::text from role r, "group" g where r.name = 'Entra reader' and g.external_id = '${tenant.groupId}' on conflict do nothing`,
    ...(tenant.overage === undefined
      ? []
      : [
          `insert into "user" (id, name, email, email_verified, status) values (gen_random_uuid()::text, 'Entra overage', '${tenant.overage.email.toLowerCase()}', true, 'active') on conflict (email) do nothing`,
        ]),
    "update tenant_settings set onboarding_mode = 'jit'",
  ].join("; ");
}

/** Starts Keycloak, Postgres and the app in one namespace, sets the realm up and brokers it. */
export async function startEntraStack(tenant: EntraTenant): Promise<void> {
  await stopEntraStack();

  await docker([
    "run",
    "-d",
    "--name",
    NAMES.keycloak,
    "-p",
    `${KEYCLOAK_PORT}:${KEYCLOAK_PORT}`,
    "-p",
    `${APP_PORT}:3000`,
    "-e",
    `KC_BOOTSTRAP_ADMIN_USERNAME=${BOOTSTRAP.user}`,
    "-e",
    `KC_BOOTSTRAP_ADMIN_PASSWORD=${BOOTSTRAP.password}`,
    "-e",
    `KC_HTTP_PORT=${KEYCLOAK_PORT}`,
    "-e",
    `KC_HOSTNAME=${KEYCLOAK_URL}`,
    "quay.io/keycloak/keycloak:26.7.4",
    "start-dev",
  ]);

  await docker([
    "run",
    "-d",
    "--name",
    NAMES.database,
    "--network",
    `container:${NAMES.keycloak}`,
    "-e",
    "POSTGRES_USER=genie",
    "-e",
    "POSTGRES_PASSWORD=genie",
    "-e",
    "POSTGRES_DB=genie",
    "postgres:18-alpine",
  ]);

  await waitFor(
    "Keycloak",
    async () => (await fetch(`${KEYCLOAK_URL}/realms/master`)).ok
  );
  await waitFor("Postgres", async () => {
    await docker(["exec", NAMES.database, "pg_isready", "-U", "genie"]);

    return true;
  });

  await docker([
    "run",
    "-d",
    "--name",
    NAMES.app,
    "--network",
    `container:${NAMES.keycloak}`,
    "-e",
    "DATABASE_URL=postgres://genie:genie@localhost:5432/genie",
    "-e",
    `PUBLIC_URL=${APP_URL}`,
    "-e",
    "BETTER_AUTH_SECRET=entra-run-better-auth-secret-at-least-32-characters",
    "-e",
    `KEYCLOAK_URL=${KEYCLOAK_URL}`,
    "-e",
    `KEYCLOAK_REALM=${REALM}`,
    "-e",
    "KEYCLOAK_CLIENT_ID=genie-ops-center",
    "-e",
    `KEYCLOAK_CLIENT_SECRET=${CLIENT_SECRET}`,
    "-e",
    `KEYCLOAK_ADMIN_CLIENT_SECRET=${ADMIN_CLIENT_SECRET}`,
    IMAGE,
  ]);

  await waitFor(
    "the app",
    async () => (await fetch(`${APP_URL}/api/health`)).ok
  );

  await setUp(tenant);
  await sql(seedSql(tenant));

  // Discovery was refused while the realm did not exist; it retries at most every 10 seconds.
  await waitFor(
    "the app after setup",
    async () => (await (await fetch(`${APP_URL}/api/health`)).text()) === "ok"
  );
}

/** One admin API call against the stack's Keycloak with a fresh master token. */
async function keycloakAdmin(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: BOOTSTRAP.user,
        password: BOOTSTRAP.password,
      }).toString(),
    }
  );

  // SAFETY: the token endpoint's documented JSON body; only `access_token` is read.
  const { access_token: accessToken } = (await token.json()) as {
    readonly access_token: string;
  };

  return fetch(`${KEYCLOAK_URL}/admin${path}`, {
    ...init,
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

type BrokeredUser = {
  readonly id: string;
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
};

/** The brokered realm user for an email, or undefined before the first broker login. */
export async function brokeredUser(
  email: string
): Promise<BrokeredUser | undefined> {
  const response = await keycloakAdmin(
    `/realms/${REALM}/users?exact=true&email=${encodeURIComponent(email)}`
  );

  // SAFETY: the admin user search answers a JSON list of user representations.
  const [found] = (await response.json()) as readonly BrokeredUser[];

  if (found === undefined) return undefined;

  const full = await keycloakAdmin(`/realms/${REALM}/users/${found.id}`);

  // SAFETY: one user representation.
  return (await full.json()) as BrokeredUser;
}

/** Writes the brokered user's `groups` attribute, so a later sign-in shows what the importer does. */
export async function setBrokeredGroups(
  email: string,
  groups: readonly string[]
): Promise<void> {
  const found = await brokeredUser(email);

  if (found === undefined) throw new Error(`no brokered user ${email}`);

  const response = await keycloakAdmin(`/realms/${REALM}/users/${found.id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...found,
      attributes: { ...found.attributes, groups: [...groups] },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `setting the groups attribute failed with ${response.status}`
    );
  }
}
