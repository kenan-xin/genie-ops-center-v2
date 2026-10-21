import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../.next/standalone");

/**
 * Collects every candidate rather than returning the first.
 *
 * The image entrypoint refuses an ambiguous tree, and this launcher backs the
 * host integration tests and the browser run, so it must refuse one too.
 * Returning the first match would silently start an arbitrary server whose
 * assets live somewhere else.
 */
function findAll(directory, found, depth = 0) {
  // The directory is absent before the first build. Guarding here keeps the
  // controlled error below reachable instead of throwing ENOENT with a stack.
  if (depth > 4 || !existsSync(directory)) return;

  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules") continue;

    const candidate = join(directory, entry);

    if (entry === "server.js") {
      found.push(candidate);
      continue;
    }

    if (statSync(candidate).isDirectory()) findAll(candidate, found, depth + 1);
  }
}

const matches = [];

findAll(root, matches);

if (matches.length > 1) {
  console.error(
    `Expected exactly one standalone server.js, found ${matches.length}:`
  );

  for (const match of matches) console.error(`  ${match}`);

  process.exit(70);
}

const entry = matches[0];

if (entry === undefined) {
  console.error(`No standalone server.js under ${root}. Run the build first.`);
  process.exit(70);
}

const child = spawn("node", [entry], { stdio: "inherit" });

// Forward the signals a container sends, so the server shuts down rather than
// being orphaned behind this launcher.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`Could not start ${entry}: ${error.message}`);
  process.exit(70);
});

const SIGNAL_NUMBERS = { SIGINT: 2, SIGTERM: 15 };

child.on("exit", (code, signal) => {
  // The conventional encoding is 128 plus the signal number, so a supervisor can
  // tell a terminated server from one that chose to exit.
  process.exit(
    signal === null ? (code ?? 70) : 128 + (SIGNAL_NUMBERS[signal] ?? 0)
  );
});
