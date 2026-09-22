import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { acquireBuildLock, lockPathFor, releaseBuildLock } from "./build.ts";
import { registryMismatch } from "./check-registry.ts";
import { generateRegistry, rootFromArgv } from "./generate-registry.ts";

/**
 * Two customer selections must never write each other's registry.
 *
 * The isolation is a build root, given to the generator as a parameter. Nothing
 * about the root is inferred, so a run cannot reach a root it was not handed.
 * Generation reads package metadata and writes text, so a staged root costs a
 * few files and no install.
 */
const GENERATE = new URL("./generate-registry.ts", import.meta.url).pathname;

const roots: string[] = [];

function stagedRoot(ids: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "genie-root-"));

  roots.push(root);

  mkdirSync(join(root, "apps/genie/src"), { recursive: true });

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

const registryIn = (root: string) =>
  readFileSync(join(root, "apps/genie/src/modules.ts"), "utf8");

const locks: string[] = [];

afterAll(() => {
  for (const lock of locks) releaseBuildLock(lock);

  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("the build root the registry is generated into", () => {
  it("takes the root from --root", () => {
    const root = stagedRoot(["alpha"]);

    expect(rootFromArgv(["--root", root], "/fallback")).toBe(root);
  });

  it("falls back when no root is named", () => {
    expect(rootFromArgv([], "/fallback")).toBe("/fallback");
  });

  it("refuses --root without a path rather than writing somewhere else", () => {
    expect(() => rootFromArgv(["--root"], "/fallback")).toThrow(/--root/);
    expect(() => rootFromArgv(["--root", "--other"], "/fallback")).toThrow(
      /--root/
    );
  });

  it("writes the registry inside the root it was given", () => {
    const root = stagedRoot(["alpha"]);

    generateRegistry(root, "alpha");

    expect(registryIn(root)).toContain(`from "@genie/module-alpha"`);
  });

  // The contamination case the ticket names: one revision, two customers, at
  // once. Neither run knows the other's root, so neither can overwrite it.
  it("keeps two concurrent selections out of each other's registry", async () => {
    const one = stagedRoot(["alpha", "beta"]);
    const other = stagedRoot(["alpha", "beta"]);

    const run = (root: string, moduleInclude: string) =>
      new Promise<number>((settle) => {
        const child = spawnSync(process.execPath, [GENERATE, "--root", root], {
          encoding: "utf8",
          env: { ...process.env, MODULE_INCLUDE: moduleInclude },
        });

        settle(child.status ?? 1);
      });

    const [first, second] = await Promise.all([
      run(one, "alpha"),
      run(other, "beta"),
    ]);

    expect([first, second]).toEqual([0, 0]);

    expect(registryIn(one)).toContain(`from "@genie/module-alpha"`);
    expect(registryIn(one)).not.toContain("module-beta");

    expect(registryIn(other)).toContain(`from "@genie/module-beta"`);
    expect(registryIn(other)).not.toContain("module-alpha");
  });
});

describe("the exclusive build marker", () => {
  /**
   * The hole the registry checks cannot cover: two builds in one checkout write
   * into one `.next`. Each can find its own registry intact at both boundaries
   * while the other is writing the same output tree, and the mixed tree is then
   * cached under a legitimate selection hash.
   */
  it("lets only one build own an application root", () => {
    const appRoot = join(stagedRoot(["alpha"]), "apps/genie");

    const held = acquireBuildLock(appRoot);

    locks.push(held);

    expect(() => acquireBuildLock(appRoot)).toThrow(
      /Another build already owns/
    );
  });

  it("names the root to build in instead of telling the caller to wait", () => {
    const appRoot = join(stagedRoot(["alpha"]), "apps/genie");

    locks.push(acquireBuildLock(appRoot));

    expect(() => acquireBuildLock(appRoot)).toThrow(/its own root/);
  });

  it("frees the root when the build finishes", () => {
    const appRoot = join(stagedRoot(["alpha"]), "apps/genie");

    releaseBuildLock(acquireBuildLock(appRoot));

    const again = acquireBuildLock(appRoot);

    locks.push(again);

    expect(again).toBe(lockPathFor(appRoot));
  });

  it("keeps two application roots independent", () => {
    const one = join(stagedRoot(["alpha"]), "apps/genie");
    const other = join(stagedRoot(["alpha"]), "apps/genie");

    locks.push(acquireBuildLock(one));
    locks.push(acquireBuildLock(other));

    expect(lockPathFor(one)).not.toBe(lockPathFor(other));
  });

  // The marker must never travel in the build output, or a cache entry would
  // carry another run's identity back into a later checkout.
  it("keeps the marker out of the repository and out of the build output", () => {
    const appRoot = join(stagedRoot(["alpha"]), "apps/genie");

    expect(lockPathFor(appRoot).startsWith(tmpdir())).toBe(true);
  });
});

describe("the guard between generation and the bundle", () => {
  it("passes on the registry the selection generates", () => {
    const root = stagedRoot(["alpha", "beta"]);

    generateRegistry(root, "alpha");

    expect(registryMismatch(root, "alpha")).toBeUndefined();
  });

  // A registry left by another customer's run, restored for another hash, or
  // edited by hand must never be bundled.
  it("fails on a registry generated for another selection", () => {
    const root = stagedRoot(["alpha", "beta"]);

    generateRegistry(root, "beta");

    expect(registryMismatch(root, "alpha")).toMatch(/selection/i);
  });

  it("tells an unset selection from an explicitly empty one", () => {
    const root = stagedRoot(["alpha"]);

    generateRegistry(root, undefined);

    // Both resolve to the same imports here. Only the recorded source differs,
    // and the guard must still refuse.
    expect(registryMismatch(root, "alpha")).toMatch(/selection/i);

    generateRegistry(root, "");

    expect(registryMismatch(root, undefined)).toMatch(/selection/i);
  });

  it("fails on a hand-edited registry", () => {
    const root = stagedRoot(["alpha"]);

    generateRegistry(root, "alpha");

    const target = join(root, "apps/genie/src/modules.ts");

    writeFileSync(
      target,
      `${readFileSync(target, "utf8")}\n// edited\n`,
      "utf8"
    );

    expect(registryMismatch(root, "alpha")).toMatch(/selection/i);
  });

  it("fails when no registry was generated at all", () => {
    const root = stagedRoot(["alpha"]);

    expect(registryMismatch(root, "alpha")).toMatch(/no generated registry/i);
  });
});
