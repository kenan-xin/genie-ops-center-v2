import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { moduleHistory } from "@genie/core";

import { selectedModules } from "../src/modules.ts";
import { startWorker } from "../testing/dev-worker.ts";

/**
 * `nx run @genie/app:dev`: the module job worker in this process, then `next dev` beside it, so
 * a job such as reading an uploaded document runs locally (xok3.37). The worker runs the
 * migrations first, as the image's worker does. Ctrl+C stops both.
 */
const APP_ROOT = resolve(import.meta.dirname, "..");

const ENV_FILE = resolve(APP_ROOT, ".env.development.local");

/** Above the migrator's 120 s lock wait, so only a worker that hangs fails the start. */
const WORKER_START_MS = 180000;

// `next dev` reads the file itself; the worker in this process needs it too.
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const worker = await startWorker({
  source: process.env,
  modules: selectedModules,
  histories: selectedModules.map(moduleHistory),
  timeoutMs: WORKER_START_MS,
  onLine: (line) => process.stdout.write(`[worker] ${line}\n`),
}).catch((error: Error) => {
  // The worker already printed its lines, so the first line of the error is enough.
  console.error(error.message.split("\n")[0]);
  process.exit(1);
});

const next = spawn(
  resolve(APP_ROOT, "node_modules/.bin/next"),
  ["dev", "--port", "3000"],
  { cwd: APP_ROOT, stdio: "inherit" }
);

// Ctrl+C reaches `next dev` through the terminal too; a signal sent to this process alone is passed on.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => next.kill(signal));
}

next.once("exit", async (code) => {
  await worker.stop();
  process.exit(code ?? 0);
});
