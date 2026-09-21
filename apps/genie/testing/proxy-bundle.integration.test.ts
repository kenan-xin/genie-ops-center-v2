import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
 * This runs against the built output in `apps/genie/.next`, which the integration
 * target builds first. `pg` is externalised from every chunk (Turbopack leaves it
 * a runtime require), so chunk text alone cannot see it; what grows when the
 * driver is pulled in is the build's file trace. Both are checked, and the trace
 * is what decides.
 */

const NEXT_ROOT = resolve(import.meta.dirname, "../.next");

/** The proxy's entry file, which the build emits for `src/proxy.ts`. */
const PROXY_ENTRY = join(NEXT_ROOT, "server/middleware.js");

/** The proxy's file trace: the closure of everything its bundle reaches. */
const PROXY_TRACE = join(NEXT_ROOT, "server/middleware.js.nft.json");

/** A route that reaches the driver through the core root entry, as a control. */
const DRIVER_CONTROL_TRACE = join(
  NEXT_ROOT,
  "server/app/api/status/route.js.nft.json"
);

/** A quoted `pg` or `pg-*` module specifier, or the driver's package name. */
const DRIVER_TOKEN = /["']pg(?:-[a-z]+)*["']|node-postgres/;

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

/** The proxy's own chunk files, located from the entry file's requires. */
function proxyChunks(): readonly string[] {
  const entry = readFileSync(PROXY_ENTRY, "utf8");

  return [...entry.matchAll(/R\.c\("([^"]+)"\)/g)].flatMap((match) => {
    const chunk = match[1] ?? "";

    return chunk.length > 0 ? [join(NEXT_ROOT, chunk)] : [];
  });
}

const countTokens = (text: string): number =>
  [...text.matchAll(new RegExp(DRIVER_TOKEN, "g"))].length;

describe("the proxy bundle's dependency closure", () => {
  it("reaches no database driver, while a database route does", () => {
    // Locate the proxy's chunks from the build manifest, then read them. A
    // locator that found nothing would make the token search vacuous, so its
    // count is asserted and the proxy's own header string is required.
    const chunks = proxyChunks();

    expect(
      chunks.length,
      "no proxy chunks located from the build manifest"
    ).toBeGreaterThan(0);

    const chunkText = chunks
      .map((chunk) => readFileSync(chunk, "utf8"))
      .join("\n");

    // The deny baseline the proxy writes. If this is absent the locator read the
    // wrong files, and the driver search below would be reading nothing.
    expect(chunkText).toContain("frame-ancestors");

    // 1. The trace. `pg` is externalised from every chunk, so the file trace is
    // what grows when the driver is pulled in. Zero driver files in the proxy's
    // closure.
    const proxyDriverFiles = readTrace(PROXY_TRACE).files.filter(isDriverFile);

    expect(
      proxyDriverFiles,
      `the proxy bundle traced database driver files: ${proxyDriverFiles.join(", ")}`
    ).toEqual([]);

    // 2. The chunk text. No proxy chunk requires a driver module specifier.
    expect(countTokens(chunkText), "a proxy chunk names the driver").toBe(0);

    // Positive control, in the same test. A route that imports the core root
    // does reach the driver, so both halves of the check can see it: the trace
    // lists driver files, and the driver's own bytes match the token search. A
    // check that silently matched nothing fails here.
    const controlDriverFiles = readTrace(DRIVER_CONTROL_TRACE).files.flatMap(
      (file) =>
        isDriverFile(file) ? [resolve(dirname(DRIVER_CONTROL_TRACE), file)] : []
    );

    expect(
      controlDriverFiles.length,
      "the positive control route traced no driver files"
    ).toBeGreaterThan(0);

    const driverText = controlDriverFiles
      .flatMap((file) =>
        file.endsWith("pg-pool/index.js") ? [readFileSync(file, "utf8")] : []
      )
      .join("\n");

    expect(
      countTokens(driverText),
      "the token search matched no driver bytes"
    ).toBeGreaterThan(0);
  });
});
