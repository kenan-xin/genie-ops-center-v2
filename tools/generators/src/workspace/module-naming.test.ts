import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  moduleNamingError,
  moduleProjectNamingError,
} from "./module-naming.ts";

describe("moduleNamingError", () => {
  it("accepts a hyphenated id whose folder, package and id agree", () => {
    expect(
      moduleNamingError(
        "contract-data",
        "@genie/module-contract-data",
        "contract-data"
      )
    ).toBeUndefined();
  });

  it("accepts a single-word id", () => {
    expect(
      moduleNamingError("solutions", "@genie/module-solutions", "solutions")
    ).toBeUndefined();
  });

  it("rejects a folder basename that is not the module id", () => {
    expect(
      moduleNamingError(
        "contracts",
        "@genie/module-contract-data",
        "contract-data"
      )
    ).toMatch(/folder "contracts" holds the module "contract-data"/);
  });

  it("rejects the superseded plural package name", () => {
    expect(
      moduleNamingError(
        "contract-data",
        "@genie/modules-contract-data",
        "contract-data"
      )
    ).toMatch(/must be "@genie\/module-contract-data"/);
  });

  it("rejects an arbitrary package name outside the module namespace", () => {
    expect(
      moduleNamingError("contract-data", "@genie/whatever", "contract-data")
    ).toMatch(/must be "@genie\/module-contract-data"/);
  });

  it("rejects a folder that repeats the prefix, which was the superseded proposal", () => {
    expect(
      moduleNamingError(
        "module-contract-data",
        "@genie/module-contract-data",
        "contract-data"
      )
    ).toMatch(/folder "module-contract-data" holds the module "contract-data"/);
  });

  it("does not judge the shape of the id, which the declaration contract owns", () => {
    // `id` is kebab-case by `docs/architecture/module-contract.md`, Identity row.
    // That layer owns the character set. A second rule here would be a second
    // source of truth, so this one checks agreement only.
    expect(
      moduleNamingError(
        "Contract_Data",
        "@genie/module-Contract_Data",
        "Contract_Data"
      )
    ).toBeUndefined();
  });
});

/** One package.json body a disposable workspace holds under packages/modules. */
type TestManifest = {
  readonly name?: string;
  readonly genie?: {
    readonly module?: { readonly id: string; readonly entrypoint: string };
  };
};

/** Builds a throwaway workspace holding one module package.json per folder. */
function workspaceHolding(
  manifests: Readonly<Record<string, TestManifest>>
): string {
  const root = mkdtempSync(join(tmpdir(), "genie-naming-"));

  for (const [folder, manifest] of Object.entries(manifests)) {
    const dir = join(root, "packages/modules", folder);

    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest), "utf8");
  }

  return root;
}

// The workspace check runs against a disposable workspace here and against the
// real one in the hygiene suite. Both call this function, so the proof does not
// wait for the first real module to exist.
describe("moduleProjectNamingError over a disposable workspace", () => {
  it("accepts a correctly named module package", () => {
    const root = workspaceHolding({
      "contract-data": {
        name: "@genie/module-contract-data",
        genie: { module: { id: "contract-data", entrypoint: "src/index.ts" } },
      },
    });

    expect(
      moduleProjectNamingError("packages/modules/contract-data", root)
    ).toBeUndefined();
  });

  it("rejects a module package whose name is outside the module namespace", () => {
    const root = workspaceHolding({
      "contract-data": {
        name: "@genie/whatever",
        genie: { module: { id: "contract-data", entrypoint: "src/index.ts" } },
      },
    });

    expect(
      moduleProjectNamingError("packages/modules/contract-data", root)
    ).toMatch(/must be "@genie\/module-contract-data"/);
  });

  it("rejects a module folder that does not match its declared id", () => {
    const root = workspaceHolding({
      contracts: {
        name: "@genie/module-contract-data",
        genie: { module: { id: "contract-data", entrypoint: "src/index.ts" } },
      },
    });

    expect(
      moduleProjectNamingError("packages/modules/contracts", root)
    ).toMatch(/folder "contracts" holds the module "contract-data"/);
  });

  it("reports a manifest that declares no id, rather than passing it", () => {
    const root = workspaceHolding({
      "contract-data": { name: "@genie/module-contract-data" },
    });

    expect(
      moduleProjectNamingError("packages/modules/contract-data", root)
    ).toMatch(/declares no genie.module id/);
  });

  it("reports a missing manifest, rather than passing it", () => {
    const root = workspaceHolding({});

    expect(moduleProjectNamingError("packages/modules/absent", root)).toMatch(
      /has no package.json/
    );
  });
});
