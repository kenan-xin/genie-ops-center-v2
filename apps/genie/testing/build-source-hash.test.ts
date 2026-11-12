import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSourceHash, isBuildSource } from "./build-source-hash.ts";

const APP_ROOT = resolve(import.meta.dirname, "..");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "build-source-hash-"));
  mkdirSync(join(root, "lib"));
  writeFileSync(join(root, "index.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "lib", "b.ts"), "export const b = 2;\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildSourceHash", () => {
  it("changes when the bytes of a source change, at the same size", () => {
    const before = buildSourceHash([root]);

    writeFileSync(join(root, "index.ts"), "export const a = 9;\n");

    expect(buildSourceHash([root])).not.toBe(before);
  });

  it("stays equal when only a file's time changes", () => {
    const before = buildSourceHash([root]);

    utimesSync(join(root, "index.ts"), 0, 0);

    expect(buildSourceHash([root])).toBe(before);
  });

  it("changes when a source is added, or removed and added under another path", () => {
    const before = buildSourceHash([root]);

    writeFileSync(join(root, "lib", "c.ts"), "");
    const added = buildSourceHash([root]);
    rmSync(join(root, "lib", "c.ts"));
    // Same bytes under a new path, so only the path tells the trees apart.
    renameSync(join(root, "lib", "b.ts"), join(root, "lib", "c.ts"));

    expect(added).not.toBe(before);
    expect(buildSourceHash([root])).not.toBe(before);
  });

  it.each(["index.test.ts", "lib/view.test.tsx", "lib/view.stories.tsx"])(
    "stays equal when %s changes, which the production input leaves out",
    (name) => {
      const before = buildSourceHash([root]);

      writeFileSync(join(root, name), "it('x', () => {});\n");

      expect(buildSourceHash([root])).toBe(before);
    }
  );

  // The lint suites write these into real `src` folders while a build can be hashing.
  it.each([
    "__boundary__.ts",
    "__wiring__/view.tsx",
    "lib/probe.__antislop__.ts",
  ])("stays equal when the transient lint fixture %s appears", (name) => {
    const before = buildSourceHash([root]);

    mkdirSync(dirname(join(root, name)), { recursive: true });

    writeFileSync(join(root, name), "export {};\n");

    expect(buildSourceHash([root])).toBe(before);
  });
});

describe("isBuildSource", () => {
  it("leaves out the two generated registry files and keeps ordinary source", () => {
    expect(isBuildSource(join(APP_ROOT, "src", "modules.ts"))).toBe(false);
    expect(
      isBuildSource(
        join(APP_ROOT, "src", "styles", "module-sources.generated.css")
      )
    ).toBe(false);
    expect(isBuildSource(join(APP_ROOT, "src", "proxy.ts"))).toBe(true);
  });
});
