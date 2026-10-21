#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";

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
 *
 * Every step prints its header before it starts and streams its child's stdout
 * and stderr live, so a hang shows exactly where it is stuck instead of going
 * silent until the process ends. Each step also has its own timeout; a step that
 * outruns it is killed by process group and fails by name, rather than the whole
 * run sitting quiet until CI's job limit cuts it off.
 */
const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** The two tracked files that carry the generated module while the run lasts. */
const SHARED_FILES = ["pnpm-lock.yaml", "apps/genie/package.json"];

const MINUTE = 60_000;

/** Per-step timeouts. Storybook runs and the image build are slow by nature;
 * Playwright gets a middle ground; everything else is fast and gets the floor. */
const STEP_TIMEOUT_MS = new Map<string, number>([
  ["Storybook component tests without the generated module", 15 * MINUTE],
  ["Storybook component tests with the generated module", 15 * MINUTE],
  ["build an image carrying the generated module", 15 * MINUTE],
  ["denied route at a phone and a desktop viewport", 10 * MINUTE],
]);

const DEFAULT_STEP_TIMEOUT_MS = 5 * MINUTE;

function timeoutFor(label: string): number {
  return STEP_TIMEOUT_MS.get(label) ?? DEFAULT_STEP_TIMEOUT_MS;
}

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

/** The step currently in flight, so a thrown error - however it is shaped - can
 * be reported against the step that produced it. */
let currentStep = "";

/**
 * Runs one command with its stdout/stderr streamed live to this process's own
 * streams, while still capturing the stdout text for callers that need to parse
 * it (`storiesRunFor`). `spawnSync`/`execFileSync` buffer the whole run and hand
 * back nothing until the process exits, which is why a hang goes silent; a piped
 * `spawn` forwards chunks as they arrive.
 *
 * The child runs detached so it leads its own process group: a timeout kills
 * `-pid`, the whole group, not just the top process, which matters for a step
 * like `pnpm exec nx ...` that forks further children.
 */
function runStreamed(
  command: string,
  args: readonly string[],
  label: string,
  env?: Record<string, string>
): Promise<string> {
  currentStep = label;

  process.stdout.write(`\n=== ${label} ===\n`);

  const timeoutMs = timeoutFor(label);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      detached: true,
    });

    let out = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;

      if (child.pid) process.kill(-child.pid, "SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(
          new Error(
            `did not finish within ${timeoutMs / MINUTE} minutes and was killed`
          )
        );

        return;
      }

      if (code !== 0) {
        reject(new Error(`exited with code ${code}`));

        return;
      }

      resolvePromise(out);
    });
  });
}

async function run(
  command: string,
  args: readonly string[],
  label: string,
  env?: Record<string, string>
): Promise<void> {
  await runStreamed(command, args, label, env);
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
async function storiesRunFor(
  moduleInclude: string,
  label: string
): Promise<number> {
  const output = await runStreamed(
    "pnpm",
    ["exec", "nx", "run", "@genie/storybook:test-storybook", "--skip-nx-cache"],
    label,
    { MODULE_INCLUDE: moduleInclude }
  );

  // Under CI=true the output carries color codes between the words.
  const passed = /Tests\s+(\d+) passed/.exec(
    stripVTControlCharacters(output)
  )?.[1];

  if (passed === undefined) {
    throw new Error(
      "the Storybook run reported no test count, so the story proof cannot be read"
    );
  }

  return Number(passed);
}

let failure: unknown;

try {
  await run(
    "pnpm",
    ["exec", "nx", "g", "@genie/generators:module-new", id],
    "generate"
  );

  // Linking is the rest of its registration: the generator named the package in
  // the application's manifest, and nothing else in the workspace names it.
  // The lockfile moves here and is restored on exit, so the install must not
  // be frozen, which pnpm otherwise defaults to under CI=true.
  await run(
    "pnpm",
    ["install", "--silent", "--no-frozen-lockfile"],
    "link the generated package"
  );

  await run(
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

  await run(
    "node",
    ["tools/generators/scripts/assert-discovered.ts", id],
    "selection and story discovery"
  );

  if (withIntegration) {
    await run(
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
    const withoutModule = await storiesRunFor(
      "",
      "Storybook component tests without the generated module"
    );

    const withModule = await storiesRunFor(
      id,
      "Storybook component tests with the generated module"
    );

    if (withModule <= withoutModule) {
      throw new Error(
        `selecting ${id} ran ${withModule} stories and an empty selection ran ${withoutModule}, so none of the generated module's stories executed`
      );
    }

    process.stdout.write(
      `\nThe generated module contributed ${withModule - withoutModule} stories, which passed.\n`
    );

    await run(
      "pnpm",
      ["exec", "nx", "run", "@genie/app:build-image"],
      "build an image carrying the generated module",
      { MODULE_INCLUDE: `placeholder,${id}` }
    );

    await run(
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
  const message = failure instanceof Error ? failure.message : String(failure);

  console.error(
    `\nThe generated module did not pass. Step "${currentStep}": ${message}`
  );
  process.exit(1);
}

process.stdout.write(
  `\nThe generated module ${packageName} passed every gate this run exercised.\n`
);
