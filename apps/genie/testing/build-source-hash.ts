import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const APP_ROOT = resolve(import.meta.dirname, "..");

const WORKSPACE_ROOT = resolve(APP_ROOT, "../..");

/**
 * Where `tools/build.ts` records the hash of the source a build was made from.
 * It sits inside the `build` target's output `{projectRoot}/.next`, so an Nx
 * cache restore brings it back with the build it describes.
 */
export const SOURCE_HASH_FILE = join(APP_ROOT, ".next", "genie-source-hash");

/**
 * Files under the watched roots that are build outputs rather than hand-written
 * source. `generate-registry` declares `src/modules.ts` and
 * `src/styles/module-sources.generated.css` as its outputs, so Nx restores them
 * on a cache hit, and they follow the module selection rather than the source
 * of the build. Measured on the earlier time-based check: without this
 * exclusion it fired on a correct tree under root `pnpm test`, where `build` was
 * a cache hit and `generate-registry` was restored.
 */
const GENERATED_SOURCES = new Set([
  join(APP_ROOT, "src", "modules.ts"),
  join(APP_ROOT, "src", "styles", "module-sources.generated.css"),
]);

/**
 * Tests and stories, which the `production` named input in `nx.json` leaves out
 * of `build`. A change to one alone keeps the cached `.next`, so it must not
 * make that build look stale.
 */
const NOT_BUILD_INPUT = /\.(test\.tsx?|stories\.[^/]+)$/;

/**
 * The transient fixtures the lint suites write into real `src` folders and
 * delete again, by the markers `tsconfig.build.json`, `.dockerignore` and the
 * unit Vitest preset leave out. One appearing while `tools/build.ts` hashes
 * would store a hash no clean tree matches, and Nx would cache it with `.next`.
 */
const TRANSIENT_FIXTURE = /__(boundary|wiring|antislop|shadcn)__/;

/** Every source tree whose change can alter the application build. */
export function buildSourceRoots(): readonly string[] {
  const modulesRoot = join(WORKSPACE_ROOT, "packages/modules");

  const moduleSources = readdirSync(modulesRoot, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(modulesRoot, entry.name, "src"))
    // A lint fixture can leave a module folder with no `src`, which the build ignores too.
    .filter((src) => existsSync(src));

  return [
    join(APP_ROOT, "src"),
    join(APP_ROOT, "tools"),
    join(WORKSPACE_ROOT, "packages/core/src"),
    join(WORKSPACE_ROOT, "packages/ui/src"),
    ...moduleSources,
  ];
}

/** Whether a file under the roots is an input of the application build. */
export function isBuildSource(path: string): boolean {
  return (
    !GENERATED_SOURCES.has(path) &&
    !NOT_BUILD_INPUT.test(path) &&
    !TRANSIENT_FIXTURE.test(path)
  );
}

function filesUnder(current: string, into: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const child = join(current, entry.name);

    if (entry.isDirectory()) {
      filesUnder(child, into);
    } else if (isBuildSource(child)) {
      into.push(child);
    }
  }
}

/**
 * A sha256 over the path (relative to the workspace root) and the bytes of
 * every build source under `roots`, in sorted path order. No file time goes
 * in: Nx restores and checks out files with fresh times, so only content says
 * whether a build reflects the tree. It walks the file system rather than asking
 * git, because the image builder has no `.git`.
 */
export function buildSourceHash(
  roots: readonly string[] = buildSourceRoots()
): string {
  const files: string[] = [];

  for (const root of roots) {
    filesUnder(root, files);
  }

  const hash = createHash("sha256");

  // Code-unit order, not locale order, so every machine walks the same sequence.
  for (const file of files.toSorted()) {
    const bytes = readFileSync(file);

    // The length bounds each file, so no path and content can run into the next.
    hash.update(`${relative(WORKSPACE_ROOT, file)}\0${bytes.length}\0`);
    hash.update(bytes);
  }

  return hash.digest("hex");
}
