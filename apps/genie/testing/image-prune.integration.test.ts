import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dockerBuild, removeImage, requireDocker } from "./image-process.ts";
import { stageFixtureModule, stageWorkspace } from "./stage-workspace.ts";

/**
 * The build-input exclusion proof (Spec 0 AC-5 and AC-24, `pg4`), run inside a
 * real `docker build` of the production Dockerfile.
 *
 * Every case builds a staged copy of the workspace under the OS temporary
 * directory, never the checkout. Each stage carries one extra fixture module
 * under `packages/modules/` (the `permitted-viewer` template), so the prune has
 * something to remove even when placeholder is selected and every case can
 * fail. The builder stage is discarded, so the prune's own log lines are how
 * these cases observe it.
 *
 * The import cases import placeholder, because it is the one module the app
 * lists as a fixed workspace dependency with a real lockfile importer. The
 * import control proves both imports resolve when placeholder is selected, so
 * the failures below are the prune's doing and not a bad import.
 */

const EXTRA_MODULE = "permitted-viewer";

const DIRECT_IMPORT = `import "@genie/module-placeholder";\n`;

const SUBPATH_IMPORT = `import "@genie/module-placeholder/presentation";\n`;

const stages: string[] = [];

/** A staged workspace with the extra fixture module, and any edits applied. */
function stage(edit: (root: string) => void = () => undefined): string {
  const root = stageWorkspace("genie-s011-prune-");

  stages.push(root);

  stageFixtureModule(root, EXTRA_MODULE);

  // A unique file in the copied `packages` tree, so the prune step never
  // restores from Docker's layer cache. A cached step prints nothing, and the
  // log assertions below need the prune's own lines from this build.
  writeFileSync(join(root, "packages/.prune-proof-nonce"), `${root}\n`);

  edit(root);

  return root;
}

/** Prepends import lines to the root layout, which every page compiles. */
const importing =
  (...lines: readonly string[]) =>
  (root: string) => {
    const layout = join(root, "apps/genie/src/app/layout.tsx");

    writeFileSync(layout, `${lines.join("")}${readFileSync(layout, "utf8")}`);
  };

/** One prune log line, matched whole, so `kept: a` never matches `kept: a, b`. */
const pruneLine = (line: string) =>
  new RegExp(`\\[module-prune\\] ${line.replaceAll(/[()]/g, "\\$&")}$`, "m");

/** A resolution failure naming exactly this specifier, from Turbopack or tsc. */
const unresolved = (specifier: string) =>
  new RegExp(
    `(Module not found|Cannot find module).*'${specifier.replaceAll("/", "\\/")}'`
  );

/**
 * The failure must be attributed to the staged import, not to some other file
 * that happens to name the same module, such as a test file.
 */
const IMPORTER = /src\/app\/layout\.tsx/;

const tags: string[] = [];

/** Builds one case and records its tag, so afterAll removes only this file's images. */
const build = (
  root: string,
  moduleInclude: string | undefined,
  tag: string
) => {
  tags.push(tag);

  return dockerBuild(root, moduleInclude, tag);
};

/** The end of a build log, where the failing step is. */
const tail = (log: string) => log.slice(-6000);

describe("the builder-stage module prune", () => {
  beforeAll(async () => {
    await requireDocker();
  }, 120000);

  afterAll(async () => {
    // Only the stages and image tags this file created. A failed build leaves
    // no tag, which removeImage ignores.
    for (const root of stages) rmSync(root, { recursive: true, force: true });

    await Promise.all(tags.map(removeImage));
  }, 120000);

  it("keeps the selected module and removes every other module folder, as the build log shows", async () => {
    const result = await build(
      stage(),
      "placeholder",
      "genie-s011:prune-control"
    );

    expect(result.ok, tail(result.log)).toBe(true);
    expect(result.log).toMatch(pruneLine("kept: placeholder"));
    expect(result.log).toMatch(pruneLine(`removed: ${EXTRA_MODULE}`));
  }, 900000);

  it("prunes every module folder for an explicitly empty selection although the app depends on placeholder", async () => {
    const result = await build(stage(), "", "genie-s011:prune-empty");

    expect(result.ok, tail(result.log)).toBe(true);
    expect(result.log).toMatch(pruneLine("kept: (none)"));
    expect(result.log).toMatch(
      pruneLine(`removed: ${EXTRA_MODULE}, placeholder`)
    );
  }, 900000);

  it("refuses an unset MODULE_INCLUDE", async () => {
    const result = await build(stage(), undefined, "genie-s011:prune-unset");

    expect(result.ok, tail(result.log)).toBe(false);
    expect(result.log).toMatch(/\[module-prune\] MODULE_INCLUDE is unset/);
  }, 900000);

  it("fails the build when a folder the selection does not name remains", async () => {
    const root = stage((staged) => {
      mkdirSync(join(staged, "packages/modules/stray/src"), {
        recursive: true,
      });
      writeFileSync(
        join(staged, "packages/modules/stray/src/index.ts"),
        "export {};\n"
      );
    });

    const result = await build(root, "placeholder", "genie-s011:prune-stray");

    expect(result.ok, tail(result.log)).toBe(false);
    expect(result.log).toMatch(
      /\[module-prune\] packages\/modules holds stray, which the selection does not name/
    );
  }, 900000);

  it("resolves a direct and a subpath import of a selected module", async () => {
    const root = stage(importing(DIRECT_IMPORT, SUBPATH_IMPORT));

    const result = await build(
      root,
      "placeholder",
      "genie-s011:prune-import-control"
    );

    expect(result.ok, tail(result.log)).toBe(true);
  }, 900000);

  it("fails the build on a direct import of an excluded module", async () => {
    const root = stage(importing(DIRECT_IMPORT));

    const result = await build(root, "", "genie-s011:prune-direct");

    expect(result.ok, tail(result.log)).toBe(false);
    expect(result.log).toMatch(
      pruneLine(`removed: ${EXTRA_MODULE}, placeholder`)
    );
    expect(result.log).toMatch(unresolved("@genie/module-placeholder"));
    expect(result.log).toMatch(IMPORTER);
  }, 900000);

  it("fails the build on a subpath import of an excluded module", async () => {
    const root = stage(importing(SUBPATH_IMPORT));

    const result = await build(root, "", "genie-s011:prune-subpath");

    expect(result.ok, tail(result.log)).toBe(false);
    expect(result.log).toMatch(
      pruneLine(`removed: ${EXTRA_MODULE}, placeholder`)
    );
    expect(result.log).toMatch(
      unresolved("@genie/module-placeholder/presentation")
    );
    expect(result.log).toMatch(IMPORTER);
  }, 900000);
});
