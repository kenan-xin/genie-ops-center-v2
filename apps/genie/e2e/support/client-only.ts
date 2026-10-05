import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { type JsonObject } from "@genie/core";
import {
  CLIENT_FILE_DIRECTORY,
  OPS_CENTER_CLIENT_FILE,
  renderClientFile,
  STUDIO_CLIENT_FILE,
} from "@genie/core/testing";

import {
  COMPANY_REALM,
  companyPassword,
  createRealmUser,
  deleteRealmUser,
  E2E_PROJECTS,
  importRealmClient,
  realmClientSecret,
  setRealmUserGroupMemberships,
  type E2eKeycloak,
} from "../../testing/e2e-keycloak.ts";
import { scopedPort, scopedProject } from "../../testing/worktree-scope.ts";
import { COMPOSE } from "./compose.ts";

const run = promisify(execFile);

/**
 * The S-C deployment of client-only mode (Spec 2 R-54a, AC-12a). One app container with its own
 * database points at the stand-in `company` realm, which plays the customer's existing realm. The
 * customer's IT imports the two shipped client files into that realm, and setup runs with
 * `realm: customer`, so it creates no realm and no `genie-admin` client.
 *
 * The client is deliberately renamed (`CLIENT_ONLY_CLIENT_ID`), so a successful sign-in proves the
 * `aud` check honours `KEYCLOAK_CLIENT_ID` (R-54a, R-54d).
 */
export const CLIENT_ONLY_DB = "genie_client_only";

/** The renamed `genie-ops-center` client, as the customer may rename it (R-54a). */
export const CLIENT_ONLY_CLIENT_ID = "genie-ops-center-renamed";

/** The company-realm group the S-C database maps to a role (the client file's mapper emits it). */
export const CLIENT_ONLY_GROUP = "genie-admins";

/** The base host port, moved aside for this worktree so two runs never collide. */
export function clientOnlyPort(): number {
  return scopedPort(3700);
}

export function clientOnlyBaseUrl(): string {
  return `http://127.0.0.1:${clientOnlyPort()}`;
}

/** The company-realm address of one project's S-C person. */
export function clientOnlyEmail(project: string): string {
  return `e2e.s2-15.s-c.${project}@company.example`;
}

/** The seed SQL the S-C database gets after setup: a reader role, the mapped group, jit. */
const CLIENT_ONLY_SEED = [
  `insert into role (name, permissions, is_system) values ('S2-15 reader', array['placeholder:read', 'placeholder:use'], false) on conflict (name) do nothing`,
  `insert into "group" (name, external_id, source) values ('${CLIENT_ONLY_GROUP}', '${CLIENT_ONLY_GROUP}', 'idp') on conflict do nothing`,
  `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'group', g.id::text from role r, "group" g where r.name = 'S2-15 reader' and g.external_id = '${CLIENT_ONLY_GROUP}' on conflict do nothing`,
  "update tenant_settings set onboarding_mode = 'jit'",
].join("; ");

async function ensureDatabase(dbName: string): Promise<void> {
  // ON_ERROR_STOP is off: a rerun's duplicate-database error is not a failure.
  await run("docker", [
    ...COMPOSE,
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "genie",
    "-d",
    "genie",
    "-c",
    `create database ${dbName}`,
  ]).catch(() => undefined);
}

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

  throw new Error(`the client-only app at ${baseUrl} never became healthy`);
}

/** Writes the setup files for client-only mode and copies them into the container. */
async function copySetupFiles(container: string): Promise<{
  readonly tenantConfig: string;
  readonly brandingSeed: string;
}> {
  const folder = await mkdtemp(join(tmpdir(), "genie-client-only-"));

  const tenantConfig = join(folder, "tenant.yaml");
  const brandingSeed = join(folder, "branding.seed.json");

  await writeFile(
    tenantConfig,
    [
      "modules: []",
      "realm: customer",
      "local_accounts: false",
      "first_administrators:",
      "  - client-only-admin@example.invalid",
      "break_glass_email: client-only-break-glass@example.invalid",
      "",
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    brandingSeed,
    JSON.stringify({
      company_name: "Client Only Group",
      product_name: "Client Only Ops",
      default_locale: "en",
      default_time_zone: "UTC",
    }),
    "utf8"
  );

  await run("docker", ["cp", tenantConfig, `${container}:/tmp/tenant.yaml`]);
  await run("docker", [
    "cp",
    brandingSeed,
    `${container}:/tmp/branding.seed.json`,
  ]);

  await rm(folder, { recursive: true, force: true });

  return {
    tenantConfig: "/tmp/tenant.yaml",
    brandingSeed: "/tmp/branding.seed.json",
  };
}

/** Reads the two shipped client files and renders them for this deployment's URL. */
async function renderedClientFiles(baseUrl: string): Promise<{
  readonly opsCenter: JsonObject;
  readonly studio: JsonObject;
}> {
  const folder = resolve(process.cwd(), CLIENT_FILE_DIRECTORY);

  return {
    opsCenter: {
      ...(await renderClientFile(
        join(folder, OPS_CENTER_CLIENT_FILE),
        baseUrl
      )),
      clientId: CLIENT_ONLY_CLIENT_ID,
    },
    studio: await renderClientFile(join(folder, STUDIO_CLIENT_FILE), baseUrl),
  };
}

/**
 * Provisions the S-C deployment: the customer's IT imports the two client files into the company
 * realm, the container starts with the returned secret and the renamed client id, setup runs in
 * client-only mode, and the database and company people are seeded.
 */
export async function provisionClientOnly(
  keycloak: E2eKeycloak
): Promise<void> {
  const container = scopedProject("genie-client-only");
  const baseUrl = clientOnlyBaseUrl();

  await ensureDatabase(CLIENT_ONLY_DB);
  await run("docker", ["rm", "-f", container]).catch(() => undefined);

  const { opsCenter, studio } = await renderedClientFiles(baseUrl);

  await importRealmClient(COMPANY_REALM, opsCenter);
  await importRealmClient(COMPANY_REALM, studio);

  const clientSecret = await realmClientSecret(
    COMPANY_REALM,
    CLIENT_ONLY_CLIENT_ID
  );

  await run("docker", [
    ...COMPOSE,
    "run",
    "-d",
    "--no-deps",
    "--name",
    container,
    "-p",
    `${clientOnlyPort()}:3400`,
    "-e",
    `DATABASE_URL=postgres://genie:genie@database:5432/${CLIENT_ONLY_DB}`,
    "-e",
    `PUBLIC_URL=${baseUrl}`,
    "-e",
    `KEYCLOAK_URL=${keycloak.keycloakUrl}`,
    "-e",
    `KEYCLOAK_REALM=${COMPANY_REALM}`,
    "-e",
    `KEYCLOAK_CLIENT_ID=${CLIENT_ONLY_CLIENT_ID}`,
    "-e",
    `KEYCLOAK_CLIENT_SECRET=${clientSecret}`,
    // The customer's realm is on an outside server, so no bundled Keycloak profile (R-54b, R-54c).
    "-e",
    "STACK_PROFILES=",
    "app",
  ]);

  await waitForHealth(baseUrl);

  const files = await copySetupFiles(container);

  await run("docker", [
    "exec",
    container,
    "genie-ops",
    "setup",
    "--tenant-config",
    files.tenantConfig,
    "--branding-seed",
    files.brandingSeed,
  ]);

  await run("docker", [
    ...COMPOSE,
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "genie",
    "-d",
    CLIENT_ONLY_DB,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    CLIENT_ONLY_SEED,
  ]);

  await seedCompanyPeople();
}

/** One S-C person per Playwright project, with the group the client file's mapper emits. */
async function seedCompanyPeople(): Promise<void> {
  for (const project of E2E_PROJECTS) {
    const email = clientOnlyEmail(project);

    // oxlint-disable-next-line no-await-in-loop -- each person is recreated on its own.
    await deleteRealmUser(COMPANY_REALM, email);

    // oxlint-disable-next-line no-await-in-loop -- each person is created on its own.
    await createRealmUser(COMPANY_REALM, {
      email,
      password: companyPassword(),
    });

    // oxlint-disable-next-line no-await-in-loop -- each person is joined on its own.
    await setRealmUserGroupMemberships(COMPANY_REALM, email, [
      CLIENT_ONLY_GROUP,
    ]);
  }
}
