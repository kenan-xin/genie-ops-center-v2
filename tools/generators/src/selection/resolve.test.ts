import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ModuleInventoryEntry } from "./inventory.ts";
import { resolveModuleSelection } from "./resolve.ts";

const WORKSPACE_ROOT = new URL("./__fixtures__/", import.meta.url).pathname;

const alpha: ModuleInventoryEntry = {
  id: "alpha",
  packageName: "@genie/module-alpha",
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

  it("rejects an entrypoint that is a directory rather than a file", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-resolve-"));

    try {
      mkdirSync(join(root, "packages/modules/alpha/src"), { recursive: true });

      expect(() =>
        resolveModuleSelection({
          moduleInclude: "alpha",
          inventory: [
            {
              ...alpha,
              packageRoot: "packages/modules/alpha",
              entrypoint: "packages/modules/alpha/src",
            },
          ],
          workspaceRoot: root,
        })
      ).toThrow(/entrypoint .* is not a file/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // A contained path can still resolve outside the package through a symlink,
  // and the emitted import would then reach code the selection never declared.
  it("rejects an entrypoint whose symlink resolves outside the module package", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-resolve-"));

    try {
      mkdirSync(join(root, "packages/modules/alpha/src"), { recursive: true });
      mkdirSync(join(root, "outside"), { recursive: true });
      writeFileSync(join(root, "outside/index.ts"), "", "utf8");
      symlinkSync(
        join(root, "outside/index.ts"),
        join(root, "packages/modules/alpha/src/index.ts")
      );

      expect(() =>
        resolveModuleSelection({
          moduleInclude: "alpha",
          inventory: [
            {
              ...alpha,
              packageRoot: "packages/modules/alpha",
              entrypoint: "packages/modules/alpha/src/index.ts",
            },
          ],
          workspaceRoot: root,
        })
      ).toThrow(/escapes packages\/modules\/alpha/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts an entrypoint contained in its own package", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-resolve-"));

    try {
      mkdirSync(join(root, "packages/modules/alpha/src"), { recursive: true });
      writeFileSync(
        join(root, "packages/modules/alpha/src/index.ts"),
        "",
        "utf8"
      );

      expect(
        resolveModuleSelection({
          moduleInclude: "alpha",
          inventory: [
            {
              ...alpha,
              packageRoot: "packages/modules/alpha",
              entrypoint: "packages/modules/alpha/src/index.ts",
            },
          ],
          workspaceRoot: root,
        }).ids
      ).toEqual(["alpha"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // A contained file may legitimately start with two dots, so containment is a
  // path comparison rather than a prefix test on the relative string.
  it("accepts a contained file whose own name starts with two dots", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-resolve-"));

    try {
      mkdirSync(join(root, "packages/modules/alpha"), { recursive: true });
      writeFileSync(
        join(root, "packages/modules/alpha/..hidden.ts"),
        "",
        "utf8"
      );

      expect(
        resolveModuleSelection({
          moduleInclude: "alpha",
          inventory: [
            {
              ...alpha,
              packageRoot: "packages/modules/alpha",
              entrypoint: "packages/modules/alpha/..hidden.ts",
            },
          ],
          workspaceRoot: root,
        }).ids
      ).toEqual(["alpha"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The package root is resolved too, so a linked package still contains its file.
  it("accepts a contained entrypoint when the package folder is itself a symlink", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-resolve-"));

    try {
      mkdirSync(join(root, "real-alpha/src"), { recursive: true });
      writeFileSync(join(root, "real-alpha/src/index.ts"), "", "utf8");
      mkdirSync(join(root, "packages/modules"), { recursive: true });
      symlinkSync(
        join(root, "real-alpha"),
        join(root, "packages/modules/alpha")
      );

      expect(
        resolveModuleSelection({
          moduleInclude: "alpha",
          inventory: [
            {
              ...alpha,
              packageRoot: "packages/modules/alpha",
              entrypoint: "packages/modules/alpha/src/index.ts",
            },
          ],
          workspaceRoot: root,
        }).ids
      ).toEqual(["alpha"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a symlink cycle as a missing entrypoint rather than a raw system error", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-resolve-"));

    try {
      mkdirSync(join(root, "packages/modules/alpha/src"), { recursive: true });
      symlinkSync(
        join(root, "packages/modules/alpha/src/loop.ts"),
        join(root, "packages/modules/alpha/src/index.ts")
      );
      symlinkSync(
        join(root, "packages/modules/alpha/src/index.ts"),
        join(root, "packages/modules/alpha/src/loop.ts")
      );

      expect(() =>
        resolveModuleSelection({
          moduleInclude: "alpha",
          inventory: [
            {
              ...alpha,
              packageRoot: "packages/modules/alpha",
              entrypoint: "packages/modules/alpha/src/index.ts",
            },
          ],
          workspaceRoot: root,
        })
      ).toThrow(/entrypoint .* does not exist/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a package root that does not exist rather than a raw system error", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-resolve-"));

    try {
      mkdirSync(join(root, "packages/modules/alpha/src"), { recursive: true });
      writeFileSync(
        join(root, "packages/modules/alpha/src/index.ts"),
        "",
        "utf8"
      );

      expect(() =>
        resolveModuleSelection({
          moduleInclude: "alpha",
          inventory: [
            {
              ...alpha,
              packageRoot: "packages/modules/absent",
              entrypoint: "packages/modules/alpha/src/index.ts",
            },
          ],
          workspaceRoot: root,
        })
      ).toThrow(/escapes packages\/modules\/absent/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never evaluates a module, so a module that throws on import still resolves", () => {
    expect(() => resolve("alpha")).not.toThrow();
    expect(resolve("alpha").entries[0]?.entrypoint).toBe(
      "throwing-module/src/index.ts"
    );
  });
});
