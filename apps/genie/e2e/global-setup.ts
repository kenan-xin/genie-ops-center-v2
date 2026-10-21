import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { GENIE_ADMINISTRATORS_GROUP } from "@genie/core";
import { hashPassword } from "@genie/core/testing";

import {
  allowE2eRealmGroupsAttribute,
  createRealmUser,
  deleteRealm,
  E2E_BREAK_GLASS_PASSWORD,
  E2E_ADMIN_CLIENT_SECRET,
  E2E_BOOTSTRAP_PASSWORD,
  E2E_BOOTSTRAP_USER,
  E2E_LOCAL_ADMIN_PASSWORD,
  E2E_LOCAL_REALM,
  E2E_PROJECTS,
  E2E_READER_SPECS,
  E2E_SIGN_IN_REALM,
  e2eAdministratorEmail,
  e2eBreakGlassEmail,
  e2eGroupsRolesEmail,
  e2eGroupsRolesGroup,
  e2eLocalAdminEmail,
  e2eLocalBaseUrl,
  e2eLocalHostPort,
  e2eOnboardingEmail,
  e2eReaderEmail,
  e2eSignOutEmail,
  E2E_USER_PASSWORD,
  setRealmUserGroups,
  startE2eKeycloak,
  type E2eKeycloak,
} from "../testing/e2e-keycloak.ts";
import { stopIdentityStandins } from "../testing/identity-standins-process.ts";
import { IMAGE } from "../testing/image-tag.ts";
import { scopedPort, scopedProject } from "../testing/worktree-scope.ts";
import { provisionScenarioDeployments } from "./scenarios.ts";
import { provisionClientOnly, stopClientOnly } from "./support/client-only.ts";
import { COMPOSE, COMPOSE_FILE } from "./support/compose.ts";

export { COMPOSE, COMPOSE_FILE } from "./support/compose.ts";

const run = promisify(execFile);

const READY_PORT = Number(
  process.env.GENIE_HOST_PORT ?? process.env.E2E_PORT ?? scopedPort(3400)
);

const PUBLIC_URL = `http://127.0.0.1:${READY_PORT}`;

const READY_URL = `${PUBLIC_URL}/api/health`;

/**
 * The S-F local-accounts stack, beside the shared brokered one: its own compose project, database
 * and realm, on the same Keycloak and Mailpit stand-ins. Its app and browser address is its own
 * scoped port, so the two stacks run in parallel without colliding (todo 3).
 */
export const LOCAL_COMPOSE = [
  "compose",
  "-p",
  scopedProject("genie-s005-e2e-sf"),
  "-f",
  COMPOSE_FILE,
];

const LOCAL_READY_URL = `${e2eLocalBaseUrl()}/api/health`;

const LOCAL_ADMINISTRATOR_EMAILS = E2E_PROJECTS.map(e2eLocalAdminEmail);

/** The mail sink values both stacks pass to their app service (and the local realm step). */
function mailEnv(keycloak: E2eKeycloak) {
  return {
    MAIL_PROVIDER: "smtp",
    MAIL_FROM: "e2e@example.invalid",
    // A container reaches Mailpit through the same host mapping it uses for Keycloak.
    SMTP_URL: `smtp://host.docker.internal:${keycloak.smtpPort}`,
    KEYCLOAK_ADMIN_CLIENT_SECRET: E2E_ADMIN_CLIENT_SECRET,
  };
}

/** The pre-added readers, one per spec and project, which the seed assigns the reader role. */
const READER_EMAILS = E2E_READER_SPECS.flatMap((spec) =>
  E2E_PROJECTS.map((project) => e2eReaderEmail(spec, project))
);

/**
 * The first administrators `tenant.yaml` names, one per Playwright project (Spec 2 R-56, AC-19).
 * `admin_seed` pre-adds each pending, and `Genie Administrators` gives them `Tenant
 * administrator`, so the realm user created here links to that row on first sign-in.
 */
const ADMINISTRATOR_EMAILS = E2E_PROJECTS.map(e2eAdministratorEmail);

/** The break-glass accounts whose email a realm user also holds, one per project (R-62). */
const BREAK_GLASS_EMAILS = E2E_PROJECTS.map(e2eBreakGlassEmail);

const OFFBOARD_EMAILS = E2E_PROJECTS.map((project) =>
  e2eOnboardingEmail("offboarded", project)
);

const ONBOARDING_EMAILS = E2E_PROJECTS.flatMap((project) => [
  e2eOnboardingEmail("admitted", project),
  e2eOnboardingEmail("refused", project),
  e2eOnboardingEmail("offboarded", project),
]);

const MAPPED_GROUP = "E2E mapped";

/** Every realm user the proofs sign in as; a sign-out user is created by its first sign-in. */
const REALM_EMAILS = [
  ...READER_EMAILS,
  ...BREAK_GLASS_EMAILS,
  ...E2E_PROJECTS.map(e2eSignOutEmail),
  ...ONBOARDING_EMAILS,
  ...ADMINISTRATOR_EMAILS,
  ...E2E_PROJECTS.flatMap((project) => [
    e2eGroupsRolesEmail("admitted", project),
    e2eGroupsRolesEmail("refused", project),
  ]),
];

/** One pre-added `user` row per email, as SQL values. */
function userRows(emails: readonly string[], isBreakGlass: boolean): string {
  return emails
    .map(
      (email) =>
        `('${randomUUID()}', 'E2E Person', '${email}', true, 'active', ${isBreakGlass})`
    )
    .join(", ");
}

/**
 * Runs the real `genie-ops setup` inside the app container (Spec 2 R-53, R-54): its realm step
 * creates the tenant realm from the shipped template, and its clients step verifies the three
 * clients. It uses the app's own `KEYCLOAK_URL`, the one browser-visible address (R-54c). The
 * bootstrap credential and the admin client secret reach this one command only (DEC-37).
 */
async function runGenieOpsSetup(
  compose: readonly string[],
  files: Readonly<Record<string, string>>
): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), "genie-e2e-setup-"));

  try {
    await Promise.all(
      Object.entries(files).map(async ([name, text]) => {
        await writeFile(join(folder, name), text, "utf8");
        await run("docker", [
          ...compose,
          "cp",
          join(folder, name),
          `app:/tmp/${name}`,
        ]);
      })
    );

    await run("docker", [
      ...compose,
      "exec",
      "-T",
      "-e",
      `KEYCLOAK_BOOTSTRAP_USER=${E2E_BOOTSTRAP_USER}`,
      "-e",
      `KEYCLOAK_BOOTSTRAP_PASSWORD=${E2E_BOOTSTRAP_PASSWORD}`,
      "-e",
      `KEYCLOAK_ADMIN_CLIENT_SECRET=${E2E_ADMIN_CLIENT_SECRET}`,
      "app",
      "genie-ops",
      "setup",
      "--tenant-config",
      "/tmp/tenant.yaml",
      "--branding-seed",
      "/tmp/branding.seed.json",
    ]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** The shared brokered stack's setup files: `local_accounts: false`, one admin per project. */
function mainSetupFiles() {
  return {
    "tenant.yaml": [
      "modules: []",
      "local_accounts: false",
      "first_administrators:",
      ...ADMINISTRATOR_EMAILS.map((email) => `  - ${email}`),
      `break_glass_email: ${e2eBreakGlassEmail("phone")}`,
      "",
    ].join("\n"),
    "branding.seed.json": JSON.stringify({
      company_name: "E2E Group",
      product_name: "E2E Ops",
      default_locale: "en",
      default_time_zone: "UTC",
    }),
    "realm.overrides.json": "{}",
  };
}

/** The S-F stack's setup files: `local_accounts: true`, so the realm step applies the local variant. */
function localSetupFiles() {
  return {
    "tenant.yaml": [
      "modules: []",
      "local_accounts: true",
      "first_administrators:",
      ...LOCAL_ADMINISTRATOR_EMAILS.map((email) => `  - ${email}`),
      "break_glass_email: e2e.local-break-glass@example.invalid",
      "",
    ].join("\n"),
    "branding.seed.json": JSON.stringify({
      company_name: "E2E Local Group",
      product_name: "E2E Local Ops",
      default_locale: "en",
      default_time_zone: "UTC",
    }),
    "realm.overrides.json": "{}",
  };
}

/**
 * Seeds what setup does not write: the one signed-in person the browser proofs need (a pre-added
 * `user` row, because S2-05 owns onboarding), a role holding `placeholder:read` and the module-use
 * keys, its assignment, one visible placeholder record, and the break-glass account whose email a
 * realm user also holds (R-62). No groups sync exists yet (S2-05), so the assignment is direct.
 *
 * It does not write `tenant_module` rows: setup's `seed` step enables every compiled module before
 * the `roles` step runs, so `roles` appends each module's admin key to `Tenant administrator` the
 * normal way (R-31, R-55) rather than through a raw-SQL enable that bypasses that append.
 */
async function seedTestSetup(): Promise<void> {
  const moduleIds = ["placeholder", process.env.GENIE_MODULE_UNDER_TEST].filter(
    (id) => id !== undefined
  );

  const permissions = [
    "placeholder:read",
    "placeholder:use",
    // The audit log's own browser proof signs in and reads the audit route (R-67).
    "core:audit:read",
    // S2-11: the reader opens the Groups and Roles screens (R-37).
    "core:groups:manage",
    "core:roles:manage",
    // S2-10: the reader opens the People screen (R-37).
    "core:people:manage",
    ...moduleIds.flatMap((id) =>
      id === "placeholder" ? [] : [`${id}:use`, `${id}:read`]
    ),
  ]
    .map((permission) => `'${permission}'`)
    .join(", ");

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
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    [
      "insert into placeholder_record (label) select 'e2e-visible' where not exists (select 1 from placeholder_record where label = 'e2e-visible')",
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values ${userRows(READER_EMAILS, false)}, ${userRows(BREAK_GLASS_EMAILS, true)} on conflict (email) do nothing`,
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values ${userRows(OFFBOARD_EMAILS, false)} on conflict (email) do nothing`,
      `insert into role (name, permissions, is_system) values ('E2E reader', array[${permissions}], false) on conflict (name) do nothing`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'user', u.id from role r, "user" u where r.name = 'E2E reader' and u.email in (${READER_EMAILS.map((email) => `'${email}'`).join(", ")}) on conflict do nothing`,
      // The active administrator the R-38 rule counts, made a member of the `Genie Administrators`
      // group the S2-08 `roles` step seeds and assigned `Tenant administrator` (one source for the
      // admin path). It is its own row, not a reader, so the account page's role summary is
      // unchanged for the other proofs.
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values ('${randomUUID()}', 'E2E Baseline Admin', 'e2e.baseline-admin@example.invalid', true, 'active', false) on conflict (email) do nothing`,
      `insert into group_member (group_id, user_id, source) select g.id, u.id, 'local' from "group" g, "user" u where g.name = '${GENIE_ADMINISTRATORS_GROUP}' and u.email = 'e2e.baseline-admin@example.invalid' on conflict do nothing`,
      `insert into "group" (name, external_id, source) values ('${MAPPED_GROUP}', '${MAPPED_GROUP}', 'idp') on conflict do nothing`,
      `insert into role_assignment (role_id, principal_type, principal_id) select r.id, 'group', g.id::text from role r, "group" g where r.name = 'E2E reader' and g.external_id = '${MAPPED_GROUP}' on conflict do nothing`,
      `insert into group_member (group_id, user_id, source) select g.id, u.id, 'idp' from "group" g, "user" u where g.external_id = '${MAPPED_GROUP}' and u.email in (${OFFBOARD_EMAILS.map((email) => `'${email}'`).join(", ")}) on conflict do nothing`,
      "update tenant_settings set onboarding_mode = 'jit'",
    ].join("; "),
  ]);
}

/**
 * Gives every break-glass account a credential with the known provisioning password and the R-65
 * initial flags (`must_change_password` true, no authenticator), so the browser proof can run the
 * forced first sign-in. The real `break_glass` step prints its own generated value; this test-only
 * hash is written with SQL, through the app's own hasher so `verifyPassword` accepts it.
 */
async function seedBreakGlassAccounts(): Promise<void> {
  const hash = await hashPassword(E2E_BREAK_GLASS_PASSWORD);

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
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    [
      `update "user" set must_change_password = true, two_factor_enabled = false, email_verified = true, status = 'active' where is_break_glass`,
      `delete from session where user_id in (select id from "user" where is_break_glass)`,
      `delete from two_factor where user_id in (select id from "user" where is_break_glass)`,
      `delete from account where provider_id = 'credential' and user_id in (select id from "user" where is_break_glass)`,
      `insert into account (id, account_id, provider_id, user_id, password) select gen_random_uuid(), u.id, 'credential', u.id, '${hash}' from "user" u where u.is_break_glass`,
    ].join("; "),
  ]);
}

/**
 * Turns local-account creation on in the S-F stack's settings, the way the Tenant Settings page
 * would. The realm step has written `realm_supports_local_accounts` from the local variant; this
 * sets the operator's own switch, so Add person offers the local account type (R-40).
 */
async function seedLocalSetup(): Promise<void> {
  await run("docker", [
    ...LOCAL_COMPOSE,
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "genie",
    "-d",
    "genie",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "update tenant_settings set local_accounts_enabled = true, onboarding_mode = 'invite'",
  ]);
}

/**
 * Polls readiness sequentially; each attempt exists only because the previous one did not answer.
 * `body` names the health answer to wait for; without it any 200 is ready.
 */
async function waitForReady(url: string, body?: "ok"): Promise<boolean> {
  const deadline = Date.now() + 120000;

  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    const ready = await fetch(url)
      .then(
        async (response) =>
          response.status === 200 &&
          (body === undefined || (await response.text()) === body)
      )
      .catch(() => false);

    if (ready) return true;

    await new Promise((settle) => setTimeout(settle, 500));
  }
  /* eslint-enable no-await-in-loop */

  return false;
}

export default async function globalSetup(): Promise<void> {
  // A targeted run may have started its own deployment already, for example the
  // failing-provider case. Starting a second stack would collide on the host
  // port, so this hook stands aside when one is supplied.
  if (process.env.GENIE_E2E_EXTERNAL === "1") return;

  if (!existsSync(resolve(process.cwd(), COMPOSE_FILE))) {
    throw new Error(
      `No ${COMPOSE_FILE} under ${process.cwd()}. Run Playwright from the workspace root, or set GENIE_E2E_EXTERNAL=1 to use a deployment you started yourself.`
    );
  }

  let keycloak: E2eKeycloak | undefined;

  try {
    // A crashed run can leave the client-only `docker compose run` container behind, and
    // `docker compose exec app` falls back to it when the shared stack's own app container is
    // not running, running commands against the client-only database. Clear it before `up`.
    await stopClientOnly();

    const setupGate = process.env.GENIE_E2E_SETUP_GATE === "1";

    // The tenant realm lives in the identity stand-in Keycloak, which runs as its own compose
    // stack. The app and the browser both use the one browser-visible address it advertises. The
    // setup run below creates the realm, so a realm a previous run left is removed first.
    keycloak = await startE2eKeycloak({
      realm: E2E_SIGN_IN_REALM,
      createRealm: setupGate,
    });

    // A project name scoped to this worktree, so teardown and the pre-run cleanup
    // find this stack without a state file and without another worktree's stack,
    // and the host port is the one the readiness probe waits on.
    await run("docker", [...COMPOSE, "up", "-d", "--wait"], {
      env: {
        ...process.env,
        // This worktree's image, not the shared fixed tag another worktree's build can overwrite.
        GENIE_IMAGE: IMAGE,
        GENIE_HOST_PORT: String(READY_PORT),
        PUBLIC_URL,
        KEYCLOAK_URL: keycloak.keycloakUrl,
        KEYCLOAK_REALM: keycloak.realm,
        KEYCLOAK_CLIENT_ID: keycloak.clientId,
        KEYCLOAK_CLIENT_SECRET: keycloak.clientSecret,
        ...mailEnv(keycloak),
      },
    });

    if (!(await waitForReady(READY_URL))) {
      const logs = await run("docker", [...COMPOSE, "logs"]).catch(() => ({
        stdout: "",
        stderr: "",
      }));

      throw new Error(
        `The compose deployment never became ready.\n${logs.stdout}${logs.stderr}`
      );
    }

    if (!setupGate) {
      await runGenieOpsSetup(COMPOSE, mainSetupFiles());
      await allowE2eRealmGroupsAttribute(E2E_SIGN_IN_REALM);

      await Promise.all(
        REALM_EMAILS.map((email) =>
          createRealmUser(E2E_SIGN_IN_REALM, {
            email,
            password: E2E_USER_PASSWORD,
          })
        )
      );

      await Promise.all(
        E2E_PROJECTS.flatMap((project) => [
          setRealmUserGroups(
            E2E_SIGN_IN_REALM,
            e2eOnboardingEmail("admitted", project),
            [MAPPED_GROUP]
          ),
          setRealmUserGroups(
            E2E_SIGN_IN_REALM,
            e2eOnboardingEmail("refused", project),
            ["Unmapped"]
          ),
          setRealmUserGroups(
            E2E_SIGN_IN_REALM,
            e2eOnboardingEmail("offboarded", project),
            [MAPPED_GROUP]
          ),
          setRealmUserGroups(E2E_SIGN_IN_REALM, e2eSignOutEmail(project), [
            MAPPED_GROUP,
          ]),
          setRealmUserGroups(
            E2E_SIGN_IN_REALM,
            e2eGroupsRolesEmail("admitted", project),
            [e2eGroupsRolesGroup(project)]
          ),
          setRealmUserGroups(
            E2E_SIGN_IN_REALM,
            e2eGroupsRolesEmail("refused", project),
            [e2eGroupsRolesGroup(project)]
          ),
        ])
      );

      await seedTestSetup();

      // After seedTestSetup: the seed inserts the break-glass rows for every project, and this
      // gives each of them the known credential and the R-65 first-sign-in flags.
      await seedBreakGlassAccounts();

      // The S2-13 brokered scenarios need their own realms (brokering sends every sign-in to the
      // provider), so they run as extra app containers with their own databases.
      await provisionScenarioDeployments(COMPOSE, keycloak);

      // The S-F local-accounts stack: its own realm (the local variant) on the same Keycloak and
      // its own database, so the brokered proofs above and the S-F proofs run side by side (todo 2).
      await deleteRealm(E2E_LOCAL_REALM).catch(() => undefined);

      await run("docker", [...LOCAL_COMPOSE, "up", "-d", "--wait"], {
        env: {
          ...process.env,
          GENIE_IMAGE: IMAGE,
          GENIE_HOST_PORT: String(e2eLocalHostPort()),
          PUBLIC_URL: e2eLocalBaseUrl(),
          KEYCLOAK_URL: keycloak.keycloakUrl,
          KEYCLOAK_REALM: E2E_LOCAL_REALM,
          KEYCLOAK_CLIENT_ID: keycloak.clientId,
          KEYCLOAK_CLIENT_SECRET: keycloak.clientSecret,
          ...mailEnv(keycloak),
        },
      });

      if (!(await waitForReady(LOCAL_READY_URL))) {
        const logs = await run("docker", [...LOCAL_COMPOSE, "logs"]).catch(
          () => ({ stdout: "", stderr: "" })
        );

        throw new Error(
          `The local-accounts stack never became ready.\n${logs.stdout}${logs.stderr}`
        );
      }

      // The local realm step needs MAIL_PROVIDER=smtp with MAIL_FROM and SMTP_URL, which the
      // container already carries, so it fills the realm's SMTP from the same Mailpit sink.
      await runGenieOpsSetup(LOCAL_COMPOSE, localSetupFiles());

      await Promise.all(
        LOCAL_ADMINISTRATOR_EMAILS.map((email) =>
          createRealmUser(E2E_LOCAL_REALM, {
            email,
            // The local realm's policy needs an upper case and a special character.
            password: E2E_LOCAL_ADMIN_PASSWORD,
          })
        )
      );

      await seedLocalSetup();

      // S2-15 client-only mode: the same company realm plays the customer's existing realm, into
      // which the two shipped client files are imported, and a `realm: customer` deployment runs
      // against it (R-54a, AC-12a).
      await provisionClientOnly(keycloak);

      // Discovery was refused while the realm did not exist; the member retries at most every ten
      // seconds, so the proofs start once health reads `ok` (R-54d).
      if (!(await waitForReady(READY_URL, "ok"))) {
        throw new Error(
          "The e2e deployment never answered health ok after setup."
        );
      }

      if (!(await waitForReady(LOCAL_READY_URL, "ok"))) {
        throw new Error(
          "The local-accounts deployment never answered health ok after setup."
        );
      }
    }
  } catch (error) {
    await stopIdentityStandins();

    throw error;
  }
}
