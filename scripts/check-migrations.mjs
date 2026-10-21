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
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
 * The statements Postgres refuses inside a transaction block, and therefore the
 * ones the migrator's single transaction cannot run (R-27). Squawk's
 * `require-concurrent-index-creation` rule suggests `CONCURRENTLY` for a
 * live-table index and its `require-concurrent-partition-detach` rule suggests
 * it for a partition detach, but this migrator cannot run any of them:
 * `REFRESH MATERIALIZED VIEW CONCURRENTLY` is absent because Postgres does run
 * it inside a transaction, so refusing it would reject a legal migration (1ia.1
 * review L7). Match the statement, not the word.
 */
const TRANSACTION_FORBIDDEN_CONCURRENTLY = [
  /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i,
  /\bDROP\s+INDEX\s+CONCURRENTLY\b/i,
  /\bREINDEX\s+(?:\([^)]*\)\s+)?(?:INDEX|TABLE|SCHEMA|DATABASE|SYSTEM)\s+CONCURRENTLY\b/i,
  /\bALTER\s+TABLE\b[^;]*\bDETACH\s+PARTITION\b[^;]*\bCONCURRENTLY\b/i,
];

/** The `$tag$` delimiter that opens a dollar-quoted string at `index`, or null. */
function dollarQuoteDelimiter(sql, index) {
  if (sql[index] !== "$") return null;

  let end = index + 1;

  while (/[A-Za-z0-9_]/.test(sql[end] ?? "")) end += 1;

  if (sql[end] !== "$") return null;

  // A dollar tag cannot start with a digit, so `$1` is a parameter, not a quote.
  if (/[0-9]/.test(sql[index + 1] ?? "")) return null;

  return sql.slice(index, end + 1);
}

/**
 * The SQL with line and block comments removed and the contents of string
 * literals and quoted identifiers blanked, so a statement match cannot fire on
 * the word appearing in a comment, a literal or a quoted name. A comment becomes
 * a space because Postgres treats it as whitespace between tokens; a literal or
 * quoted name keeps an empty pair of its own quotes so a following token is not
 * glued to the one before it.
 */
function sqlWithoutCommentsOrLiterals(sql) {
  let code = "";
  let index = 0;

  while (index < sql.length) {
    if (sql.startsWith("--", index)) {
      const newline = sql.indexOf("\n", index);

      index = newline === -1 ? sql.length : newline;
      code += " ";
      continue;
    }

    if (sql.startsWith("/*", index)) {
      let depth = 1;

      index += 2;

      while (index < sql.length && depth > 0) {
        if (sql.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (sql.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }

      code += " ";
      continue;
    }

    const character = sql[index];

    if (character === "'" || character === '"') {
      const quote = character;

      index += 1;

      while (index < sql.length) {
        if (sql[index] === quote && sql[index + 1] === quote) {
          index += 2;
          continue;
        }

        if (sql[index] === quote) {
          index += 1;
          break;
        }

        index += 1;
      }

      code += quote + quote;
      continue;
    }

    if (character === "$") {
      const delimiter = dollarQuoteDelimiter(sql, index);

      if (delimiter !== null) {
        const close = sql.indexOf(delimiter, index + delimiter.length);

        index = close === -1 ? sql.length : close + delimiter.length;
        code += "''";
        continue;
      }
    }

    code += character;
    index += 1;
  }

  return code;
}

function refuseConcurrently(file) {
  // A missing file is Squawk's to report; reading it here would throw first.
  if (!existsSync(file)) return 0;

  const code = sqlWithoutCommentsOrLiterals(readFileSync(file, "utf8"));

  if (!TRANSACTION_FORBIDDEN_CONCURRENTLY.some((form) => form.test(code))) {
    return 0;
  }

  process.stderr.write(
    `${file}: contains a CONCURRENTLY form Postgres refuses inside a transaction:\n` +
      `CREATE INDEX, DROP INDEX, REINDEX or ALTER TABLE ... DETACH PARTITION.\n` +
      `Drizzle applies every history inside one transaction, and Postgres refuses\n` +
      `each of those inside a transaction block, so the migration would fail at\n` +
      `container start (R-27). Use a plain statement with the matching\n` +
      "`-- squawk-ignore <rule>` comment and a justification instead.\n"
  );

  return 1;
}

/**
 * Lints one changed migration with Squawk, pinned to the deployed Postgres
 * major. Squawk exits nonzero on a failed rule, including a warning-level one,
 * so its status is the verdict. A migration carrying a CONCURRENTLY form is
 * refused before Squawk, because Squawk would accept it and the migrator
 * cannot run it.
 */
function lintMigration(file, pgVersion) {
  if (pgVersion === undefined) {
    throw new Error("--migration requires --pg-version <major>");
  }

  const concurrentlyRefused = refuseConcurrently(file);

  requireBinary(SQUAWK, "squawk-cli");

  // Pass the config explicitly: the rule set is part of the gate, so it must not
  // depend on Squawk's upward search from whatever directory it is invoked in.
  const squawkStatus = run(
    SQUAWK,
    ["--config", SQUAWK_CONFIG, "--pg-version", pgVersion, file],
    REPO_ROOT
  );

  return concurrentlyRefused === 0 && squawkStatus === 0 ? 0 : 1;
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
