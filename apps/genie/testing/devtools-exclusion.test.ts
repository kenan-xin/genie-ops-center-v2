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
  // The diagnostics reader itself. An independent review found the
  // production server chunk calling `deploymentDiagnostics` and handing the
  // result to the client component, because the development check lived only
  // inside that component: the props crossed the boundary and were serialized
  // into every page's payload while the panel itself rendered nothing. The
  // check now sits in the layout, and this probe is what holds it there.
  //
  // The export name, not a string inside the reader. `postgresql:` was tried
  // and dropped: core's environment validation carries that literal and ships
  // in production for its own reasons, so the probe failed on a clean build.
  "deploymentDiagnostics",
];

/**
 * The one file Next copies rather than compiles. It is this package's manifest,
 * so it names the development dependencies as text. No devtools code reaches
 * the output through it, and no package is installed from it.
 */
const COPIED_MANIFEST = "standalone/apps/genie/package.json";

/** Next's own client console module, which mentions the browser extension. */
const NEXT_OWN = join("node_modules", "next", "dist");

/**
 * What a deployment serves: code, and the payloads that reach a browser as
 * data.
 *
 * `.js` alone was not enough. A value can leave the server in a prerendered
 * document or a flight payload without appearing in any script, which is how
 * the diagnostics leak above escaped an earlier version of this file.
 */
const SERVED_PAYLOAD = /\.(?:[cm]?js|html|rsc|json|txt)$/;

/** Every served file the build produced in those trees. */
function servedScripts(): readonly string[] {
  const found: string[] = [];

  for (const tree of SERVED) {
    for (const entry of readdirSync(join(BUILD_ROOT, tree), {
      recursive: true,
      withFileTypes: true,
    })) {
      const absolute = join(entry.parentPath, entry.name);

      if (!entry.isFile() || !SERVED_PAYLOAD.test(entry.name)) continue;

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
    const root = join(BUILD_ROOT, "standalone");

    // The whole standalone tree, not one folder inside it. An earlier version
    // looked at `standalone/node_modules/@tanstack`, which this build layout
    // never creates: pnpm traces land under `node_modules/.pnpm/<name>@<ver>/`
    // and the app's own tree is at `standalone/apps/genie/node_modules`. That
    // folder was always absent, so the case always passed and proved nothing.
    const installed = existsSync(root)
      ? readdirSync(root, { recursive: true, withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() &&
              /devtools/.test(entry.name) &&
              entry.parentPath.includes("node_modules")
          )
          .map((entry) =>
            relative(BUILD_ROOT, join(entry.parentPath, entry.name))
          )
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
