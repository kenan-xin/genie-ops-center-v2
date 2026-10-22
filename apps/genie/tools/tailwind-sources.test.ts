/**
 * The proof `genie-ops-center-v2-3yv` asks for, rewritten for D3-2: the
 * stylesheet's scan list is read from a real compile, not asserted as text.
 *
 * Automatic detection is off, so the compiler's source list is the whole scan.
 * It must name the shared UI, core, the app and each selected module, and no
 * other module, so that an excluded module adds no class (R-19c). The test
 * lives in `tools/`, because product source never imports a generator (R-7a).
 *
 * API confirmed against the installed tailwindcss 4.3.3 types, dist/lib.d.mts:
 *   compile(css, opts) => Promise<{ sources: { base, pattern, negated }[], ... }>
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readModuleInventory, resolveModuleSelection } from "@genie/generators";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "../src/styles");

const workspaceRoot = resolve(here, "../../../..");

const requireFrom = createRequire(import.meta.url);

async function compileApplicationStylesheet() {
  const css = await readFile(resolve(here, "globals.css"), "utf8");

  return compile(css, {
    base: here,

    // `@import "tailwindcss"` pulls the framework's own stylesheets, and the
    // generated module sources are a relative import.
    loadStylesheet: async (id, base) => {
      const path = id.startsWith(".")
        ? resolve(base, id)
        : requireFrom.resolve(id.endsWith(".css") ? id : `${id}/index.css`);

      return {
        path,
        base: dirname(path),
        content: await readFile(path, "utf8"),
      };
    },
  });
}

describe("the application stylesheet", () => {
  it("scans the shared UI, core, the app and only the selected modules", async () => {
    const compiled = await compileApplicationStylesheet();

    const scanned = compiled.sources.map((source) =>
      resolve(source.base, source.pattern)
    );

    // The same selection the `generate-registry` dependency wrote the file for.
    const selected = resolveModuleSelection({
      moduleInclude: process.env.MODULE_INCLUDE,
      inventory: readModuleInventory(workspaceRoot),
      workspaceRoot,
    }).entries.map((entry) => resolve(workspaceRoot, entry.packageRoot, "src"));

    expect(scanned.toSorted()).toEqual(
      [
        resolve(workspaceRoot, "packages/ui/src"),
        resolve(workspaceRoot, "packages/core/src"),
        resolve(workspaceRoot, "apps/genie/src"),
        ...selected,
      ].toSorted()
    );
  });

  it("produces utilities, so the compile itself is real", async () => {
    const compiled = await compileApplicationStylesheet();

    // Without this, a compile that silently produced nothing would still let the
    // source assertion above pass.
    expect(compiled.build(["flex"])).toContain("display: flex");
  });
});
