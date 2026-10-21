import { defineConfig, devices } from "@playwright/test";

import { scopedPort } from "./testing/worktree-scope.ts";

const PORT = Number(process.env.GENIE_DEV_PORT ?? scopedPort(5400));

/**
 * The development browser run.
 *
 * Separate from `playwright.config.ts` because it drives a different server.
 * That one runs the built image, where the devtools are excluded on purpose, so
 * the development panels cannot be seen there at all. This configuration starts
 * `next dev` against a disposable database and is the only place the
 * development branch of the mount is exercised in a browser.
 *
 * `webServer` is not used, for the same reason the ordinary configuration gives:
 * Playwright resolves its environment before global setup runs, so a database
 * URL discovered there could never reach it.
 */
export default defineConfig({
  testDir: "./e2e/dev",
  // A sibling of the fixture run's `test-results/fixture`, not `test-results`
  // itself: Playwright empties its `outputDir` recursively at the start of a
  // run, and the mandatory gate runs this beside the fixture browser run, so a
  // directory that contains the other's artifacts would be deleted mid-run.
  outputDir: "test-results/dev",
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  globalSetup: "./e2e/dev/global-setup.ts",
  globalTeardown: "./e2e/dev/global-teardown.ts",
});
