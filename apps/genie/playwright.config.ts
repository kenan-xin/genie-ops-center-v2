import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? "3400");

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: BASE_URL },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
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
