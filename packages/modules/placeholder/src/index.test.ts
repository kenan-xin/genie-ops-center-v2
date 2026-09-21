import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateModule } from "@genie/core";
import { describe, expect, it } from "vitest";

/**
 * What a consumer reaches. The application imports the package root and mounts what it finds
 * there; a story imports the presentation subpath. A declaration that only exists inside the
 * package is unreachable, however complete it is.
 *
 * Each subpath is read from the manifest and imported by the path the manifest names, not by
 * the package name: a module never imports a module package, its own included, and the import
 * boundary enforces that. Reading the manifest is also what catches the real defect, which is
 * an entry point that maps to a file exporting something else.
 */
const PACKAGE_ROOT = join(import.meta.dirname, "..");

type Manifest = { readonly exports: Readonly<Record<string, string>> };

function subpath(name: string): string {
  const manifest: Manifest = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
  );

  const target = manifest.exports[name];

  if (target === undefined) {
    throw new Error(`the manifest declares no "${name}" export`);
  }

  return join(PACKAGE_ROOT, target);
}

describe("the declared package root", () => {
  it("exports the module declaration, and it satisfies the contract", async () => {
    const entrypoint = await import(subpath("."));

    expect(validateModule(entrypoint.placeholderModule)).toEqual([]);
  });

  it("exports the router and the table the registry and the migrator need", async () => {
    const entrypoint = await import(subpath("."));

    expect(entrypoint.placeholderRouter).toBeDefined();
    expect(entrypoint.MIGRATIONS_TABLE).toBe(
      "__drizzle_migrations_placeholder"
    );
    expect(entrypoint.placeholderRecord).toBeDefined();
  });
});

describe("the declared presentation subpath", () => {
  it("exports the components a story and the shell render", async () => {
    const presentation = await import(subpath("./presentation"));

    expect(presentation.WorkspacePage).toBeTypeOf("function");
    expect(presentation.AdminPage).toBeTypeOf("function");
  });

  it("exports no router, schema or module declaration", async () => {
    const presentation = await import(subpath("./presentation"));

    for (const name of [
      "placeholderRouter",
      "placeholderRecord",
      "placeholderModule",
    ]) {
      expect(Object.hasOwn(presentation, name)).toBe(false);
    }
  });
});
