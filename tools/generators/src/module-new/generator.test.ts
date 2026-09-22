import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, it } from "vitest";

import { moduleGenerator } from "./generator.ts";
import { renderModule } from "./render.ts";

/**
 * An empty workspace already carries its own scaffolding, so every assertion below
 * reads the paths this generator added and not the ones the helper created.
 */
function emptyTree() {
  const tree = createTreeWithEmptyWorkspace();
  const before = new Set(tree.listChanges().map((change) => change.path));

  return {
    tree,
    added: () =>
      tree
        .listChanges()
        .map((change) => change.path)
        .filter((path) => !before.has(path))
        .toSorted(),
  };
}

describe("nx g @genie/generators:module", () => {
  it("writes every rendered file into the tree, byte for byte", async () => {
    const { tree } = emptyTree();

    await moduleGenerator(tree, { name: "demo" });

    for (const [path, content] of renderModule({ id: "demo" })) {
      expect(tree.read(path, "utf-8"), path).toBe(content);
    }
  });

  it("writes nothing outside the module's own folder", async () => {
    const { tree, added } = emptyTree();

    await moduleGenerator(tree, { name: "demo" });

    expect(
      added().filter((path) => !path.startsWith("packages/modules/demo/"))
    ).toEqual([]);

    expect(added()).toHaveLength(renderModule({ id: "demo" }).size);
  });

  it("passes the display name through to the declaration", async () => {
    const { tree } = emptyTree();

    await moduleGenerator(tree, { name: "demo", displayName: "Demo Ops" });

    expect(tree.read("packages/modules/demo/src/module.ts", "utf-8")).toContain(
      'displayName: "Demo Ops"'
    );
  });

  it("refuses a bad id before it writes anything", async () => {
    const { tree, added } = emptyTree();

    await expect(moduleGenerator(tree, { name: "Demo" })).rejects.toThrow(
      /module id/
    );

    expect(added()).toEqual([]);
  });

  it("refuses to overwrite a module that already exists", async () => {
    const { tree } = emptyTree();

    tree.write("packages/modules/demo/package.json", "{}");

    await expect(moduleGenerator(tree, { name: "demo" })).rejects.toThrow(
      /already exists/
    );

    expect(tree.read("packages/modules/demo/package.json", "utf-8")).toBe("{}");
  });
});
