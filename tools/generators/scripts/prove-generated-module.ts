#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Proves a generated module with no hand edit (AC-7).
 *
 * The module is generated into this workspace, registered the way any module is
 * registered — the `packages/modules/*` glob and Nx's inference, with no edit to a
 * shared file — put through the gates, and removed again. The workspace is
 * restored on every exit path, including a failing gate, so the repository is the
 * same afterwards as before.
 *
 * It is disposable on purpose: the host module list, the default selection and CI
 * never gain a module, and the proof can be rerun at any time.
 *
 *   node tools/generators/scripts/prove-generated-module.ts [id] [--keep]
 *                                        [--no-integration] [--no-browser]
 *
 * The layers, in order: generate, link, lint, typecheck, unit tests, selection
 * and story discovery, the real database, the Storybook component tests, and the
 * app's denied route in a browser at a phone and a desktop viewport.
 *
 * `--keep` leaves the generated module in place for inspection. `--no-integration`
 * and `--no-browser` skip the layers that need a container runtime; the run then
 * says so rather than reporting a pass it did not get.
 */
const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const [, , maybeId, ...flags] = process.argv;

const id = maybeId?.startsWith("--")
  ? "generated-proof"
  : (maybeId ?? "generated-proof");

const keep = flags.includes("--keep") || maybeId === "--keep";

const withIntegration =
  !flags.includes("--no-integration") && maybeId !== "--no-integration";

const withBrowser =
  !flags.includes("--no-browser") && maybeId !== "--no-browser";

const moduleRoot = join(REPO_ROOT, "packages/modules", id);

const packageName = `@genie/module-${id}`;

if (existsSync(moduleRoot)) {
  console.error(
    `${moduleRoot} already exists. This script only ever removes a module it created itself, so remove that one first.`
  );
  process.exit(1);
}

function run(command, args, label, env) {
  process.stdout.write(`\n=== ${label} ===\n`);
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function restore() {
  if (!keep) {
    rmSync(moduleRoot, { recursive: true, force: true });
  }

  // Two shared files carry the generated module while the run lasts: the
  // application manifest, which the generator adds the dependency to, and the
  // lockfile the install rewrote. Both go back exactly as they were.
  execFileSync(
    "git",
    ["checkout", "--", "pnpm-lock.yaml", "apps/genie/package.json"],
    { cwd: REPO_ROOT, stdio: "inherit" }
  );

  execFileSync("pnpm", ["install", "--silent"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

let failure;

try {
  run("pnpm", ["exec", "nx", "g", "@genie/generators:module", id], "generate");

  // Linking the new package is the whole of its registration: no manifest, no Nx
  // configuration and no app file names it.
  run("pnpm", ["install", "--silent"], "link the generated package");

  run(
    "pnpm",
    [
      "exec",
      "nx",
      "run-many",
      "-t",
      "lint",
      "typecheck",
      "test",
      `--projects=${packageName}`,
      "--skip-nx-cache",
    ],
    "lint, typecheck and unit tests on the generated module"
  );

  // Discovery through the data-only resolver: the selection the app and the
  // Storybook host both read must now name the generated module.
  run(
    "node",
    ["tools/generators/scripts/assert-discovered.ts", id],
    "selection and story discovery"
  );

  if (withIntegration) {
    run(
      "pnpm",
      [
        "exec",
        "nx",
        "run",
        `${packageName}:test:integration`,
        "--skip-nx-cache",
      ],
      "real database: schema, migration and router denial"
    );
  } else {
    process.stdout.write(
      "\n=== real database layer SKIPPED by --no-integration: this run proves nothing about it ===\n"
    );
  }

  if (withBrowser) {
    // Story discovery and the component tests, scoped to this module alone, so a
    // pass is this module's stories and not another package's.
    run(
      "pnpm",
      [
        "exec",
        "nx",
        "run",
        "@genie/storybook:test-storybook",
        "--skip-nx-cache",
      ],
      "Storybook component tests for the generated module",
      { MODULE_INCLUDE: id }
    );

    // The app-owned denied route, in a real browser, at a phone and a desktop
    // viewport. The image carries the placeholder too, so the run also proves the
    // generated module did not displace what was already there.
    run(
      "pnpm",
      ["exec", "nx", "run", "@genie/app:build-image"],
      "build an image carrying the generated module",
      { MODULE_INCLUDE: `placeholder,${id}` }
    );

    run(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "apps/genie/playwright.config.ts",
        "generated-module",
      ],
      "denied route at a phone and a desktop viewport",
      { GENIE_MODULE_UNDER_TEST: id }
    );
  } else {
    process.stdout.write(
      "\n=== browser layers SKIPPED by --no-browser: this run proves nothing about them ===\n"
    );
  }
} catch (error) {
  failure = error;
} finally {
  restore();
}

if (failure !== undefined) {
  console.error(`\nThe generated module did not pass. ${failure.message}`);
  process.exit(1);
}

process.stdout.write(
  `\nThe generated module ${packageName} passed every gate this run exercised, and the workspace is restored.\n`
);
