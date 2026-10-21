import { describe, expect, it } from "vitest";

import { emitRegistryModule } from "./emit.ts";

const entry = (id: string) => ({
  id,
  packageName: `@genie/module-${id}`,
  packageRoot: `packages/modules/${id}`,
  entrypoint: `packages/modules/${id}/src/index.ts`,
});

describe("emitRegistryModule", () => {
  it("imports each selected module by package name, in selection order", () => {
    const text = emitRegistryModule({
      source: "explicit",
      ids: ["beta", "alpha"],
      entries: [entry("beta"), entry("alpha")],
    });

    expect(text).toContain(
      'import { betaModule as module0 } from "@genie/module-beta";'
    );
    expect(text).toContain(
      'import { alphaModule as module1 } from "@genie/module-alpha";'
    );
    expect(text.indexOf("betaModule")).toBeLessThan(
      text.indexOf("alphaModule")
    );
  });

  it("emits an empty registry for an explicitly empty selection", () => {
    const text = emitRegistryModule({
      source: "explicit",
      ids: [],
      entries: [],
    });

    expect(text).toContain("export const selectedModules = [] as const;");
    expect(text).toContain("export const selectedModuleIds = [] as const;");
    expect(text).not.toContain("import {");
  });

  it("emits the resolved ids so the app can check declaration identity", () => {
    const text = emitRegistryModule({
      source: "explicit",
      ids: ["beta", "alpha"],
      entries: [entry("beta"), entry("alpha")],
    });

    expect(text).toContain(
      'export const selectedModuleIds = ["beta","alpha"] as const;'
    );
  });

  it("records the selection source, so unset and explicitly empty stay distinct", () => {
    const unset = emitRegistryModule({
      source: "unset",
      ids: ["alpha"],
      entries: [entry("alpha")],
    });

    const explicit = emitRegistryModule({
      source: "explicit",
      ids: ["alpha"],
      entries: [entry("alpha")],
    });

    expect(unset).toContain("Selection source: unset");
    expect(explicit).toContain("Selection source: explicit");
  });

  it("turns a kebab-case id into its camel-case export name", () => {
    const text = emitRegistryModule({
      source: "explicit",
      ids: ["contract-data"],
      entries: [entry("contract-data")],
    });

    expect(text).toContain(
      'import { contractDataModule as module0 } from "@genie/module-contract-data";'
    );
  });

  it("gives each import a unique local binding, even when export names collide", () => {
    // `a-1` and `a1` are both valid kebab-case ids, and upper-casing the
    // character after a hyphen does nothing to a digit, so both derive the
    // export name `a1Module`. Emitting that name twice would be a duplicate
    // binding and the generated file would not parse.
    const text = emitRegistryModule({
      source: "explicit",
      ids: ["a-1", "a1"],
      entries: [entry("a-1"), entry("a1")],
    });

    const bindings = [...text.matchAll(/import \{ \w+ as (\w+) \}/g)].map(
      (match) => match[1]
    );

    expect(bindings).toHaveLength(2);
    expect(new Set(bindings).size).toBe(2);
    expect(text).toContain('from "@genie/module-a-1";');
    expect(text).toContain('from "@genie/module-a1";');
  });

  it("lists the aliased bindings in selection order", () => {
    const text = emitRegistryModule({
      source: "explicit",
      ids: ["beta", "alpha"],
      entries: [entry("beta"), entry("alpha")],
    });

    const listed =
      /export const selectedModules = \[([^\]]*)\]/.exec(text)?.[1] ?? "";

    const bindings = [...text.matchAll(/import \{ \w+ as (\w+) \}/g)].map(
      (match) => match[1]
    );

    expect(listed.split(", ")).toEqual(bindings);
  });

  it("never emits a file-system path", () => {
    const text = emitRegistryModule({
      source: "unset",
      ids: ["alpha"],
      entries: [entry("alpha")],
    });

    expect(text).not.toContain("packages/modules");
  });
});
