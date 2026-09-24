import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const APP_ROOT = resolve(import.meta.dirname, "..");

const WORKSPACE_ROOT = resolve(APP_ROOT, "../..");

/**
 * Files under the watched roots that are build outputs rather than hand-written
 * source. `generate-registry` declares `src/modules.ts` as its output, so Nx
 * restores it on a cache hit and writes it with a fresh modification time — its
 * timestamp then says nothing about whether `.next` is current. Measured: without
 * this exclusion the check fired on a correct tree under root `pnpm test`, where
 * `build` was a cache hit and `generate-registry` was restored.
 */
const GENERATED_SOURCES = new Set([join(APP_ROOT, "src", "modules.ts")]);

/** Every source tree whose change can alter the application build. */
function sourceRoots(): readonly string[] {
  const modulesRoot = join(WORKSPACE_ROOT, "packages/modules");

  const moduleSources = readdirSync(modulesRoot, {
    withFileTypes: true,
  }).flatMap((entry) =>
    entry.isDirectory() ? [join(modulesRoot, entry.name, "src")] : []
  );

  return [
    join(APP_ROOT, "src"),
    join(APP_ROOT, "tools"),
    join(WORKSPACE_ROOT, "packages/core/src"),
    join(WORKSPACE_ROOT, "packages/ui/src"),
    ...moduleSources,
  ];
}

/** The newest modification time under a directory, in milliseconds. */
function newestMtimeMs(root: string): number {
  let newest = 0;

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name);

      if (entry.isDirectory()) {
        walk(child);
      } else if (!GENERATED_SOURCES.has(child)) {
        newest = Math.max(newest, statSync(child).mtimeMs);
      }
    }
  };

  walk(root);

  return newest;
}

/**
 * Fails when `artifact` predates the source it is built from.
 *
 * A stale build would let an assertion pass for the wrong reason: the output
 * would carry the previous revision's bytes, and a test that reads them would
 * certify the build that is not there. The documented gate runs vitest
 * directly, and an Nx cache hit restores nothing without a declared output, so
 * the precondition is checked here rather than assumed.
 *
 * The verdict is modification time, and it is the right signal in this
 * direction: the build reads every source before it emits its output, so a
 * source newer than the artifact means the artifact does not reflect it. (This
 * is the opposite of the image guard's situation, where the image builds its own
 * `.next` and local timestamps are meaningless — see `image.startup.test.ts`.)
 */
export function assertBuildIsCurrent(artifact: string): void {
  let builtAt: number;

  try {
    builtAt = statSync(artifact).mtimeMs;
  } catch {
    throw new Error(
      `The build output is missing: ${artifact} does not exist. Build it:\n  MODULE_INCLUDE=placeholder pnpm exec nx run @genie/app:build`
    );
  }

  const newestSource = Math.max(...sourceRoots().map(newestMtimeMs));

  if (newestSource > builtAt) {
    throw new Error(
      `The build output at ${artifact} is older than the source it is built from, so this test would read stale output. Rebuild it:\n  MODULE_INCLUDE=placeholder pnpm exec nx run @genie/app:build`
    );
  }
}
