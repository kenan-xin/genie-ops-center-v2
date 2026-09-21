import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readModuleInventory } from "./inventory.ts";

/** One package.json body a test workspace holds under packages/modules/<folder>. */
type TestManifest = {
  readonly name?: string;
  readonly genie?: {
    readonly module?: { readonly id?: string; readonly entrypoint?: unknown };
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
    name: `@genie/module-${id}`,
    genie: { module: { id, entrypoint: "src/index.ts" } },
  };
}

describe("readModuleInventory", () => {
  it.each([{ entrypoint: "src/index.ts" }, { id: "alpha" }, {}])(
    "rejects an incomplete module block: %j",
    (module) => {
      const root = workspaceHolding({
        alpha: { name: "@genie/module-alpha", genie: { module } },
      });

      try {
        expect(() => readModuleInventory(root)).toThrow(
          "has no genie.module id and entrypoint"
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

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
      packageName: "@genie/module-alpha",
      packageRoot: "packages/modules/alpha",
      entrypoint: "packages/modules/alpha/src/index.ts",
    });
  });

  it("rejects a module package that declares no genie.module block", () => {
    const root = workspaceHolding({ alpha: { name: "@genie/module-alpha" } });

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

  it("reads a hyphenated module id", () => {
    const root = workspaceHolding({
      "contract-data": moduleManifest("contract-data"),
    });

    expect(readModuleInventory(root)[0]).toEqual({
      id: "contract-data",
      packageName: "@genie/module-contract-data",
      packageRoot: "packages/modules/contract-data",
      entrypoint: "packages/modules/contract-data/src/index.ts",
    });
  });

  // Discovery is where an arbitrary manifest name is stopped. A module the
  // boundary patterns cannot match must never reach selection at all.
  it("rejects an arbitrary package name outside the module namespace", () => {
    const root = workspaceHolding({
      alpha: {
        name: "@genie/whatever",
        genie: { module: { id: "alpha", entrypoint: "src/index.ts" } },
      },
    });

    expect(() => readModuleInventory(root)).toThrow(
      /must be "@genie\/module-alpha"/
    );
  });

  it("rejects the superseded plural package name", () => {
    const root = workspaceHolding({
      alpha: {
        name: "@genie/modules-alpha",
        genie: { module: { id: "alpha", entrypoint: "src/index.ts" } },
      },
    });

    expect(() => readModuleInventory(root)).toThrow(
      /must be "@genie\/module-alpha"/
    );
  });

  it("rejects a folder basename that is not the declared module id", () => {
    const root = workspaceHolding({
      contracts: {
        name: "@genie/module-contract-data",
        genie: { module: { id: "contract-data", entrypoint: "src/index.ts" } },
      },
    });

    expect(() => readModuleInventory(root)).toThrow(
      /folder "contracts" holds the module "contract-data"/
    );
  });

  it("validates a module that no selection would include, so nothing is skipped", () => {
    const root = workspaceHolding({
      alpha: moduleManifest("alpha"),
      beta: {
        name: "@genie/whatever",
        genie: { module: { id: "beta", entrypoint: "src/index.ts" } },
      },
    });

    expect(() => readModuleInventory(root)).toThrow(
      /must be "@genie\/module-beta"/
    );
  });

  // The entrypoint is emitted as import text by registry generation, so a value
  // that is not a usable relative path must be stopped at discovery.
  it.each([
    { entrypoint: "" },
    { entrypoint: "   " },
    { entrypoint: 7 },
    { entrypoint: ["src/index.ts"] },
    { entrypoint: null },
  ])("rejects a malformed entrypoint value: %j", ({ entrypoint }) => {
    const root = workspaceHolding({
      alpha: {
        name: "@genie/module-alpha",
        genie: { module: { id: "alpha", entrypoint } },
      },
    });

    try {
      expect(() => readModuleInventory(root)).toThrow(
        /entrypoint must be a non-empty string/i
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    "../../../etc/passwd",
    "src/../../beta/index.ts",
    "..",
    "/etc/passwd",
  ])(
    "rejects an entrypoint that leaves the module package: %s",
    (entrypoint) => {
      const root = workspaceHolding({
        alpha: {
          name: "@genie/module-alpha",
          genie: { module: { id: "alpha", entrypoint } },
        },
      });

      try {
        expect(() => readModuleInventory(root)).toThrow(
          /must stay inside the module package/i
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it.each(["src\\..\\..\\beta\\index.ts", "C:\\Windows\\x.ts"])(
    "rejects a backslash spelling the posix normalizer cannot inspect: %s",
    (entrypoint) => {
      const root = workspaceHolding({
        alpha: {
          name: "@genie/module-alpha",
          genie: { module: { id: "alpha", entrypoint } },
        },
      });

      try {
        expect(() => readModuleInventory(root)).toThrow(
          /must stay inside the module package/i
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it.each([".", "./", "src/", "src/index.ts/"])(
    "rejects a folder-shaped entrypoint: %s",
    (entrypoint) => {
      const root = workspaceHolding({
        alpha: {
          name: "@genie/module-alpha",
          genie: { module: { id: "alpha", entrypoint } },
        },
      });

      try {
        expect(() => readModuleInventory(root)).toThrow(
          /must name a file rather than a folder/i
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  // The recorded path becomes import text, so one spelling must produce one string.
  it.each(["./src/index.ts", "src//index.ts", "  src/index.ts  "])(
    "records one canonical path for the spelling %j",
    (entrypoint) => {
      const root = workspaceHolding({
        alpha: {
          name: "@genie/module-alpha",
          genie: { module: { id: "alpha", entrypoint } },
        },
      });

      try {
        expect(readModuleInventory(root)[0]?.entrypoint).toBe(
          "packages/modules/alpha/src/index.ts"
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it("returns an empty inventory when no module folder exists yet", () => {
    const root = mkdtempSync(join(tmpdir(), "genie-inventory-empty-"));

    expect(readModuleInventory(root)).toEqual([]);
  });
});
