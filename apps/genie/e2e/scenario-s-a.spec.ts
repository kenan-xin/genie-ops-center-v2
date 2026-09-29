import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

import {
  E2E_SIGN_IN_REALM,
  e2eReaderEmail,
  standinKeycloakPort,
  standinKeycloakUrl,
} from "../testing/e2e-keycloak.ts";
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

/**
 * Scenario S-A: Ops Center hosts the customer, and the realm lives on an outside Keycloak
 * (Genie's shared server), not on the stack. The e2e stack's identity stand-in plays that server:
 * the stack runs without the `bundled-keycloak` profile, `genie-ops setup` creates the customer
 * realm on it, and sign-in works through the one browser-visible address (Spec 2 R-54b to R-54d,
 * AC-12a). The spec runs at the phone and desktop viewports through the two Playwright projects.
 */
test("S-A: without the bundled-keycloak profile, setup creates the realm outside and sign-in works", async ({
  page,
}, testInfo) => {
  const keycloakUrl = standinKeycloakUrl();

  // R-54b: the stack does not run its own Keycloak, so no Compose profile started it.
  expect(await appEnv("STACK_PROFILES")).toBeUndefined();

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

  // Sign-in against the outside server lands the person in the workspace.
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("s-a", testInfo.project.name),
  });

  expect(new URL(page.url()).pathname).toBe("/");
});
