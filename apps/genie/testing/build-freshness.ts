import { readFileSync, statSync } from "node:fs";

import {
  SOURCE_HASH_FILE,
  buildSourceHash,
  buildSourceRoots,
} from "./build-source-hash.ts";

const REBUILD = "MODULE_INCLUDE=placeholder pnpm exec nx run @genie/app:build";

/**
 * Fails when `artifact` was not built from the source the tree holds now.
 *
 * A stale build would let an assertion pass for the wrong reason: the output
 * would carry the previous revision's bytes, and a test that reads them would
 * certify the build that is not there. The documented gate runs vitest
 * directly, so the precondition is checked here rather than assumed.
 *
 * The verdict is content. `tools/build.ts` hashes the build sources before
 * `next build` and stores the hash inside `.next`; this check hashes the tree
 * again and compares. File time is no signal: Nx restores `.next` by content,
 * with fresh times, and a touched or restored source changes its time but not
 * the build (P15-27).
 */
export function assertBuildIsCurrent(
  artifact: string,
  sources: {
    readonly hashFile: string;
    readonly roots: readonly string[];
  } = { hashFile: SOURCE_HASH_FILE, roots: buildSourceRoots() }
): void {
  try {
    statSync(artifact);
  } catch {
    throw new Error(
      `The build output is missing: ${artifact} does not exist. Build it:\n  ${REBUILD}`
    );
  }

  let stored: string;

  try {
    stored = readFileSync(sources.hashFile, "utf8").trim();
  } catch {
    throw new Error(
      `The build holds no source hash at ${sources.hashFile}: it predates xok3.64 or did not run through the build target, so nothing says which source it reflects. Rebuild it:\n  ${REBUILD}`
    );
  }

  if (stored !== buildSourceHash(sources.roots)) {
    throw new Error(
      `The build output at ${artifact} comes from other source than the tree holds now, so this test would read stale output. Rebuild it:\n  ${REBUILD}`
    );
  }
}
