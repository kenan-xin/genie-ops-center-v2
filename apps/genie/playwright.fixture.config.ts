import { defineConfig, devices } from "@playwright/test";

import { scopedPort } from "./testing/worktree-scope.ts";

const PORT = Number(
  process.env.GENIE_HOST_PORT ?? process.env.E2E_PORT ?? scopedPort(7400)
);

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e/fixture",
  // Its own artifact directory beside the dev run's `test-results/dev`.
  // Playwright empties its `outputDir` recursively at run start, and the
  // mandatory gate runs the two browser suites in parallel, so sharing the
  // default `test-results` would delete the other's artifacts mid-run.
  outputDir: "test-results/fixture",
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: BASE_URL },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  // The fixture stack's own composition hooks: they default the image to the
  // per-worktree `genie-s005:fixture-<worktree>` tag and the host port to this
  // worktree's scoped port, and bring the stack up under a project name scoped
  // the same way, so running the gate needs no operator environment and two
  // worktrees never share a container name or port. The ordinary run's
  // `genie-s005-e2e` project is scoped the same way and stays untouched.
  globalSetup: "./e2e/fixture/global-setup.ts",
  globalTeardown: "./e2e/fixture/global-teardown.ts",
});
