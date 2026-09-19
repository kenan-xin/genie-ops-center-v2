import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readModuleInventory } from "./inventory.ts";

/** One package.json body a test workspace holds under packages/modules/<folder>. */
type TestManifest = {
  readonly name?: string;
  readonly genie?: {
    readonly module?: { readonly id: string; readonly entrypoint: string };
  };
};

/** Builds a throwaway workspace holding one package.json per named module folder. */
function workspaceHolding(
  manifests: Readonly<Record<string, TestManifest>>
): string {
  const root = mkdtempSync(join(tmpdir(), "genie-inventory-"));

  for (const [folder, manifest] of Object.entries(manifests)) {
    const dir = join(root, "packages/modules", folder);

    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest), "utf8");
  }

  return root;
}

function moduleManifest(id: string): TestManifest {
  return {
    name: `@genie/modules-${id}`,
    genie: { module: { id, entrypoint: "src/index.ts" } },
  };
}

describe("readModuleInventory", () => {
  it("reads every module in sorted folder order, so the default list is stable", () => {
    const root = workspaceHolding({
      beta: moduleManifest("beta"),
      alpha: moduleManifest("alpha"),
    });

    const inventory = readModuleInventory(root);

    expect(inventory.map((entry) => entry.id)).toEqual(["alpha", "beta"]);
  });

  it("records the repository-relative entrypoint as a string and never loads it", () => {
    const root = workspaceHolding({ alpha: moduleManifest("alpha") });

    expect(readModuleInventory(root)[0]).toEqual({
      id: "alpha",
      packageName: "@genie/modules-alpha",
      packageRoot: "packages/modules/alpha",
      entrypoint: "packages/modules/alpha/src/index.ts",
    });
  });

  it("rejects a module package that declares no genie.module block", () => {
    const root = workspaceHolding({ alpha: { name: "@genie/modules-alpha" } });

    expect(() => readModuleInventory(root)).toThrow(
      /no genie.module id and entrypoint/i
    );
  });

  it("rejects a module package that declares no name", () => {
    const root = workspaceHolding({
      alpha: { genie: { module: { id: "alpha", entrypoint: "src/index.ts" } } },
    });

    expect(() => readModuleInventory(root)).toThrow(/has no name/i);
  });

  it("rejects two folders that claim the same module id", () => {
    const root = workspaceHolding({
      one: moduleManifest("alpha"),
      two: moduleManifest("alpha"),
    });

    expect(() => readModuleInventory(root)).toThrow(
      /duplicate module id in the inventory: alpha/i
    );
  });

  it("returns an empty inventory when no module folder exists yet", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-inventory-empty-"));

    expect(readModuleInventory(root)).toEqual([]);
  });
});
