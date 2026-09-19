import { describe, expect, it } from "vitest";

import type { ModuleInventoryEntry } from "./inventory.ts";
import { resolveModuleSelection } from "./resolve.ts";

const WORKSPACE_ROOT = new URL("./__fixtures__/", import.meta.url).pathname;

const alpha: ModuleInventoryEntry = {
  id: "alpha",
  packageName: "@genie/modules-alpha",
  packageRoot: "throwing-module",
  entrypoint: "throwing-module/src/index.ts",
};

const beta: ModuleInventoryEntry = { ...alpha, id: "beta" };

const inventory = [alpha, beta] as const;

function resolve(moduleInclude: string | undefined) {
  return resolveModuleSelection({
    moduleInclude,
    inventory,
    workspaceRoot: WORKSPACE_ROOT,
  });
}

describe("resolveModuleSelection", () => {
  it("treats an unset value as every module, which is the development and CI default", () => {
    const selection = resolve(undefined);
    expect(selection.source).toBe("unset");
    expect(selection.ids).toEqual(["alpha", "beta"]);
  });

  it("treats an empty string as an explicit choice of no module", () => {
    const selection = resolve("");
    expect(selection.source).toBe("explicit");
    expect(selection.ids).toEqual([]);
  });

  it("keeps the supplied order, because that order also decides the registry order", () => {
    expect(resolve("beta,alpha").ids).toEqual(["beta", "alpha"]);
  });

  it("accepts spacing around an id", () => {
    expect(resolve(" beta , alpha ").ids).toEqual(["beta", "alpha"]);
  });

  it("rejects an unknown id rather than skipping it", () => {
    expect(() => resolve("alpha,gamma")).toThrow(/unknown module id: gamma/i);
  });

  it("rejects a duplicate id", () => {
    expect(() => resolve("alpha,alpha")).toThrow(/duplicate module id: alpha/i);
  });

  it("rejects an empty segment, which is a malformed list rather than an empty selection", () => {
    expect(() => resolve("alpha,,beta")).toThrow(/empty module id/i);
  });

  it("rejects a missing entrypoint file", () => {
    const broken = [
      { ...alpha, entrypoint: "throwing-module/src/absent.ts" },
    ] as const;

    expect(() =>
      resolveModuleSelection({
        moduleInclude: "alpha",
        inventory: broken,
        workspaceRoot: WORKSPACE_ROOT,
      })
    ).toThrow(/entrypoint .* does not exist/i);
  });

  it("never evaluates a module, so a module that throws on import still resolves", () => {
    expect(() => resolve("alpha")).not.toThrow();
    expect(resolve("alpha").entries[0]?.entrypoint).toBe(
      "throwing-module/src/index.ts"
    );
  });
});
