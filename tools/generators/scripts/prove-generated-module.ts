#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Proves a generated module with no hand edit (AC-7).
 *
 * The module is generated into this workspace, registered the way any module is
 * registered, put through the gates, and removed again. The workspace is restored
 * on every exit path, including a failing gate and an interrupt, so the repository
 * is the same afterwards as before.
 *
 * It is disposable on purpose: the host module list, the default selection and
 * continuous integration never gain a module, and the proof can be rerun at any
 * time.
 *
 *   node tools/generators/scripts/prove-generated-module.ts [id] [--keep]
 *                                        [--no-integration] [--no-browser]
 *
 * The layers, in order: generate, link, lint, typecheck, unit tests, selection and
 * story discovery, the real database, the Storybook component tests, and the
 * application's denied route in a browser at a phone and a desktop viewport.
 *
 * `--keep` leaves the generated module in place, linked, for inspection; the run
 * then says which files it did not put back. `--no-integration` and `--no-browser`
 * skip the layers that need a container runtime; the run says so rather than
 * reporting a pass it did not get.
 */
const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** The two tracked files that carry the generated module while the run lasts. */
const SHARED_FILES = ["pnpm-lock.yaml", "apps/genie/package.json"];

const [, , maybeId, ...flags] = process.argv;

const all = maybeId === undefined ? flags : [maybeId, ...flags];

const id = maybeId?.startsWith("--")
  ? "generated-proof"
  : (maybeId ?? "generated-proof");

const keep = all.includes("--keep");

const withIntegration = !all.includes("--no-integration");

const withBrowser = !all.includes("--no-browser");

const moduleRoot = join(REPO_ROOT, "packages/modules", id);

const packageName = `@genie/module-${id}`;

if (existsSync(moduleRoot)) {
  console.error(
    `${moduleRoot} already exists. This script only ever removes a module it created itself, so remove that one first.`
  );
  process.exit(1);
}

/**
 * The bytes of every shared file, read before anything is generated.
 *
 * Restoring from these rather than from `git checkout` matters: a checkout would
 * throw away whatever uncommitted work the operator already had in the lockfile or
 * the application manifest, with no reflog and no stash to recover it from. What
 * this run changes, this run puts back, and nothing else is touched.
 */
const shared = new Map(
  SHARED_FILES.map((path) => [
    path,
    readFileSync(join(REPO_ROOT, path), "utf8"),
  ])
);

function call(
  command: string,
  args: readonly string[],
  env?: Record<string, string>
): string {
  return execFileSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
}

function run(
  command: string,
  args: readonly string[],
  label: string,
  env?: Record<string, string>
): void {
  process.stdout.write(`\n=== ${label} ===\n`);
  process.stdout.write(call(command, args, env));
}

let restored = false;

function restore(): void {
  if (restored) return;

  restored = true;

  if (keep) {
    process.stdout.write(
      `\n=== --keep: ${moduleRoot} and its entries in ${SHARED_FILES.join(" and ")} are left in place ===\n`
    );

    return;
  }

  rmSync(moduleRoot, { recursive: true, force: true });

  for (const [path, content] of shared) {
    writeFileSync(join(REPO_ROOT, path), content);
  }

  // The lockfile on disk is the one from before the run, so the link tree has to
  // be brought back to it.
  execFileSync("pnpm", ["install", "--silent"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

// A gate can take minutes, and an operator who interrupts one must not be left
// with a half-generated workspace whose next build compiles a stale module.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    process.stdout.write(`\n=== ${signal}: restoring the workspace ===\n`);
    restore();
    process.exit(130);
  });
}

/**
 * Runs the component tests for one selection and answers how many stories ran.
 *
 * The count is the measurement, because the Storybook host always contributes the
 * user-interface and core stories: a run scoped to this module alone would pass on
 * those even if the generated module contributed no story at all. The difference
 * between the two selections is what proves the generated stories executed.
 */
function storiesRunFor(moduleInclude: string): number {
  const output = call(
    "pnpm",
    ["exec", "nx", "run", "@genie/storybook:test-storybook", "--skip-nx-cache"],
    { MODULE_INCLUDE: moduleInclude }
  );

  process.stdout.write(output);

  const passed = /Tests\s+(\d+) passed/.exec(output)?.[1];

  if (passed === undefined) {
    throw new Error(
      "the Storybook run reported no test count, so the story proof cannot be read"
    );
  }

  return Number(passed);
}

let failure: unknown;

try {
  run("pnpm", ["exec", "nx", "g", "@genie/generators:module", id], "generate");

  // Linking is the rest of its registration: the generator named the package in
  // the application's manifest, and nothing else in the workspace names it.
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
    process.stdout.write(
      "\n=== Storybook component tests: this module's stories against a selection without it ===\n"
    );

    const withoutModule = storiesRunFor("");
    const withModule = storiesRunFor(id);

    if (withModule <= withoutModule) {
      throw new Error(
        `selecting ${id} ran ${withModule} stories and an empty selection ran ${withoutModule}, so none of the generated module's stories executed`
      );
    }

    process.stdout.write(
      `\nThe generated module contributed ${withModule - withoutModule} stories, which passed.\n`
    );

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
  try {
    restore();
  } catch (problem) {
    // A restore that fails must not replace the real result, and it must not pass
    // unnoticed either: the operator is told exactly what is left behind.
    console.error(
      `\nThe workspace was not fully restored: ${problem instanceof Error ? problem.message : String(problem)}\nCheck ${moduleRoot} and ${SHARED_FILES.join(", ")}.`
    );
  }
}

if (failure !== undefined) {
  console.error(
    `\nThe generated module did not pass. ${failure instanceof Error ? failure.message : String(failure)}`
  );
  process.exit(1);
}

process.stdout.write(
  `\nThe generated module ${packageName} passed every gate this run exercised.\n`
);
