import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * The claim, stated three times in the source (`src/proxy.ts`,
 * `src/viewer-routes.ts`, `src/context.ts`) and measured nowhere before this
 * test: the proxy bundle carries no database driver.
 *
 * The boundary linter bans `pg` as a DIRECT import, which is not the risk. The
 * risk is the transitive path through the core root entry, which the application
 * may import anywhere: adding `import { moduleById } from "./registry.ts"` to
 * `src/proxy.ts` puts the driver back and no other gate notices.
 *
 * This runs against the built output in `apps/genie/.next`. The detector is the
 * build's file trace, and only the file trace. Chunk text cannot serve: `pg` is
 * externalised from every chunk, so Turbopack leaves a runtime require and never
 * writes the specifier into the emitted text. Measured on this build, the
 * `/api/status` route reaches the driver through 63 traced files, and its own
 * chunks — 498,777 bytes of them — contain zero driver tokens. A token search
 * over chunk text therefore returns zero whether or not the proxy reaches the
 * driver, which is why no such search is asserted here.
 */

const APP_ROOT = resolve(import.meta.dirname, "..");

const WORKSPACE_ROOT = resolve(APP_ROOT, "../..");

const NEXT_ROOT = join(APP_ROOT, ".next");

/** The proxy's entry file, which the build emits for `src/proxy.ts`. */
const PROXY_ENTRY = join(NEXT_ROOT, "server/middleware.js");

/** The proxy's file trace: the closure of everything its bundle reaches. */
const PROXY_TRACE = join(NEXT_ROOT, "server/middleware.js.nft.json");

/** A route that reaches the driver through the core root entry, as a control. */
const DRIVER_CONTROL_TRACE = join(
  NEXT_ROOT,
  "server/app/api/status/route.js.nft.json"
);

type Trace = { readonly files: readonly string[] };

function readTrace(manifest: string): Trace {
  // SAFETY: the file is a Next build manifest written by the build, and the
  // assertions below read only `files`, which this shape names.
  return JSON.parse(readFileSync(manifest, "utf8")) as Trace;
}

/** True for a traced path inside the driver's own packages. */
function isDriverFile(filePath: string): boolean {
  return filePath
    .split("/")
    .some(
      (segment) =>
        segment === "pg" || segment === "pgpass" || segment.startsWith("pg-")
    );
}

/** Every source tree whose change can alter the built proxy. */
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

/**
 * Files under the watched roots that are build outputs rather than hand-written
 * source. `generate-registry` declares `src/modules.ts` as its output, so Nx
 * restores it on a cache hit and writes it with a fresh modification time — its
 * timestamp then says nothing about whether `.next` is current. Measured: without
 * this exclusion the check fired on a correct tree under root `pnpm test`, where
 * `build` was a cache hit and `generate-registry` was restored.
 */
const GENERATED_SOURCES = new Set([join(APP_ROOT, "src", "modules.ts")]);

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
 * The artifact this test reads has to be the one the current source produces. A
 * stale `.next` would let the driver assertion pass for the wrong reason: the
 * build output would carry no driver because it predates the change that added
 * one. `test:integration` depends on `build` through the Nx graph, but the
 * documented gate runs vitest directly, and a cache hit restores nothing without
 * a declared output, so the precondition is checked here rather than assumed.
 *
 * The verdict is modification time, and it is the right signal in this
 * direction: the build reads every source before it emits the proxy entry, so a
 * source newer than that entry means the entry does not reflect it. (This is the
 * opposite of the image guard's situation, where the image builds its own `.next`
 * and local timestamps are meaningless — see `image.startup.test.ts`.)
 */
beforeAll(() => {
  let builtAt: number;

  try {
    builtAt = statSync(PROXY_ENTRY).mtimeMs;
  } catch {
    throw new Error(
      `The build output is missing: ${PROXY_ENTRY} does not exist. Build it:\n  MODULE_INCLUDE=placeholder pnpm exec nx run @genie/app:build`
    );
  }

  const newestSource = Math.max(...sourceRoots().map(newestMtimeMs));

  if (newestSource > builtAt) {
    throw new Error(
      `The built proxy at ${PROXY_ENTRY} is older than the source it is built from, so this test would read stale output. Rebuild it:\n  MODULE_INCLUDE=placeholder pnpm exec nx run @genie/app:build`
    );
  }
});

describe("the proxy bundle's dependency closure", () => {
  it("reaches no database driver, while a database route does", () => {
    // 1. The trace. `pg` is externalised from every chunk, so the file trace is
    // what grows when the driver is pulled in. Zero driver files in the proxy's
    // closure.
    const proxyDriverFiles = readTrace(PROXY_TRACE).files.filter(isDriverFile);

    expect(
      proxyDriverFiles,
      `the proxy bundle traced database driver files: ${proxyDriverFiles.join(", ")}`
    ).toEqual([]);

    // Positive control, in the same test. A route that imports the core root
    // does reach the driver, so the detector can see one: its trace lists driver
    // files. A detector that silently matched nothing fails here.
    const controlDriverFiles =
      readTrace(DRIVER_CONTROL_TRACE).files.filter(isDriverFile);

    expect(
      controlDriverFiles.length,
      "the positive control route traced no driver files"
    ).toBeGreaterThan(0);
  });
});
