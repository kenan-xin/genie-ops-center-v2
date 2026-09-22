import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The declared Storybook task graph, read from Nx itself.
 *
 * These are configuration assertions. They exist because the behavior they
 * describe is expensive to reproduce: the matrix in
 * `testing/selection-cache.test.ts` proves the behavior against real builds,
 * and this file fails fast and cheaply when an input or an output is dropped.
 *
 * The selection input is the same pre-hash contract `@genie/app` consumes
 * (`apps/genie/tools/build-graph.test.ts`). The raw `MODULE_INCLUDE` value
 * cannot tell an unset variable from an empty one, and the resolver calls those
 * opposite selections, so hashing it would let one selection restore the
 * other's build (bead `genie-ops-center-v2-2cg`).
 */
const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

const RUNTIME_INPUT = "node tools/generators/src/selection/print.ts";

/**
 * The actual story owners and the shared surfaces a story composes. Discovery
 * is data-driven, so a module is not a declared dependency of this host; these
 * globs are what makes a story, a component, a fixture, a token or a provider
 * change affect the host (R-41b).
 */
const OWNER_INPUTS = [
  "{workspaceRoot}/packages/ui/src/**/*",
  "{workspaceRoot}/packages/core/src/**/*",
  "{workspaceRoot}/packages/modules/*/src/**/*",
  // Discovery reads module package metadata, and a module is not a declared
  // dependency of this host, so its manifest and its TypeScript config are
  // inputs in their own right.
  "{workspaceRoot}/packages/modules/*/package.json",
  "{workspaceRoot}/packages/modules/*/tsconfig.json",
  "{workspaceRoot}/packages/config/src/**/*",
];

type Target = {
  readonly dependsOn?: readonly string[];
  readonly inputs?: readonly unknown[];
  readonly cache?: boolean;
  readonly outputs?: readonly string[];
  readonly continuous?: boolean;
  readonly metadata?: { readonly scriptContent?: string };
  readonly options?: { readonly command?: string };
};

// SAFETY: the bytes are Nx's own `show project --json` output, and every field
// read below is checked against an expected value in the cases themselves.
const project = JSON.parse(
  execFileSync(
    resolve(WORKSPACE_ROOT, "node_modules/.bin/nx"),
    ["show", "project", "@genie/storybook", "--json"],
    { cwd: WORKSPACE_ROOT, encoding: "utf8", env: { ...process.env } }
  )
) as { targets: Record<string, Target> };

const target = (name: string): Target => {
  const found = project.targets[name];

  if (found === undefined) {
    throw new Error(`@genie/storybook declares no ${name} target.`);
  }

  return found;
};

const inputsText = (name: string) => JSON.stringify(target(name).inputs ?? []);

/**
 * The named input's own definition. A target references it by name, so the
 * resolved project JSON holds `"storybookOwners"` rather than the globs; the
 * definition is read from `nx.json` where it is declared.
 */
// SAFETY: the bytes are this repository's own nx.json, and the field read below
// is checked against the expected globs in the case itself.
const namedInputs = (
  JSON.parse(readFileSync(join(WORKSPACE_ROOT, "nx.json"), "utf8")) as {
    namedInputs: Record<string, readonly string[]>;
  }
).namedInputs;

describe("the selection-aware Storybook task graph", () => {
  it("hashes the resolved selection on the build and the component tests", () => {
    for (const name of ["build-storybook", "test-storybook"]) {
      expect(
        inputsText(name).includes(JSON.stringify({ runtime: RUNTIME_INPUT })),
        `${name} misses the selection input`
      ).toBe(true);
    }
  });

  // The raw value it replaced cannot tell an unset variable from an empty one,
  // which is the defect this ticket's child closes.
  it("hashes no raw MODULE_INCLUDE value", () => {
    for (const name of ["build-storybook", "test-storybook"]) {
      expect(inputsText(name)).not.toContain("MODULE_INCLUDE");
    }
  });

  it("names the story-owner input on the build and the component tests", () => {
    for (const name of ["build-storybook", "test-storybook"]) {
      expect(inputsText(name), `${name} misses storybookOwners`).toContain(
        "storybookOwners"
      );
    }
  });

  it("covers every story owner and shared surface in that named input", () => {
    expect(namedInputs.storybookOwners).toEqual(
      expect.arrayContaining([...OWNER_INPUTS])
    );
  });

  it("declares the static output and caches the build", () => {
    expect(target("build-storybook").cache).toBe(true);
    expect(target("build-storybook").outputs).toContain(
      "{projectRoot}/storybook-static"
    );
  });

  // The watcher and the development server are not cacheable.
  it("never caches the serve or watch targets", () => {
    expect(target("storybook").cache).toBe(false);
    expect(target("storybook").continuous).toBe(true);
    expect(target("watch-deps").continuous).toBe(true);
  });

  // Unit and story collection are separate projects, so a story is never also
  // collected as a unit test and neither collection satisfies the other.
  it("keeps the unit and story collections in separate projects", () => {
    expect(target("test").metadata?.scriptContent).toContain("--project=unit");
    expect(target("test-storybook").options?.command).toContain(
      "--project=storybook"
    );
  });
});

describe("the customer runtime image and Storybook", () => {
  const dockerignore = readFileSync(
    join(WORKSPACE_ROOT, ".dockerignore"),
    "utf8"
  );

  const dockerfile = readFileSync(
    join(WORKSPACE_ROOT, "deploy/Dockerfile"),
    "utf8"
  );

  // S0-11 owns the real image matrix; this is the cheap guard that the host,
  // its stories and its static output stay out of the one Dockerfile's context.
  it("excludes the Storybook host, its stories and its static output", () => {
    for (const pattern of [
      "apps/storybook",
      "**/storybook-static",
      "**/*.stories.tsx",
    ]) {
      expect(dockerignore).toContain(pattern);
    }
  });

  it("never copies Storybook into the image", () => {
    expect(dockerfile.toLowerCase()).not.toContain("storybook");
  });
});
