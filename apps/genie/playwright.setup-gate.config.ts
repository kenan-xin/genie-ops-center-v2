import { defineConfig, devices } from "@playwright/test";

import { HOST_PORT } from "./e2e/setup-gate/stack.ts";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "setup-gate.spec.ts",
  testIgnore: ["**/*__boundary__*", "**/*__wiring__*", "**/*__antislop__*"],
  outputDir: "test-results/setup-gate",
  forbidOnly: true,
  reporter: [["list"]],
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${HOST_PORT}`,
  },
  globalSetup: "./e2e/setup-gate/global-setup.ts",
  globalTeardown: "./e2e/setup-gate/global-teardown.ts",
});
