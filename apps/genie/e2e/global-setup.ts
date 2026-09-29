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
import {
  allowE2eRealmGroupsAttribute,
  createRealmUser,
  E2E_BREAK_GLASS_PASSWORD,
  E2E_ADMIN_CLIENT_SECRET,
  E2E_BOOTSTRAP_PASSWORD,
  E2E_BOOTSTRAP_USER,
  E2E_PROJECTS,
  E2E_READER_SPECS,
  E2E_SIGN_IN_REALM,
  e2eAdministratorEmail,
  e2eBreakGlassEmail,
  e2eGroupsRolesEmail,
  e2eGroupsRolesGroup,
  e2eOnboardingEmail,
  e2eReaderEmail,
  e2eSignOutEmail,
  E2E_USER_PASSWORD,
  setRealmUserGroups,
  startE2eKeycloak,
  type E2eKeycloak,
} from "../testing/e2e-keycloak.ts";
import { stopIdentityStandins } from "../testing/identity-standins-process.ts";
import { scopedPort, scopedProject } from "../testing/worktree-scope.ts";

const run = promisify(execFile);

/**
 * The compose file, relative to the workspace root. Playwright is invoked from
 * the workspace root (the documented command), and the guard below fails loudly
 * rather than starting nothing if it is not, because a missing `-f` target is
 * otherwise a silent `up` of an empty stack.
 */
const COMPOSE_FILE = "deploy/stack/compose.e2e.yaml";

const READY_PORT = Number(
  process.env.GENIE_HOST_PORT ?? process.env.E2E_PORT ?? scopedPort(3400)
);

const PUBLIC_URL = `http://127.0.0.1:${READY_PORT}`;

const READY_URL = `${PUBLIC_URL}/api/health`;

export const COMPOSE = [
  "compose",
  "-p",
  scopedProject("genie-s005-e2e"),
  "-f",
  COMPOSE_FILE,
];

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
async function runGenieOpsSetup(): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), "genie-e2e-setup-"));

  try {
    const files = {
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

    await Promise.all(
      Object.entries(files).map(async ([name, text]) => {
        await writeFile(join(folder, name), text, "utf8");
        await run("docker", [
          ...COMPOSE,
          "cp",
          join(folder, name),
          `app:/tmp/${name}`,
        ]);
      })
    );

    await run("docker", [
      ...COMPOSE,
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
 * Polls readiness sequentially; each attempt exists only because the previous one did not answer.
 * `body` names the health answer to wait for; without it any 200 is ready.
 */
async function waitForReady(body?: "ok"): Promise<boolean> {
  const deadline = Date.now() + 120000;

  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    const ready = await fetch(READY_URL)
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
        GENIE_HOST_PORT: String(READY_PORT),
        PUBLIC_URL,
        KEYCLOAK_URL: keycloak.keycloakUrl,
        KEYCLOAK_REALM: keycloak.realm,
        KEYCLOAK_CLIENT_ID: keycloak.clientId,
        KEYCLOAK_CLIENT_SECRET: keycloak.clientSecret,
      },
    });

    if (!(await waitForReady())) {
      const logs = await run("docker", [...COMPOSE, "logs"]).catch(() => ({
        stdout: "",
        stderr: "",
      }));

      throw new Error(
        `The compose deployment never became ready.\n${logs.stdout}${logs.stderr}`
      );
    }

    if (!setupGate) {
      await runGenieOpsSetup();
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

      // Discovery was refused while the realm did not exist; the member retries at most every ten
      // seconds, so the proofs start once health reads `ok` (R-54d).
      if (!(await waitForReady("ok"))) {
        throw new Error(
          "The e2e deployment never answered health ok after setup."
        );
      }
    }
  } catch (error) {
    await stopIdentityStandins();

    throw error;
  }
}
