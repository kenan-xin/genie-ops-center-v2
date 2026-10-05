import { defineConfig, devices } from "@playwright/test";

import { scopedPort } from "./testing/worktree-scope.ts";

// The port global setup publishes; the same precedence it uses, so a run that
// overrides either variable still probes and drives the same port.
const PORT = Number(
  process.env.GENIE_HOST_PORT ?? process.env.E2E_PORT ?? scopedPort(3400)
);

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * The one Keycloak address rule (Spec 2 R-54c/d): the app and the browser use
 * `host.docker.internal`, which the app container resolves through `extra_hosts`. The browser
 * does not resolve that name by default, so every project maps it to loopback here.
 */
const RESOLVER_ARGS = [
  "--host-resolver-rules=MAP host.docker.internal 127.0.0.1",
];

export default defineConfig({
  testDir: "./e2e",
  // The failed/invalid-provider browser proof needs the fixture image
  // (`genie-s005:fixture`, built by `build-fixture-image`) and runs through
  // `playwright.fixture.config.ts`. Collecting it here would run it against an
  // image whose fixture routes do not exist, so the ordinary run never picks it
  // up, and the fixture gate is what runs it.
  //
  // The lint suites write test-shaped transient fixtures under `e2e/` and delete
  // them again. They carry the same markers the shared Vitest preset excludes,
  // anywhere inside a basename, so a run beside those suites never imports one
  // (genie-ops-center-v2-hlu).
  testIgnore: [
    "**/e2e/fixture/**",
    "**/e2e/dev/**",
    "**/e2e/setup-gate/**",
    // The scheduled Entra run has its own stack and config (`playwright.entra.config.ts`).
    "**/e2e/entra/**",
    "**/setup-gate.spec.ts",
    "**/*__boundary__*",
    "**/*__wiring__*",
    "**/*__antislop__*",
    "**/*__shadcn__*",
  ],
  // Its own artifact directory beside `test-results/fixture` and
  // `test-results/dev`: the default `test-results` is their parent, and
  // Playwright empties its `outputDir` at run start.
  outputDir: "test-results/e2e",
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: BASE_URL },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        launchOptions: { args: RESOLVER_ARGS },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: RESOLVER_ARGS },
      },
    },
  ],
  // The database and the application are both started in globalSetup.
  //
  // `webServer` is deliberately not used. Playwright builds its web-server
  // plugin before it runs global setup, so `env` is resolved from the config
  // object at that earlier moment. A DATABASE_URL that global setup discovers
  // afterwards can never reach it, and the server would start with an empty
  // value and fail validation before any test ran.
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
});
