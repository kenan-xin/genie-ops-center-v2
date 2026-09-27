import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  SMOKE_REALM,
  generateTenantDeploy,
  startGeneratedStack,
  type GeneratedStack,
} from "./generated-stack-process.ts";
import { buildImageWith, removeImage, requireDocker } from "./image-process.ts";
import { testImageTag } from "./image-tag.ts";
import { scopedPort } from "./worktree-scope.ts";

const SLUG = `smoke-${process.pid}-${Date.now()}`;

const IMAGE_TAG = testImageTag("genie-s1-05-stack", "test");

const NOT_SET_UP = "This deployment is not set up yet";

const DATABASE_PASSWORD = `generated-stack-password-${process.pid}`;

const SECRET_VALUE = `generated-stack-secret-${process.pid}`;

/** The one-run Keycloak administrator the realm step signs in with (KC_BOOTSTRAP_ADMIN_*). */
const BOOTSTRAP_PASSWORD = `smoke-bootstrap-${process.pid}`;

/** Polls `probe` until it returns a value `done` accepts, and returns the last value seen. */
async function pollUntil<T>(
  probe: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;

  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    last = await probe().catch(() => undefined);

    if (last !== undefined && done(last)) return last;

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  /* eslint-enable no-await-in-loop */

  return last;
}

// The cases share one running stack and run in file order: AC-15 is observed before setup,
// and the served-page case runs after the setup case opened the gate.
describe("the generated customer stack smoke", () => {
  let stack: GeneratedStack | undefined;
  let generated: Awaited<ReturnType<typeof generateTenantDeploy>> | undefined;

  const running = (): GeneratedStack => {
    if (stack === undefined) throw new Error("generated stack did not start");

    return stack;
  };

  beforeAll(async () => {
    await requireDocker();
    generated = await generateTenantDeploy(SLUG);
    expect(generated.moduleInclude).toBe("");
    await buildImageWith(generated.moduleInclude, IMAGE_TAG);
    // Only the names an operator fills by hand; everything else comes from .env.example.
    stack = await startGeneratedStack({
      slug: SLUG,
      imageTag: IMAGE_TAG,
      compose: generated.compose,
      envExample: generated.envExample,
      tenantConfigPath: generated.tenantConfigPath,
      brandingSeedPath: generated.brandingSeedPath,
      realmOverridesPath: generated.realmOverridesPath,
      databasePassword: DATABASE_PASSWORD,
      filled: {
        PUBLIC_URL: "https://example.invalid",
        // The one browser-visible Keycloak address (Spec 2 R-54c/d): the app container reaches it
        // through the host-gateway alias, and the smoke publishes the bundled Keycloak on this host
        // port and points KC_HOSTNAME at the same address.
        KEYCLOAK_URL: `http://host.docker.internal:${scopedPort(16080)}`,
        KEYCLOAK_REALM: SMOKE_REALM,
        KEYCLOAK_CLIENT_ID: "genie-ops-center",
        BETTER_AUTH_SECRET: "smoke-better-auth-secret-at-least-32-chars",
        RESEND_API_KEY: SECRET_VALUE,
        S3_SECRET_ACCESS_KEY: SECRET_VALUE,
        KC_DB: "postgres",
        KC_DB_URL_HOST: `${SLUG}-postgres`,
        KC_DB_URL_DATABASE: "keycloak",
        KC_DB_USERNAME: "genie",
        KC_DB_PASSWORD: DATABASE_PASSWORD,
        KC_PROXY_HEADERS: "xforwarded",
        // The one-run master administrator the setup realm step signs in with, and
        // the two client secrets it fills into the realm (Spec 2 R-53, DEC-37).
        KC_BOOTSTRAP_ADMIN_USERNAME: "admin",
        KC_BOOTSTRAP_ADMIN_PASSWORD: BOOTSTRAP_PASSWORD,
        KEYCLOAK_CLIENT_SECRET: SECRET_VALUE,
        KEYCLOAK_ADMIN_CLIENT_SECRET: SECRET_VALUE,
      },
    });
  }, 900000);

  afterAll(async () => {
    await stack?.stop();
    await generated?.remove();
    await removeImage(IMAGE_TAG);
  });

  // AC-15: before setup the health endpoint answers degraded (also 200) and `/` is gated.
  it("answers degraded health and serves the not-set-up page before setup", async () => {
    const health = await pollUntil(
      async () => {
        const response = await running().request("/api/health");

        return { status: response.status, body: await response.text() };
      },
      ({ status }) => status === 200,
      120000
    );

    expect(
      health?.status,
      "generated app never served its health endpoint"
    ).toBe(200);
    expect(health?.body).toBe("degraded");

    const page = await running().request("/");

    expect(page.status).toBe(200);
    expect(await page.text()).toContain(NOT_SET_UP);
  }, 180000);

  // F4: the worker (same image, heartbeat check) and Keycloak start from the generated file.
  it("brings the worker to healthy and Keycloak to serve in production mode", async () => {
    const worker = await pollUntil(
      async () => running().serviceState("worker"),
      ({ health }) => health === "healthy" || health === "unhealthy",
      300000
    );

    expect(worker?.running, "worker container is not running").toBe(true);
    expect(worker?.health).toBe("healthy");

    const keycloakUrl = `http://${SLUG}-keycloak:8080/`;

    const keycloak = await pollUntil(
      async () => running().requestFromApp(keycloakUrl),
      ({ status }) => status === 200 || status === 302,
      240000
    );

    expect(
      [200, 302],
      `Keycloak never served its root at ${keycloakUrl}`
    ).toContain(keycloak?.status);

    // The generated readiness check on the management port passes (KC_HEALTH_ENABLED).
    const keycloakState = await pollUntil(
      async () => running().serviceState("keycloak"),
      ({ health }) => health === "healthy" || health === "unhealthy",
      180000
    );

    expect(keycloakState?.running, "Keycloak container is not running").toBe(
      true
    );
    expect(keycloakState?.health).toBe("healthy");
  }, 780000);

  // AC-16: the real `genie-ops setup` in the running stack sets both steps done.
  it("runs genie-ops setup in the running stack, clears the page and answers ok", async () => {
    await running().runSetup();
    const health = await running().request("/api/health");

    expect(await health.text()).toBe("ok");

    const page = await running().request("/");

    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain(NOT_SET_UP);
  }, 240000);

  it("serves the customer page and health while the excluded placeholder module is absent", async () => {
    const readyHealth = await running().request("/api/health");

    const page = await running().request("/");

    const excludedRoutes = [
      "/placeholder",
      "/placeholder/archive",
      "/placeholder/retired",
      "/admin/placeholder",
      "/viewer/placeholder",
      "/m/placeholder",
      "/admin/m/placeholder",
      "/api/trpc/placeholder.read?input=%7B%7D",
      "/api/m/placeholder/fixture/hooks",
    ];

    const tableNames = await running().tableNames();

    expect(await readyHealth.text()).toBe("ok");

    expect(page.status).toBe(200);

    expect(page.headers.get("content-type")).toContain("text/html");

    expect(await page.text()).toContain("<main");

    // R-31 distinguishes module absence from a compiled module refusing access.
    /* eslint-disable no-await-in-loop */
    for (const route of excludedRoutes) {
      expect(
        await running()
          .request(route)
          .then(({ status }) => status),
        route
      ).toBe(404);
    }
    /* eslint-enable no-await-in-loop */

    expect(tableNames).not.toContain("placeholder_record");

    expect(tableNames).not.toContain("__drizzle_migrations_placeholder");
  }, 240000);
});
