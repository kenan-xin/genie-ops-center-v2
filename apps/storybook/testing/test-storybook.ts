#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { Readable } from "node:stream";
import { stripVTControlCharacters } from "node:util";

import { isBrowserImportRace, type Run } from "./nested-run.ts";

/**
 * The `@genie/storybook:test-storybook` target's one retry.
 *
 * The target runs this wrapper instead of Vitest directly. The wrapper spawns
 * the same Vitest invocation, streams its output live, and reruns it once only
 * when the first run hit the upstream browser import race
 * (vitest-dev/vitest#11171, see `nested-run.ts`). Any other failure — a failed
 * story, a mixed failure, or a second race — stands and its exit code is the
 * wrapper's.
 *
 * The target is the only retry point. The selection matrix runs this same
 * target in nested runs, so a retry there would let one run execute four times.
 */

/** The Vitest flags the target used to run directly. They are unchanged. */
const VITEST_ARGS = [
  "run",
  "--project=storybook",
  "--passWithNoTests=false",
] as const;

/**
 * One clear line, printed immediately before the second run, naming the upstream
 * race so a reader of CI output can tell a retry from an ordinary run.
 */
export const RETRY_NOTICE =
  "Storybook component tests: the first run hit the Vitest browser import race (vitest-dev/vitest#11171); running once more.";

/** Whether a failed run is worth one more attempt: it failed only on the import race. */
function isRetryable(run: Run): boolean {
  return run.status !== 0 && isBrowserImportRace(run.output);
}

/**
 * Runs once, and once more only after the import race. The second result stands,
 * exit code included. `runOnce` hides the spawn, so this decision is a pure
 * function the unit tests drive with fake runs.
 */
export async function runWithRetry(
  runOnce: () => Promise<Run>,
  onRetry: () => void
): Promise<Run> {
  const first = await runOnce();

  if (!isRetryable(first)) return first;

  onRetry();

  return runOnce();
}

/**
 * Writes each chunk through to `sink` as it arrives and appends it to `buffer`,
 * so the run is visible live and its bytes are kept for the race check.
 */
function tee(
  stream: Readable | null,
  sink: NodeJS.WriteStream,
  buffer: string[]
): void {
  stream?.setEncoding("utf8");
  stream?.on("data", (chunk: string) => {
    buffer.push(chunk);
    sink.write(chunk);
  });
}

/**
 * The real run boundary: spawn Vitest, stream its output, and resolve with its
 * exit code and its buffered output. Terminal control codes are stripped before
 * the buffer is returned, because CI colours the lines the predicate reads.
 */
function runVitest(): Promise<Run> {
  const binary = resolve(import.meta.dirname, "../node_modules/.bin/vitest");

  return new Promise((settle) => {
    const child = spawn(binary, [...VITEST_ARGS], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    const chunks: string[] = [];

    tee(child.stdout, process.stdout, chunks);
    tee(child.stderr, process.stderr, chunks);

    child.on("error", (error) => {
      chunks.push(`\n${String(error)}`);
    });

    child.on("close", (code) => {
      settle({
        status: code ?? -1,
        output: stripVTControlCharacters(chunks.join("")),
      });
    });
  });
}

export async function main(): Promise<number> {
  const result = await runWithRetry(runVitest, () => {
    process.stderr.write(`${RETRY_NOTICE}\n`);
  });

  return result.status;
}

/** Whether this module is the process entrypoint rather than a test import. */
function isEntrypoint(): boolean {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(import.meta.filename)
  );
}

if (isEntrypoint()) {
  // Set the exit code rather than calling `process.exit`, so the streamed output
  // flushes before the process ends.
  process.exitCode = await main();
}
