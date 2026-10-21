import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { describe, expect, it } from "vitest";

import { moduleGenerator } from "./generator.ts";
import { renderModule } from "./render.ts";

const APP_MANIFEST = "apps/genie/package.json";

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

describe("nx g @genie/generators:module-new", () => {
  it("writes every rendered file into the tree, byte for byte", async () => {
    const { tree } = emptyTree();

    await moduleGenerator(tree, { name: "demo" });

    for (const [path, content] of renderModule({ id: "demo" })) {
      expect(tree.read(path, "utf-8"), path).toBe(content);
    }
  });

  it("writes nothing outside the module's folder and the app manifest", async () => {
    const { tree, added } = emptyTree();

    tree.write(APP_MANIFEST, JSON.stringify({ dependencies: {} }));

    await moduleGenerator(tree, { name: "demo" });

    expect(
      added().filter(
        (path) =>
          !path.startsWith("packages/modules/demo/") && path !== APP_MANIFEST
      )
    ).toEqual([]);
  });

  it("adds itself to the application's dependencies, in order", async () => {
    const { tree } = emptyTree();

    tree.write(
      APP_MANIFEST,
      `${JSON.stringify(
        {
          name: "@genie/app",
          dependencies: {
            "@genie/core": "workspace:*",
            "@genie/module-placeholder": "workspace:*",
            "@genie/ui": "workspace:*",
          },
        },
        undefined,
        2
      )}\n`
    );

    await moduleGenerator(tree, { name: "demo" });

    // SAFETY: the bytes are the manifest this test just wrote, then rewritten by
    // the generator; every field read below is asserted.
    const manifest = JSON.parse(tree.read(APP_MANIFEST, "utf-8") ?? "{}") as {
      dependencies: Record<string, string>;
    };

    expect(Object.keys(manifest.dependencies)).toEqual([
      "@genie/core",
      "@genie/module-demo",
      "@genie/module-placeholder",
      "@genie/ui",
    ]);

    expect(manifest.dependencies["@genie/module-demo"]).toBe("workspace:*");
  });

  it("adds the first dependency to a manifest that declares none", async () => {
    const { tree } = emptyTree();

    tree.write(APP_MANIFEST, `${JSON.stringify({ name: "@genie/app" })}\n`);

    await moduleGenerator(tree, { name: "demo" });

    // SAFETY: the bytes are the manifest the generator just rewrote; both fields
    // read below are asserted.
    const manifest = JSON.parse(tree.read(APP_MANIFEST, "utf-8") ?? "{}") as {
      name?: string;
      dependencies?: Record<string, string>;
    };

    expect(manifest.name).toBe("@genie/app");
    expect(manifest.dependencies).toEqual({
      "@genie/module-demo": "workspace:*",
    });
  });

  it("names the file when the manifest is not valid JSON", async () => {
    const { tree } = emptyTree();

    tree.write(APP_MANIFEST, "{ not json");

    await expect(moduleGenerator(tree, { name: "demo" })).rejects.toThrow(
      /apps\/genie\/package\.json is not valid JSON/
    );
  });

  it("refuses a manifest whose dependencies field is not an object", async () => {
    const { tree } = emptyTree();

    tree.write(APP_MANIFEST, JSON.stringify({ dependencies: "none" }));

    await expect(moduleGenerator(tree, { name: "demo" })).rejects.toThrow(
      /not an object/
    );
  });

  it("leaves the application alone when it has no manifest to edit", async () => {
    const { tree, added } = emptyTree();

    await moduleGenerator(tree, { name: "demo" });

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
