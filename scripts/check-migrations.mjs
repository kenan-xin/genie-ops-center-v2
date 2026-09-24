// Migration lint for the pull-request pipeline (R-13, R-74, DEC-43).
//
// One entry point serves the workflow and its test, so the runner and the test
// exercise the same code:
//
//   * Squawk lints every migration file the branch changed, with `--pg-version`
//     set to the deployed Postgres major and the repository's `.squawk.toml`,
//     which keeps the R-13 breaking-change rules and drops the style defaults a
//     generated migration trips. A drop, a rename, a type change or a new
//     required column fails the run unless the statement carries a
//     `-- squawk-ignore <rule>` comment above it.
//   * drizzle-kit check fails when two migrations fork from one history parent.
//     It runs against the folder that holds `meta/`, which is what `--out` names.
//
// Usage:
//   node scripts/check-migrations.mjs --migration <file> --pg-version 18
//   node scripts/check-migrations.mjs --history <drizzle folder>
//   node scripts/check-migrations.mjs            # check every history found
//
// Histories are discovered by walking the workspace for the marker file
// `drizzle/meta/_journal.json`, skipping node_modules and build output, so a new
// module's history is covered without editing this script.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

// The stack is PostgreSQL-only (docs/core/tech-stack.md), so every history
// check names the dialect directly instead of inferring it from the journal.
const DIALECT = "postgresql";

const SQUAWK = join(REPO_ROOT, "node_modules", ".bin", "squawk");

const SQUAWK_CONFIG = join(REPO_ROOT, ".squawk.toml");

const DRIZZLE_KIT = join(REPO_ROOT, "node_modules", ".bin", "drizzle-kit");

// Directories that never hold an authored migration history and are expensive to
// walk. A history marker inside one of them is build output, not a history.
const SKIPPED_DIRS = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

/** The single option value that follows `name` in `args`, or undefined. */
function optionValue(args, name) {
  const index = args.lastIndexOf(name);

  return index === -1 ? undefined : args[index + 1];
}

function repeatedOptionValues(args, name) {
  const values = [];

  for (const [index, arg] of args.entries()) {
    if (arg === name && args[index + 1] !== undefined) {
      values.push(args[index + 1]);
    }
  }

  return values;
}

/** Every `drizzle` folder with a `meta/_journal.json` under `root`. */
function findHistories(root) {
  const found = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;

        const child = join(dir, entry.name);

        if (
          entry.name === "drizzle" &&
          existsSync(join(child, "meta", "_journal.json"))
        ) {
          found.push(child);
        }

        walk(child);
      }
    }
  };

  walk(root);

  return found.toSorted();
}

function run(command, args, cwd) {
  process.stdout.write(`\n$ ${command} ${args.join(" ")}\n`);

  const result = spawnSync(command, args, { cwd, stdio: "inherit" });

  if (result.error !== undefined) {
    process.stderr.write(`${command}: ${result.error.message}\n`);

    return 1;
  }

  return result.status ?? 1;
}

function requireBinary(binary, packageName) {
  if (existsSync(binary)) return;

  throw new Error(
    `${binary} is missing: run \`pnpm install\` so ${packageName} is present`
  );
}

/**
 * Lints one changed migration with Squawk, pinned to the deployed Postgres
 * major. Squawk exits nonzero on a failed rule, including a warning-level one,
 * so its status is the verdict.
 */
function lintMigration(file, pgVersion) {
  if (pgVersion === undefined) {
    throw new Error("--migration requires --pg-version <major>");
  }

  requireBinary(SQUAWK, "squawk-cli");

  // Pass the config explicitly: the rule set is part of the gate, so it must not
  // depend on Squawk's upward search from whatever directory it is invoked in.
  return run(
    SQUAWK,
    ["--config", SQUAWK_CONFIG, "--pg-version", pgVersion, file],
    REPO_ROOT
  );
}

/**
 * Runs `drizzle-kit check` against one history. `--out` must name the folder
 * that holds `meta/`; pointing it anywhere else checks an empty folder and
 * passes silently. The command runs from inside that folder so an absolute path
 * (a test fixture in the system temp dir) is accepted.
 */
function checkHistory(folder) {
  if (!existsSync(join(folder, "meta", "_journal.json"))) {
    throw new Error(`${folder} holds no meta/_journal.json`);
  }

  requireBinary(DRIZZLE_KIT, "drizzle-kit");

  return run(
    DRIZZLE_KIT,
    ["check", "--dialect", DIALECT, "--out", "."],
    folder
  );
}

function main() {
  const args = process.argv.slice(2);

  const pgVersion = optionValue(args, "--pg-version");
  const migrations = repeatedOptionValues(args, "--migration");
  const histories = repeatedOptionValues(args, "--history");

  // A named `--history` is checked alone; otherwise every history in the
  // workspace is checked, because a branch can fork any module's history, not
  // just core's. A changed migration therefore also checks the history it
  // belongs to.
  const historiesToCheck =
    histories.length > 0 ? histories : findHistories(REPO_ROOT);

  let failures = 0;

  for (const file of migrations) {
    failures += lintMigration(file, pgVersion) === 0 ? 0 : 1;
  }

  for (const folder of historiesToCheck) {
    failures += checkHistory(folder) === 0 ? 0 : 1;
  }

  if (failures > 0) {
    process.stderr.write(
      `\nmigration lint failed: ${failures} check${failures === 1 ? "" : "s"}\n`
    );

    process.exitCode = 1;
  } else {
    process.stdout.write("\nmigration lint passed\n");
  }
}

main();
