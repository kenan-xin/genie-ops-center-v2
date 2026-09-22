import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The devtools are development-only, and this is what proves it.
 *
 * `apps/genie/src/devtools/devtools-mount.tsx` decides between the panels and a
 * component that renders nothing by reading `process.env.NODE_ENV`, which the
 * bundler replaces with a literal. The whole guarantee rests on that branch
 * folding, so it is asserted against the real build output rather than trusted.
 *
 * This file reads `.next` from disk and starts nothing. The `build` target is
 * its prerequisite (see the Nx configuration in `package.json`).
 *
 * It reads executable JavaScript only. Server source maps carry the original
 * text of every application module, the diagnostics panel included, exactly as
 * they do for every page in this application. That is the existing property of
 * the build, not something the devtools introduced, and no map is served to a
 * browser.
 */
const BUILD_ROOT = resolve(import.meta.dirname, "../.next");

/** The three trees a deployment serves from: the server, the browser, the image. */
const SERVED = ["server", "static", "standalone"];

/**
 * Probes that survive minification, which is the whole difficulty here.
 *
 * An earlier version of this file searched for the exported names
 * (`TanStackDevtools`, `ReactQueryDevtoolsPanel`). Those are renamed by the
 * minifier, so the search found nothing whether the devtools shipped or not,
 * and the file passed while proving nothing. Each probe below was chosen by
 * removing the development guard, rebuilding, and confirming it appears: with
 * the guard removed, all four below fail; with it in place, all four pass.
 *
 * `@tanstack/react-devtools` was tried as a fifth probe and dropped: its only
 * appearance is in the copied manifest, which this scan does not read, so it
 * failed to distinguish the two builds. A probe that cannot fail is worse than
 * no probe, because it reads as coverage.
 *
 * String literals survive minification; identifiers do not. A probe added here
 * must be a literal, and must be checked the same way.
 */
const DEVTOOLS_PROBES = [
  // A configuration key inside the devtools shell's own code.
  "hideUntilHover",
  // Two plugin names this application passes to the shell. "TanStack Query" is
  // deliberately absent: @tanstack/react-query is a real dependency and its own
  // code may carry that text, so it would not distinguish the two builds.
  "TanStack Pacer",
  "TanStack Form",
  // The diagnostics panel's own sentence, so the panel is covered as well as
  // the packages around it.
  "No user is signed in. Section 0 has no identity yet.",
];

/**
 * The one file Next copies rather than compiles. It is this package's manifest,
 * so it names the development dependencies as text. No devtools code reaches
 * the output through it, and no package is installed from it.
 */
const COPIED_MANIFEST = "standalone/apps/genie/package.json";

/** Next's own client console module, which mentions the browser extension. */
const NEXT_OWN = join("node_modules", "next", "dist");

/** Every JavaScript file the build produced in the served trees. */
function servedScripts(): readonly string[] {
  const found: string[] = [];

  for (const tree of SERVED) {
    for (const entry of readdirSync(join(BUILD_ROOT, tree), {
      recursive: true,
      withFileTypes: true,
    })) {
      const absolute = join(entry.parentPath, entry.name);

      if (!entry.isFile() || !/\.[cm]?js$/.test(entry.name)) continue;

      if (absolute.includes(NEXT_OWN)) continue;

      found.push(absolute);
    }
  }

  return found;
}

describe("the production build and the devtools", () => {
  const scripts = servedScripts();

  // Without this, every assertion below would pass on an absent or empty build,
  // which proves nothing at all.
  it("reads a real build, so an empty scan cannot pass", () => {
    expect(scripts.length).toBeGreaterThan(20);
  });

  // The control for the search itself: a symbol that must be there is found by
  // exactly the same method, so a search that matched nothing anywhere would
  // fail here rather than certify the exclusion below.
  it("finds application code by the same search, so the method works", () => {
    const hits = scripts.filter((path) =>
      readFileSync(path, "utf8").includes("Placeholder viewer")
    );

    expect(hits.length).toBeGreaterThan(0);
  });

  it.each(DEVTOOLS_PROBES)("ships no executable code carrying %s", (probe) => {
    const hits = scripts
      .filter((path) => readFileSync(path, "utf8").includes(probe))
      .map((path) => relative(BUILD_ROOT, path));

    expect(hits).toEqual([]);
  });

  it("installs no devtools package in the image it runs from", () => {
    const scoped = join(BUILD_ROOT, "standalone/node_modules/@tanstack");

    // An absent folder is the ordinary result and means nothing scoped was
    // traced into the image. When it exists, every entry in it is read, so a
    // devtools package traced in later fails here.
    const installed = existsSync(scoped)
      ? readdirSync(scoped).filter((name) => name.includes("devtools"))
      : [];

    expect(installed).toEqual([]);
  });

  // The two non-code mentions that do remain, named so that a change to either
  // fails here instead of quietly widening what the assertions above allow.
  it("mentions the devtools only in the copied manifest", () => {
    const manifest = readFileSync(join(BUILD_ROOT, COPIED_MANIFEST), "utf8");

    expect(manifest).toContain("@tanstack/react-devtools");

    // SAFETY: the manifest is this package's own package.json, copied by Next.
    const parsed = JSON.parse(manifest) as {
      dependencies?: Record<string, string>;
    };

    // Named as a development dependency only. A devtools package that became a
    // real dependency would be installed into the image, and that is the state
    // this case exists to catch.
    expect(Object.keys(parsed.dependencies ?? {})).not.toContain(
      "@tanstack/react-devtools"
    );
  });
});
