import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import {
  E2E_ADMIN_CLIENT_SECRET,
  E2E_BOOTSTRAP_PASSWORD,
  E2E_BOOTSTRAP_USER,
} from "../../testing/e2e-keycloak.ts";
import { scopedPort, scopedProject } from "../../testing/worktree-scope.ts";
import { COMPOSE } from "./compose.ts";
import { ensureDatabase } from "./ensure-database.ts";

const run = promisify(execFile);

/**
 * The brokered tenant deployments of S2-13. Each scenario needs its own realm (the realm template
 * sends sign-in straight to the customer's provider), so these run as extra app containers, each
 * against its own database in the shared Postgres, pointed at a realm created in the stand-in
 * Keycloak. The shared deployment keeps its providerless realm, so the local sign-in specs are
 * untouched.
 *
 * `idp set` writes `company-login` and the realm's redirector default is `company-login`, so the
 * browser leaves for the company stand-in realm, which Playwright resolves through the host
 * mapping in the config.
 */

export const BROKER_REALM = "genie-broker";

export const SAML_REALM = "genie-saml";

/** The database each brokered deployment's app container uses, matching its suffix. */
export const BROKER_DB = "genie_broker_oidc";

export const SAML_DB = "genie_broker_saml";

/** The fixed alias `idp set` writes, matching the realm template. */
export const BROKER_IDP_ALIAS = "company-login";

/** The base host ports, moved aside for this worktree so two runs never collide. */
export function brokeredPort(): number {
  return scopedPort(3500);
}

export function samlPort(): number {
  return scopedPort(3600);
}

/** The S2-16 invite-mode broker: its own realm, database and band (client-only uses 3800). */
export const INVITE_REALM = "genie-invite";

export const INVITE_DB = "genie_broker_invite";

export function invitePort(): number {
  return scopedPort(3900);
}

export function inviteBaseUrl(): string {
  return `http://127.0.0.1:${invitePort()}`;
}

export function brokeredBaseUrl(): string {
  return `http://127.0.0.1:${brokeredPort()}`;
}

export function samlBaseUrl(): string {
  return `http://127.0.0.1:${samlPort()}`;
}

export type BrokeredSpec = {
  /** A short suffix for the container, project and database names. */
  readonly suffix: string;
  readonly realm: string;
  readonly hostPort: number;
  /** The stand-in Keycloak's one browser-visible address, its issuer. */
  readonly keycloakIssuer: string;
  /** The `idp set` arguments after the command, for example `["--protocol","oidc",...]`. */
  readonly idpArgs: readonly string[];
  /** Extra environment for the `idp set` command only, for example the provider secret. */
  readonly idpEnv?: Readonly<Record<string, string>>;
  /** The SQL against the new database, run after setup and `idp set`. */
  readonly seedSql: string;
};

/** True when the container exists and is running. */
async function containerRunning(name: string): Promise<boolean> {
  const { stdout } = await run("docker", [
    "ps",
    "--filter",
    `name=^${name}$`,
    "--format",
    "{{.Names}}",
  ]).catch(() => ({ stdout: "" }));

  return stdout.trim() === name;
}

/** Polls the app's health endpoint until it answers 200 or the deadline passes. */
async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 120000;

  /* eslint-disable no-await-in-loop -- each attempt exists only because the previous did not answer. */
  while (Date.now() < deadline) {
    const ready = await fetch(`${baseUrl}/api/health`)
      .then((response) => response.status === 200)
      .catch(() => false);

    if (ready) return;

    await sleep(1000);
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(`the brokered app at ${baseUrl} never became healthy`);
}

/** Writes the two setup files on the host and copies them into the container. */
async function copySetupFiles(container: string): Promise<{
  readonly tenantConfig: string;
  readonly brandingSeed: string;
}> {
  const folder = await mkdtemp(join(tmpdir(), "genie-brokered-"));

  const tenantConfig = join(folder, "tenant.yaml");
  const brandingSeed = join(folder, "branding.seed.json");
  const realmOverrides = join(folder, "realm.overrides.json");

  await writeFile(
    tenantConfig,
    [
      "modules: []",
      "local_accounts: false",
      "first_administrators:",
      "  - brokered-admin@example.invalid",
      "break_glass_email: brokered-break-glass@example.invalid",
      "",
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    brandingSeed,
    JSON.stringify({
      company_name: "Brokered Group",
      product_name: "Brokered Ops",
      default_locale: "en",
      default_time_zone: "UTC",
    }),
    "utf8"
  );

  await writeFile(realmOverrides, "{}", "utf8");

  await run("docker", ["cp", tenantConfig, `${container}:/tmp/tenant.yaml`]);
  await run("docker", [
    "cp",
    brandingSeed,
    `${container}:/tmp/branding.seed.json`,
  ]);
  await run("docker", [
    "cp",
    realmOverrides,
    `${container}:/tmp/realm.overrides.json`,
  ]);

  await rm(folder, { recursive: true, force: true });

  return {
    tenantConfig: "/tmp/tenant.yaml",
    brandingSeed: "/tmp/branding.seed.json",
  };
}

/**
 * Starts one brokered deployment: its database, its app container on its own host port, setup, the
 * `idp set` provider, and the seed SQL. It is idempotent enough for a rerun: the container is
 * recreated and setup skips steps already recorded in its own database.
 */
export async function provisionBrokered(
  compose: readonly string[],
  spec: BrokeredSpec
): Promise<void> {
  const container = scopedProject(`genie-brokered-${spec.suffix}`);
  const dbName = `genie_broker_${spec.suffix}`;
  const baseUrl = `http://127.0.0.1:${spec.hostPort}`;

  await ensureDatabase(compose, dbName);
  await run("docker", ["rm", "-f", container]).catch(() => undefined);

  await run("docker", [
    ...compose,
    "run",
    "-d",
    "--no-deps",
    "--name",
    container,
    "-p",
    `${spec.hostPort}:3400`,
    "-e",
    `DATABASE_URL=postgres://genie:genie@database:5432/${dbName}`,
    "-e",
    `PUBLIC_URL=${baseUrl}`,
    "-e",
    `KEYCLOAK_URL=${spec.keycloakIssuer}`,
    "-e",
    `KEYCLOAK_REALM=${spec.realm}`,
    "-e",
    `KEYCLOAK_ADMIN_CLIENT_SECRET=${E2E_ADMIN_CLIENT_SECRET}`,
    "app",
  ]);

  await waitForHealth(baseUrl);

  const files = await copySetupFiles(container);

  await run("docker", [
    "exec",
    "-e",
    `KEYCLOAK_BOOTSTRAP_USER=${E2E_BOOTSTRAP_USER}`,
    "-e",
    `KEYCLOAK_BOOTSTRAP_PASSWORD=${E2E_BOOTSTRAP_PASSWORD}`,
    container,
    "genie-ops",
    "setup",
    "--tenant-config",
    files.tenantConfig,
    "--branding-seed",
    files.brandingSeed,
  ]);

  const idpEnv = Object.entries(spec.idpEnv ?? {}).flatMap(([name, value]) => [
    "-e",
    `${name}=${value}`,
  ]);

  await run("docker", [
    "exec",
    ...idpEnv,
    container,
    "genie-ops",
    "idp",
    "set",
    ...spec.idpArgs,
  ]);

  await run("docker", [
    ...compose,
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "genie",
    "-d",
    dbName,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    spec.seedSql,
  ]);
}

/** One query against a brokered deployment's own database, as unaligned text rows. */
export async function queryBrokerDatabase(
  dbName: string,
  sql: string
): Promise<readonly string[]> {
  const { stdout } = await run("docker", [
    ...COMPOSE,
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "genie",
    "-d",
    dbName,
    "-v",
    "ON_ERROR_STOP=1",
    "-t",
    "-A",
    "-c",
    sql,
  ]);

  return stdout.split("\n").filter((line) => line !== "");
}

/** Runs one `genie-ops` command in a brokered deployment's app container. */
export async function brokeredGenieOps(
  suffix: string,
  args: readonly string[]
): Promise<void> {
  await run("docker", [
    "exec",
    scopedProject(`genie-brokered-${suffix}`),
    "genie-ops",
    ...args,
  ]);
}

/** Stops one brokered deployment's container. */
export async function stopBrokered(suffix: string): Promise<void> {
  await run("docker", [
    "rm",
    "-f",
    scopedProject(`genie-brokered-${suffix}`),
  ]).catch(() => undefined);
}

/** True when a brokered deployment is still running, used by a teardown that did not keep it. */
export async function brokeredRunning(suffix: string): Promise<boolean> {
  return containerRunning(scopedProject(`genie-brokered-${suffix}`));
}
