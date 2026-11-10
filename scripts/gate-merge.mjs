#!/usr/bin/env node
// Runs the stages of the ci:develop script in order, and keeps going after a
// failed stage, so that one local gate reports the failures of every stage.
// It prints a summary of the failed stages and exits with the first failing
// code. ci:pr and ci:develop keep their fail-fast && chain for CI.
//
// The stages come from package.json in the current directory: ci:develop is
// split on &&, and each `pnpm run ci:<name>` segment expands in place. The
// gate drops --nx-bail, so that every integration project reports.
//
// Usage, from the repository root:
//   pnpm gate:merge         run every stage
//   node scripts/gate-merge.mjs --list   print the stages, run nothing
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));

function stages(name) {
  const script = scripts?.[name];

  if (script === undefined) {
    throw new Error(`gate-merge: package.json has no script ${name}`);
  }

  return script.split("&&").flatMap((segment) => {
    const stage = segment.trim();
    const nested = /^pnpm run (ci:\S+)$/.exec(stage);

    return nested ? stages(nested[1]) : [stage.replace(" --nx-bail", "")];
  });
}

const list = stages("ci:develop");

if (process.argv.includes("--list")) {
  console.log(list.join("\n"));
  process.exit(0);
}

const failed = [];

for (const [index, stage] of list.entries()) {
  console.log(`\ngate-merge: stage ${index + 1}/${list.length}: ${stage}`);

  const { status, signal } = spawnSync("sh", ["-c", stage], {
    stdio: "inherit",
  });

  // A killed stage stops the gate, so that a stopped run does not go on. nx
  // catches SIGINT and SIGTERM and exits 130 or 143 instead of by signal.
  if (status === null || status > 128) {
    console.log(
      `gate-merge: stage ${index + 1} ended by ${signal ?? `exit ${status}`}, stopping`
    );
    process.exit(status ?? 1);
  }

  if (status !== 0) failed.push({ index, stage, status });
}

if (failed.length === 0) {
  console.log(`\ngate-merge: all ${list.length} stages passed`);
  process.exit(0);
}

console.log("\ngate-merge: failed stages:");

for (const { index, stage, status } of failed) {
  console.log(`  ${index + 1}. exit ${status}: ${stage}`);
}

process.exit(failed[0].status);
