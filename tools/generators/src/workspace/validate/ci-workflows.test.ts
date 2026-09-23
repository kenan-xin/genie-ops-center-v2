import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

const WORKFLOWS = ".github/workflows";

function read(relative: string): string {
  const path = join(WORKSPACE_ROOT, relative);

  if (!existsSync(path)) {
    throw new Error(`missing ${relative}`);
  }

  return readFileSync(path, "utf8");
}

type RootScripts = { readonly scripts?: Readonly<Record<string, string>> };

function rootScript(name: string): string {
  // SAFETY: the root manifest is this repository's own package.json; the two
  // fields read are checked for presence below.
  const manifest = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "package.json"), "utf8")
  ) as RootScripts;

  const script = manifest.scripts?.[name];

  if (script === undefined) throw new Error(`no root script ${name}`);

  return script;
}

/**
 * R-51's CI gates, held as a wiring check.
 *
 * The workflows cannot be executed here, so this asserts the exact triggers and
 * commands they must carry, and — the part that matters most — that no workflow
 * contains a bare `docker push`. Every publish goes through the customer or
 * development wrapper, which is the only place that smoke-checks the candidate
 * and pushes the exact smoke-tested identity.
 */
describe("the Spec 0 CI gates", () => {
  it("runs the pull-request gates on every pull request", () => {
    const workflow = read(`${WORKFLOWS}/pull-request.yml`);

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("pnpm run ci:pr");
  });

  it("runs the merge gates on develop, based on the pushed commit's parent", () => {
    const workflow = read(`${WORKFLOWS}/develop.yml`);

    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- develop");
    expect(workflow).toContain("pnpm run ci:develop");
    // `origin/develop` is HEAD on a develop push, so the base must be the
    // pushed commit's parent, with the all-zero first push falling back.
    expect(workflow).toContain("github.event.before");
    expect(workflow).toContain("NX_BASE");
    expect(workflow).toContain("0000000000000000000000000000000000000000");
    // The all-zero first push has no parent; basing it on `origin/develop` (which
    // is HEAD) would be an empty range, so it uses git's empty tree instead.
    expect(workflow).toContain("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  });

  it("builds one image per customer and falls back to the development image", () => {
    const workflow = read(`${WORKFLOWS}/release.yml`);

    expect(workflow).toContain("tags:");
    expect(workflow).toContain('- "v*"');
    expect(workflow).toContain("scripts/build-customer-image.sh");
    expect(workflow).toContain("scripts/build-development-image.sh");
    expect(workflow).toContain("--publish");
    expect(workflow).toContain("docker/login-action");
    expect(workflow).toContain("secrets.GITHUB_TOKEN");
    // The development fallback is the branch taken when no customer exists.
    expect(workflow).toContain("needs.discover.outputs.customers == '[]'");
  });

  it("never pushes an image except through the smoke-then-publish wrapper", () => {
    for (const name of ["pull-request", "develop", "release"]) {
      expect(read(`${WORKFLOWS}/${name}.yml`)).not.toContain("docker push");
    }

    // The wrapper itself is the one place that pushes, and it reads the
    // customer's modules.txt, builds, smoke-tests and only then publishes.
    const customer = read("scripts/build-customer-image.sh");

    expect(customer).toContain("cli.ts");
  });

  it("wires the root scripts the workflows call", () => {
    const pr = rootScript("ci:pr");

    for (const target of [
      "lint",
      "typecheck",
      "test",
      "build-storybook",
      "test-storybook",
      "test:integration",
    ]) {
      expect(pr, `ci:pr must run ${target}`).toContain(target);
    }

    expect(pr).toContain("validate");
    expect(rootScript("ci:develop")).toContain("test:e2e:fixture");
    expect(rootScript("ci:release:customer")).toContain(
      "scripts/build-customer-image.sh"
    );
    expect(rootScript("ci:release:development")).toContain(
      "scripts/build-development-image.sh"
    );
  });

  it("tracks the workflow and generator inputs the validate target reads", () => {
    // SAFETY: nx.json is this repository's own configuration.
    const config = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "nx.json"), "utf8")
    ) as {
      readonly namedInputs: {
        readonly default: readonly string[];
        readonly sharedGlobals: readonly string[];
      };
      readonly targetDefaults: {
        readonly validate: { readonly inputs: readonly string[] };
      };
    };

    const inputs = config.targetDefaults.validate.inputs;

    // The clean-checkout registry check shells out to the app generator, and
    // the module-has-tests and README checks read module packages; both must be
    // real inputs or a change can restore a stale validate result.
    expect(inputs).toContain("{workspaceRoot}/apps/genie/tools/**/*");
    expect(inputs).toContain("{workspaceRoot}/packages/modules/**/*");
    expect(inputs).toContain("{workspaceRoot}/.github/**");
  });
});
