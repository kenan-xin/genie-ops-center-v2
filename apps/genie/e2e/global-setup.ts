import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
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

/** The signed-in person's app row id, so the seed can assign them a role. */
const PERSON_ID = randomUUID();

/**
 * Seeds the rows `genie-ops setup` would write, plus the one signed-in person the browser proofs
 * need: a pre-added `user` row (S2-05 owns onboarding, so the row is created here), a role holding
 * `placeholder:read` and the module-use keys, its assignment, and one visible placeholder record.
 * No groups sync exists yet (S2-05), so the assignment is direct.
 */
async function seedTestSetup(): Promise<void> {
  const moduleIds = ["placeholder", process.env.GENIE_MODULE_UNDER_TEST].filter(
    (id) => id !== undefined
  );

  const moduleRows = moduleIds.map((id) => `('${id}', true)`).join(", ");

  const permissions = [
    "placeholder:read",
    "placeholder:use",
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
      `insert into tenant_module (module_id, enabled) values ${moduleRows} on conflict (module_id) do update set enabled = true`,
      "insert into setup_step (step, state) values ('migrations', 'done'), ('seed', 'done'), ('realm', 'done'), ('clients', 'done') on conflict (step) do update set state = 'done', detail = null, updated_at = now()",
      "insert into placeholder_record (label) select 'e2e-visible' where not exists (select 1 from placeholder_record where label = 'e2e-visible')",
      `insert into "user" (id, name, email, email_verified, status, is_break_glass) values ('${PERSON_ID}', 'E2E Person', '${E2E_USER_EMAIL}', true, 'active', false) on conflict (email) do nothing`,
      `insert into role (name, permissions, is_system) values ('E2E reader', array[${permissions}], false) on conflict (name) do nothing`,
      `insert into role_assignment (role_id, principal_type, principal_id) select id, 'user', '${PERSON_ID}' from role where name = 'E2E reader' on conflict do nothing`,
    ].join("; "),
  ]);
}

/** Polls readiness sequentially; each attempt exists only because the previous one did not answer. */
async function waitForReady(): Promise<boolean> {
  const deadline = Date.now() + 120000;

  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    const ready = await fetch(READY_URL)
      .then((response) => response.status === 200)
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
    // The tenant realm lives in the identity stand-in Keycloak, which runs as its own compose
    // stack. The app and the browser both use the one browser-visible address it advertises.
    keycloak = await startE2eKeycloak({ publicUrl: PUBLIC_URL });
    await keycloak.createUser({
      email: E2E_USER_EMAIL,
      password: E2E_USER_PASSWORD,
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

    if (process.env.GENIE_E2E_SETUP_GATE !== "1") {
      await seedTestSetup();
    }
  } catch (error) {
    await stopIdentityStandins();

    throw error;
  }
}
