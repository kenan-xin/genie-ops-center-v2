import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

type NxConfig = {
  readonly targetDefaults: {
    readonly validate: { readonly inputs: readonly string[] };
  };
};

/** The validate target's declared inputs, read from the real nx.json. */
function validateInputs(): readonly string[] {
  // SAFETY: nx.json is a JSON object, and the assertions below fail loudly when
  // the validate target or its inputs array is absent.
  const config = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "nx.json"), "utf8")
  ) as NxConfig;

  return config.targetDefaults.validate.inputs;
}

describe("the validate target's inputs", () => {
  it("declares the whole-workspace ignore globs that decide which directories Nx treats as projects", () => {
    const inputs = validateInputs();

    // The exact globs, not a looser shape: a subtree-only spelling such as
    // `{workspaceRoot}/.beads/**/.gitignore` also starts at the root, contains
    // `**` and ends in the filename, yet omits the root file and every nested
    // ignore file outside `.beads`. `**/` is what reaches all of them.
    expect(inputs).toContain("{workspaceRoot}/**/.gitignore");
    expect(inputs).toContain("{workspaceRoot}/**/.nxignore");
  });

  it("declares no workspace-wide vitest config glob, which no check reads", () => {
    const inputs = validateInputs();

    // `validate` reads the generator's own configs through `{projectRoot}/**/*`.
    // A workspace-wide `vitest*.config.*` input only makes an unrelated project's
    // config edit miss the cache, so it must not come back.
    expect(
      inputs.filter((input) => input.startsWith("{workspaceRoot}/**/vitest"))
    ).toEqual([]);
  });

  it("excludes the module container README, which is not a project root", () => {
    const inputs = validateInputs();

    // `packages/*/README.md` also matches `packages/modules/README.md`, which no
    // check reads; only a module's own `packages/modules/<id>/README.md` is one.
    expect(inputs).toContain("!{workspaceRoot}/packages/modules/README.md");
  });
});
