import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { assertBuildIsCurrent } from "./build-freshness.ts";

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

// The artifact this test reads has to be the one the current source produces. A
// stale `.next` would let the driver assertion pass for the wrong reason: the
// build output would carry no driver because it predates the change that added
// one. The shared guard fails closed with the rebuild command named.
beforeAll(() => {
  assertBuildIsCurrent(PROXY_ENTRY);
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
