import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

import {
  E2E_CLIENT_ID,
  E2E_CLIENT_SECRET,
  E2E_SIGN_IN_REALM,
  e2eReaderEmail,
  standinKeycloakPort,
  standinKeycloakUrl,
} from "../testing/e2e-keycloak.ts";
import { IMAGE } from "../testing/image-tag.ts";
import { scopedProject } from "../testing/worktree-scope.ts";
import { COMPOSE } from "./global-setup.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

const run = promisify(execFile);

/** One environment value of the running app container; `printenv` exits 1 when it is unset. */
async function appEnv(name: string): Promise<string | undefined> {
  try {
    const { stdout } = await run("docker", [
      ...COMPOSE,
      "exec",
      "-T",
      "app",
      "printenv",
      name,
    ]);

    return stdout.trim();
  } catch {
    return undefined;
  }
}

/** Reads `/api/health` from inside a container, where the app binds its own port. */
const HEALTH_PROBE =
  'fetch("http://127.0.0.1:3400/api/health").then((r) => r.text()).then((t) => process.stdout.write(t)).catch(() => {})';

/**
 * Starts a second app instance against the same set-up database and the same outside Keycloak, on
 * the same network as the running stack, with no `bundled-keycloak` profile. This is the S-A stack
 * starting after setup: both start guards run (`keycloak_url_at_setup` is recorded and setup is
 * satisfied), so a health of `ok` proves the set-up stack passes its own address guard and issuer
 * check (R-54c, R-54d).
 *
 * A second instance rather than a restart of the shared one: the browser suite runs many specs in
 * parallel against one app container, and restarting it would fail whichever specs are mid-flight.
 */
async function setUpStackHealth(project: string): Promise<{
  readonly health: string;
  readonly logs: string;
}> {
  const name = scopedProject(`genie-s-a-guard-${project}`);

  await run("docker", ["rm", "-f", name]).catch(() => undefined);

  await run(
    "docker",
    [
      ...COMPOSE,
      "run",
      "-d",
      "--no-deps",
      "--name",
      name,
      "-e",
      `KEYCLOAK_URL=${standinKeycloakUrl()}`,
      "-e",
      `KEYCLOAK_REALM=${E2E_SIGN_IN_REALM}`,
      "-e",
      `KEYCLOAK_CLIENT_ID=${E2E_CLIENT_ID}`,
      "-e",
      `KEYCLOAK_CLIENT_SECRET=${E2E_CLIENT_SECRET}`,
      "app",
    ],
    // This worktree's image, not the shared fixed tag another worktree's build can overwrite.
    { env: { ...process.env, GENIE_IMAGE: IMAGE } }
  );

  try {
    let health = "";
    const deadline = Date.now() + 90000;

    /* eslint-disable no-await-in-loop -- polling waits for this container's own start. */
    while (Date.now() < deadline) {
      health = await run("docker", ["exec", name, "node", "-e", HEALTH_PROBE])
        .then(({ stdout }) => stdout.trim())
        .catch(() => "");

      if (health !== "") break;

      await sleep(500);
    }
    /* eslint-enable no-await-in-loop */

    const logs = await run("docker", ["logs", name])
      .then(({ stdout, stderr }) => `${stdout}${stderr}`)
      .catch(() => "");

    return { health, logs };
  } finally {
    await run("docker", ["rm", "-f", name]).catch(() => undefined);
  }
}

/**
 * Scenario S-A: Ops Center hosts the customer, and the realm lives on an outside Keycloak
 * (Genie's shared server), not on the stack. The e2e stack's identity stand-in plays that server:
 * the stack runs without the `bundled-keycloak` profile, `genie-ops setup` creates the customer
 * realm on it, a set-up stack passes its keycloak guard, and sign-in works through the one
 * browser-visible address (Spec 2 R-54b to R-54d, AC-12a). The spec runs at the phone and desktop
 * viewports through the two Playwright projects.
 */
test("S-A: without the bundled-keycloak profile, setup creates the realm outside and sign-in works", async ({
  page,
}, testInfo) => {
  const keycloakUrl = standinKeycloakUrl();

  // R-54b: the stack runs no Keycloak of its own, so STACK_PROFILES is empty rather than naming
  // the bundled-keycloak profile.
  expect(await appEnv("STACK_PROFILES")).toBe("");

  // The one browser-visible address the app and the browser both use is the outside server.
  expect(await appEnv("KEYCLOAK_URL")).toBe(keycloakUrl);

  // R-54c: setup recorded the address it used, in managed mode.
  expect(
    await queryDatabase(
      "select realm_mode || ' ' || keycloak_url_at_setup from tenant_settings"
    )
  ).toEqual([`managed ${keycloakUrl}`]);

  // The realm `genie-ops setup` created exists on the outside server, and its discovery document
  // advertises that same address as its issuer (R-54d).
  const discovery = await fetch(
    `http://127.0.0.1:${standinKeycloakPort()}/realms/${E2E_SIGN_IN_REALM}/.well-known/openid-configuration`
  );

  expect(discovery.status).toBe(200);

  // SAFETY: the discovery endpoint answers the documented JSON shape; only `issuer` is read.
  const document = (await discovery.json()) as { readonly issuer?: string };

  expect(document.issuer).toBe(`${keycloakUrl}/realms/${E2E_SIGN_IN_REALM}`);

  // A stack that starts after setup passes both start guards: health is `ok`, not `degraded`.
  const guard = await setUpStackHealth(testInfo.project.name);

  expect(guard.health, guard.logs).toBe("ok");

  // Sign-in against the outside server lands the person in the workspace.
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("s-a", testInfo.project.name),
  });

  expect(new URL(page.url()).pathname).toBe("/");
});
