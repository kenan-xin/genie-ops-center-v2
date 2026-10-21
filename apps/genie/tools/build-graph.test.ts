import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BUILD_STEPS } from "./build.ts";

/**
 * The declared selection-aware build graph, read from Nx itself.
 *
 * These are configuration assertions, and they exist because the behavior they
 * describe is expensive to reproduce: the matrix in
 * `testing/selection-cache.test.ts` proves the behavior, and this file fails
 * fast and cheaply when an input or an edge is dropped.
 */
const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

const RUNTIME_INPUT = "node tools/generators/src/selection/print.ts";

type Target = {
  readonly dependsOn?: readonly string[];
  readonly inputs?: readonly unknown[];
  readonly cache?: boolean;
  readonly outputs?: readonly string[];
};

// SAFETY: the bytes are Nx's own `show project --json` output, and every field
// read below is checked against an expected value in the cases themselves.
const project = JSON.parse(
  execFileSync(
    resolve(WORKSPACE_ROOT, "node_modules/.bin/nx"),
    ["show", "project", "@genie/app", "--json"],
    { cwd: WORKSPACE_ROOT, encoding: "utf8", env: { ...process.env } }
  )
) as { targets: Record<string, Target> };

const target = (name: string): Target => {
  const found = project.targets[name];

  if (found === undefined) {
    throw new Error(`@genie/app declares no ${name} target.`);
  }

  return found;
};

/**
 * The declared inputs, as Nx serialized them. The comparison is on the text
 * rather than on a narrowed shape: the question is whether this exact runtime
 * command is declared, and the resolved configuration is already JSON.
 */
const hasRuntimeInput = (name: string) =>
  JSON.stringify(target(name).inputs ?? []).includes(
    JSON.stringify({ runtime: RUNTIME_INPUT })
  );

describe("the selection-aware task graph", () => {
  it("generates the registry before the app is typechecked, tested or built", () => {
    for (const name of ["build", "typecheck", "test"]) {
      expect(target(name).dependsOn).toContain("generate-registry");
    }
  });

  it("builds before it prepares an image", () => {
    expect(target("build-image").dependsOn).toContain("build");
  });

  it("declares the generated registry as the generation output", () => {
    expect(target("generate-registry").outputs).toContain(
      "{projectRoot}/src/modules.ts"
    );

    expect(target("generate-registry").cache).toBe(true);
  });

  // Publishing an image is never cached.
  it("never caches the image target", () => {
    expect(target("build-image").cache).toBe(false);
  });

  /**
   * The load-bearing case. A consumer's hash is computed from the files on disk
   * before generation rewrites them, so a consumer that names only its files is
   * restored from the previous selection's cache entry. Measured on 2026-09-22:
   * with the input absent, `typecheck` reported "existing outputs match the
   * cache, left as is" after the selection changed from placeholder to empty.
   */
  it("hashes the resolved selection on every consumer, not only on generation", () => {
    for (const name of ["generate-registry", "build", "typecheck", "test"]) {
      expect(hasRuntimeInput(name), `${name} misses the selection input`).toBe(
        true
      );
    }
  });

  /**
   * One check before the bundler cannot settle which registry was bundled: the
   * bundler reads the file minutes later, and a second build in this checkout
   * can rewrite it in between. The check runs again after the bundler, so that
   * race fails the build instead of shipping another selection's bundle.
   */
  it("guards the registry on both sides of the bundler", () => {
    const steps = BUILD_STEPS.map(([command, args]) => `${command} ${args[0]}`);

    const bundler = steps.findIndex((step) => step === "next build");

    expect(bundler).toBeGreaterThan(0);
    expect(steps[bundler - 1]).toContain("check-registry");
    expect(steps[bundler + 1]).toContain("check-registry");
  });

  // The raw value it replaced cannot tell an unset variable from an empty one.
  it("hashes no raw MODULE_INCLUDE value", () => {
    for (const name of ["generate-registry", "build", "typecheck", "test"]) {
      expect(JSON.stringify(target(name).inputs ?? [])).not.toContain(
        "MODULE_INCLUDE"
      );
    }
  });
});
