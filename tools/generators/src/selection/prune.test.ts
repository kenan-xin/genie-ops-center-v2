import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { pruneModuleFolders } from "./prune.ts";

const SCRIPT = new URL("./prune.ts", import.meta.url).pathname;

const roots: string[] = [];

/** A workspace root holding the named module packages and a README beside them. */
function workspace(ids: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "genie-prune-"));

  roots.push(root);

  mkdirSync(join(root, "packages/modules"), { recursive: true });

  writeFileSync(join(root, "packages/modules/README.md"), "# modules\n");

  for (const id of ids) {
    const packageRoot = join(root, "packages/modules", id);

    mkdirSync(join(packageRoot, "src"), { recursive: true });

    writeFileSync(
      join(packageRoot, "package.json"),
      JSON.stringify({
        name: `@genie/module-${id}`,
        genie: { module: { id, entrypoint: "src/index.ts" } },
      })
    );

    writeFileSync(join(packageRoot, "src/index.ts"), "export {};\n");
  }

  return root;
}

const folders = (root: string) =>
  readdirSync(join(root, "packages/modules"), { withFileTypes: true })
    .filter((entry) => !entry.isFile())
    .map((entry) => entry.name)
    .toSorted();

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("pruneModuleFolders", () => {
  it("removes every module folder the selection does not name and keeps the rest", () => {
    const root = workspace(["alpha", "beta", "gamma"]);

    expect(pruneModuleFolders(root, "gamma,alpha")).toEqual({
      kept: ["alpha", "gamma"],
      removed: ["beta"],
      removedEmpty: [],
    });

    expect(folders(root)).toEqual(["alpha", "gamma"]);
    expect(existsSync(join(root, "packages/modules/README.md"))).toBe(true);
  });

  it("removes every module folder for an explicitly empty selection", () => {
    const root = workspace(["alpha", "beta"]);

    expect(pruneModuleFolders(root, "")).toEqual({
      kept: [],
      removed: ["alpha", "beta"],
      removedEmpty: [],
    });

    expect(folders(root)).toEqual([]);
  });

  // Unset means "every module" on a host, and an image build must never guess.
  it("refuses an unset selection and removes nothing", () => {
    const root = workspace(["alpha", "beta"]);

    expect(() => pruneModuleFolders(root, undefined)).toThrow(
      /MODULE_INCLUDE is unset/
    );

    expect(folders(root)).toEqual(["alpha", "beta"]);
  });

  it("refuses an unknown id before it removes anything", () => {
    const root = workspace(["alpha", "beta"]);

    expect(() => pruneModuleFolders(root, "alpha,missing")).toThrow(
      /Unknown module id: missing/
    );

    expect(folders(root)).toEqual(["alpha", "beta"]);
  });

  // A branch switch leaves packages/modules/<old>/node_modules untracked, and
  // the image context drops ignored contents but keeps the folders, so the
  // builder stage sees a folder holding only empty folders. It holds no code.
  it("removes an empty leftover folder without a module manifest and lets the build proceed", () => {
    const root = workspace(["alpha", "beta"]);

    mkdirSync(join(root, "packages/modules/old/node_modules/.bin"), {
      recursive: true,
    });

    expect(pruneModuleFolders(root, "alpha")).toEqual({
      kept: ["alpha"],
      removed: ["beta"],
      removedEmpty: ["old"],
    });

    expect(folders(root)).toEqual(["alpha"]);
  });

  // The check itself: a folder that is not a module package is invisible to the
  // inventory, so the prune leaves it, and the folder comparison must catch it.
  it("fails when a folder the selection does not name remains after the prune", () => {
    const root = workspace(["alpha", "beta"]);

    mkdirSync(join(root, "packages/modules/stray/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/modules/stray/src/index.ts"),
      "export {};\n"
    );

    expect(() => pruneModuleFolders(root, "alpha")).toThrow(
      /packages\/modules holds stray, which the selection does not name/
    );
  });
});

describe("the prune command the image builder stage runs", () => {
  const runPrune = (root: string, moduleInclude: string | undefined) => {
    const env = { ...process.env };

    delete env.MODULE_INCLUDE;

    if (moduleInclude !== undefined) env.MODULE_INCLUDE = moduleInclude;

    return spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      env,
      encoding: "utf8",
    });
  };

  it("prints the kept and removed folders the build log shows", () => {
    const root = workspace(["alpha", "beta"]);

    const result = runPrune(root, "alpha");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[module-prune] kept: alpha\n");
    expect(result.stdout).toContain("[module-prune] removed: beta\n");
  });

  it("prints a removed empty leftover folder", () => {
    const root = workspace(["alpha"]);

    mkdirSync(join(root, "packages/modules/old"));

    const result = runPrune(root, "alpha");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "[module-prune] removed empty folder: old\n"
    );
  });

  it("prints none for an empty side", () => {
    const root = workspace(["alpha"]);

    const result = runPrune(root, "");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[module-prune] kept: (none)\n");
    expect(result.stdout).toContain("[module-prune] removed: alpha\n");
  });

  it("exits nonzero with the reason when MODULE_INCLUDE is unset", () => {
    const root = workspace(["alpha"]);

    const result = runPrune(root, undefined);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/MODULE_INCLUDE is unset/);
    expect(folders(root)).toEqual(["alpha"]);
  });
});
