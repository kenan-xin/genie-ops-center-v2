import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { selectionLines } from "./print.ts";

const SCRIPT = new URL("./print.ts", import.meta.url).pathname;

const roots: string[] = [];

/**
 * A workspace root holding the named modules and nothing else. The entrypoint is
 * a real file, because the resolver proves every selected entrypoint exists.
 */
function workspace(ids: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "genie-print-"));

  roots.push(root);

  for (const id of ids) {
    const packageRoot = join(root, "packages/modules", id);

    mkdirSync(join(packageRoot, "src"), { recursive: true });

    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: `@genie/module-${id}`,
        genie: { module: { id, entrypoint: "src/index.ts" } },
      })}\n`,
      "utf8"
    );

    writeFileSync(join(packageRoot, "src/index.ts"), "export {};\n", "utf8");
  }

  return root;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("the selection line Nx hashes before a task runs", () => {
  it("prints the canonical selection and a metadata digest", () => {
    const root = workspace(["alpha", "beta"]);

    const lines = selectionLines(root, "alpha").split("\n");

    expect(lines[0]).toBe(`{"source":"explicit","ids":["alpha"]}`);
    expect(lines[1]).toMatch(/^metadata:[0-9a-f]{64}$/);
  });

  // The whole reason the raw MODULE_INCLUDE input is replaced: Nx cannot tell an
  // unset variable from an empty one, and the resolver calls them opposites.
  it("keeps unset, explicitly empty, one module and every module apart", () => {
    const root = workspace(["alpha", "beta"]);

    const printed = [
      selectionLines(root, undefined),
      selectionLines(root, ""),
      selectionLines(root, "alpha"),
      selectionLines(root, "alpha,beta"),
    ];

    expect(new Set(printed).size).toBe(4);
  });

  it("reports unset as every module and explicitly empty as none", () => {
    const root = workspace(["alpha", "beta"]);

    expect(selectionLines(root, undefined)).toContain(
      `{"source":"unset","ids":["alpha","beta"]}`
    );

    expect(selectionLines(root, "")).toContain(
      `{"source":"explicit","ids":[]}`
    );
  });

  // Spacing is spelling the resolver discards. Hashing the raw value made one
  // identical selection miss its own cache entry.
  it("prints one value for two spellings of one selection", () => {
    const root = workspace(["alpha", "beta"]);

    expect(selectionLines(root, " alpha , beta ")).toBe(
      selectionLines(root, "alpha,beta")
    );
  });

  it("changes when the selection order changes", () => {
    const root = workspace(["alpha", "beta"]);

    expect(selectionLines(root, "beta,alpha")).not.toBe(
      selectionLines(root, "alpha,beta")
    );
  });

  // The naming revision: a module package is named after its id. A name that
  // drifts from its id is refused while reading the inventory, before any
  // selection or cache lookup, so it can never reach a hash at all.
  it("refuses a package name that no longer matches its id", () => {
    const root = workspace(["alpha"]);

    writeFileSync(
      join(root, "packages/modules/alpha/package.json"),
      `${JSON.stringify({
        name: "@genie/module-alpha-renamed",
        genie: { module: { id: "alpha", entrypoint: "src/index.ts" } },
      })}\n`,
      "utf8"
    );

    expect(() => selectionLines(root, "alpha")).toThrow(
      /must be "@genie\/module-alpha"/
    );
  });

  it("changes when a selected module is renamed with its package", () => {
    const one = workspace(["alpha"]);
    const other = workspace(["gamma"]);

    expect(selectionLines(other, "gamma")).not.toBe(
      selectionLines(one, "alpha")
    );
  });

  it("changes when a selected entrypoint moves", () => {
    const root = workspace(["alpha"]);

    const before = selectionLines(root, "alpha");

    mkdirSync(join(root, "packages/modules/alpha/src/nested"), {
      recursive: true,
    });

    writeFileSync(
      join(root, "packages/modules/alpha/src/nested/index.ts"),
      "export {};\n",
      "utf8"
    );

    writeFileSync(
      join(root, "packages/modules/alpha/package.json"),
      `${JSON.stringify({
        name: "@genie/module-alpha",
        genie: { module: { id: "alpha", entrypoint: "src/nested/index.ts" } },
      })}\n`,
      "utf8"
    );

    expect(selectionLines(root, "alpha")).not.toBe(before);
  });

  // An unselected module contributes nothing, so editing one must not invalidate
  // the cache of a build that excluded it.
  it("ignores a module the selection excludes", () => {
    const root = workspace(["alpha", "beta"]);

    const before = selectionLines(root, "alpha");

    mkdirSync(join(root, "packages/modules/beta/src/nested"), {
      recursive: true,
    });

    writeFileSync(
      join(root, "packages/modules/beta/src/nested/index.ts"),
      "export {};\n",
      "utf8"
    );

    writeFileSync(
      join(root, "packages/modules/beta/package.json"),
      `${JSON.stringify({
        name: "@genie/module-beta",
        genie: { module: { id: "beta", entrypoint: "src/nested/index.ts" } },
      })}\n`,
      "utf8"
    );

    expect(selectionLines(root, "alpha")).toBe(before);
  });

  it("refuses an unknown id rather than printing a narrower selection", () => {
    const root = workspace(["alpha"]);

    expect(() => selectionLines(root, "alpha,gamma")).toThrow(
      /unknown module id: gamma/i
    );
  });
});

describe("the script Nx runs as a runtime input", () => {
  it("prints the same value the function returns, and exits zero", () => {
    const root = workspace(["alpha", "beta"]);

    const result = spawnSync(
      process.execPath,
      [SCRIPT],
      // The script reads the selection from its own environment, which is how Nx
      // invokes it: one fixed command, with MODULE_INCLUDE taken from the caller.
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, MODULE_INCLUDE: "beta" },
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(selectionLines(root, "beta"));
  });

  it("exits non-zero with the resolver's message on an invalid selection", () => {
    const root = workspace(["alpha"]);

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, MODULE_INCLUDE: "gamma" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/unknown module id: gamma/i);
    expect(result.stdout).toBe("");
  });

  it("treats an absent variable as unset, not as empty", () => {
    const root = workspace(["alpha"]);

    const env = { ...process.env };

    delete env.MODULE_INCLUDE;

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      encoding: "utf8",
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`"source":"unset"`);
  });
});
