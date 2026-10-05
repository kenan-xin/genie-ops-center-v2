import { defineConfig, devices } from "@playwright/test";

import { APP_URL } from "./e2e/entra/stack.ts";

/**
 * The scheduled Entra run (tech plan D2-2): a small suite against the real test tenant through a
 * realm brokered to it. It runs from `.github/workflows/entra-scheduled.yml` only, never as a pull
 * request check, and it skips when the `ENTRA_TEST_TENANT` secret is absent. One desktop project:
 * the subject is the provider's behavior, which the viewport does not change; the phone and
 * desktop proofs of the same screens run in the ordinary suite.
 */
export default defineConfig({
  testDir: "./e2e/entra",
  outputDir: "test-results/entra",
  forbidOnly: true,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
  use: { baseURL: APP_URL },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./e2e/entra/global-setup.ts",
  globalTeardown: "./e2e/entra/global-teardown.ts",
});
