import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { BASE_PORTS } from "./testing/e2e-ports.ts";
import { scopedPort, scopedProject } from "./testing/worktree-scope.ts";

const PORT = Number(
  process.env.GENIE_DEV_PORT ?? scopedPort(BASE_PORTS.devApp)
);

/**
 * The development browser run.
 *
 * Separate from `playwright.config.ts` because it drives a different server.
 * That one runs the built image, where the devtools are excluded on purpose, so
 * the development panels cannot be seen there at all. This configuration starts
 * `next dev` against a disposable database and is the only place the
 * development branch of the mount is exercised in a browser. It also holds
 * the pages of the modules that the main run's image does not compile.
 *
 * `webServer` is not used, for the same reason the ordinary configuration gives:
 * Playwright resolves its environment before global setup runs, so a database
 * URL discovered there could never reach it.
 */
export default defineConfig({
  testDir: "./e2e/dev",
  // Outside the repository, as a sibling of nothing: Turbopack infers the
  // monorepo as its root and watches it, so an artifact written inside it (a
  // screenshot, an error context) makes `next dev` recompile and reload the
  // page. That reload destroyed axe's frame and repeated the pre-hydration click
  // race under `--repeat-each`. The path is scoped to the worktree, so two runs
  // never empty each other's output.
  outputDir: join(tmpdir(), scopedProject("genie-e2e-dev-results")),
  // The four invoice specs hold one ledger lock, so a higher worker count only adds page loads
  // while one test runs. Eight workers crashed pages in a cold `next dev` rebuild; four keep both
  // projects and their files moving without that load.
  workers: 4,
  forbidOnly: true,
  // One retry inside gate:merge only (scripts/gate-merge.mjs); CI keeps zero.
  retries: Number(process.env.E2E_RETRIES ?? 0),
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    // DEC-25: a test tagged `@no-screen` renders no screen and runs at the desktop viewport only.
    { name: "phone", grepInvert: /@no-screen/, use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  globalSetup: "./e2e/dev/global-setup.ts",
  globalTeardown: "./e2e/dev/global-teardown.ts",
});
